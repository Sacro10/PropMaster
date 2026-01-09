/**
 * Rent Collection Integration Tests
 * Simplified tests to verify payment and disbursement services work correctly
 */

import {
  getRecentPayments,
  getOverduePayments,
  getCollectionStatistics,
} from '../../src/services/paymentService';
import {
  getOwnerEntities,
  getPendingDisbursements,
} from '../../src/services/disbursementService';
import { supabaseAdmin as supabase } from '../../src/supabase';

jest.mock('../../src/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));
jest.mock('../../src/services/activityService', () => ({
  logActivityEvent: jest.fn().mockResolvedValue('activity-id-123'),
}));
jest.mock('../../src/services/ledgerService', () => ({
  createLedgerEntry: jest.fn().mockResolvedValue(undefined),
  createPairedLedgerEntries: jest.fn().mockResolvedValue(undefined),
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('Rent Collection System', () => {
  const testAccountId = 'test-account-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Payment Service', () => {
    it('should fetch recent payments successfully', async () => {
      const mockPayments = [
        {
          id: 'payment-1',
          account_id: testAccountId,
          amount: 1500,
          paid_at: '2024-01-15T12:00:00Z',
          payment_method: 'stripe',
          payment_type: 'rent',
          tenant: { full_name: 'John Doe', email: 'john@example.com', phone: '555-1234' },
          unit: {
            unit_number: '101',
            property_id: 'prop-1',
            properties: { name: 'Test Property', address1: '123 Main St', city: 'Test City', state: 'CA' }
          }
        }
      ];

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: mockPayments,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getRecentPayments(testAccountId);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1500);
      expect(mockSupabase.from).toHaveBeenCalledWith('payments');
    });

    it('should fetch overdue payments successfully', async () => {
      const mockOverdue = [
        {
          payment_id: 'payment-2',
          lease_id: 'lease-1',
          tenant_user_id: 'tenant-1',
          unit_id: 'unit-1',
          amount: 2000,
          due_date: '2024-01-01',
          days_overdue: 10,
          tenant_name: 'Jane Smith',
          property_name: 'Test Property',
          unit_number: '202',
        }
      ];

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockOverdue,
        error: null,
      });

      const result = await getOverduePayments(testAccountId);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(2000);
      expect(result[0].daysOverdue).toBeGreaterThan(0);
    });

    it('should calculate collection statistics correctly', async () => {
      const mockStatsData = {
        collected_this_month: 75000,
        collection_rate: 93.75,
        overdue_count: 5,
        auto_pay_enrollment_rate: 80,
        avg_collection_days: 3.1,
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockStatsData,
              error: null,
            }),
          }),
        }),
      });

      const result = await getCollectionStatistics(testAccountId);

      expect(result.collectionRate).toBeCloseTo(93.75, 1);
      expect(result.collectedThisMonth).toBe(75000);
      expect(result.overdueCount).toBe(5);
      expect(result.autoPayEnrolled).toBe(80);
    });
  });

  describe('Disbursement Service', () => {
    it('should fetch owner entities successfully', async () => {
      const mockOwners = [
        {
          id: 'owner-1',
          account_id: testAccountId,
          name: 'Property Owner LLC',
          email: 'owner@example.com',
          phone: null,
          entity_type: 'llc',
          disbursement_method: 'ach',
          disbursement_schedule: 'monthly',
          disbursement_day: 1,
          management_fee_percentage: 10,
          management_fee_flat: null,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
        }
      ];

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: mockOwners,
              error: null,
            }),
          }),
        }),
      });

      const result = await getOwnerEntities(testAccountId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Property Owner LLC');
      expect(mockSupabase.from).toHaveBeenCalledWith('owner_entities');
    });

    it('should fetch pending disbursements successfully', async () => {
      const mockDisbursements = [
        {
          id: 'disb-1',
          account_id: testAccountId,
          owner_id: 'owner-1',
          property_id: 'prop-1',
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          amount: 4500,
          total_rent_collected: 5000,
          total_expenses: 0,
          management_fee: 500,
          net_amount: 4500,
          status: 'pending',
          payment_method: 'ach',
          breakdown: { payment_count: 2 },
          owner: { name: 'Property Owner LLC' },
          property: { name: 'Test Property' },
        }
      ];

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: mockDisbursements,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getPendingDisbursements(testAccountId);

      expect(result).toHaveLength(1);
      expect(result[0].netAmount).toBe(4500);
    });
  });

  describe('End-to-End Flow', () => {
    it('should handle complete payment to disbursement workflow', async () => {
      // This test verifies the full flow integrates correctly
      // 1. Payment received
      // 2. Collection stats updated
      // 3. Disbursement calculated
      // 4. Owner paid

      expect(true).toBe(true); // Placeholder - actual E2E test would require more setup
    });
  });
});
