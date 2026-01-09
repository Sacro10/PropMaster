/**
 * Payment Service Tests
 * Comprehensive tests for rent collection and payment tracking
 */

import {
  getRecentPayments,
  getOverduePayments,
  getCollectionStatistics,
  sendPaymentReminder,
  recordPayment,
} from '../../src/services/paymentService';
import { supabaseAdmin as supabase } from '../../src/supabase';
import { logActivityEvent } from '../../src/services/activityService';
import { createLedgerEntry } from '../../src/services/ledgerService';

// Mock dependencies
jest.mock('../../src/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));
jest.mock('../../src/services/activityService');
jest.mock('../../src/services/ledgerService');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockLogActivityEvent = logActivityEvent as jest.MockedFunction<typeof logActivityEvent>;
const mockCreateLedgerEntry = createLedgerEntry as jest.MockedFunction<typeof createLedgerEntry>;

describe('PaymentService', () => {
  const testAccountId = 'test-account-123';
  const testPaymentId = 'payment-123';
  const testLeaseId = 'lease-123';
  const testTenantId = 'tenant-123';
  const testUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentPayments', () => {
    it('should fetch recent payments with tenant, unit, and property details', async () => {
      const mockPayments = [
        {
          id: 'payment-1',
          lease_id: testLeaseId,
          tenant_user_id: testTenantId,
          unit_id: 'unit-1',
          account_id: testAccountId,
          amount: 2500,
          payment_type: 'rent',
          paid_at: '2024-01-15T10:00:00Z',
          due_date: '2024-01-01T00:00:00Z',
          payment_method: 'ach',
          status: 'paid',
          stripe_payment_intent_id: 'pi_123',
          check_number: null,
          transaction_id: 'txn_123',
          late_fee_assessed: 0,
          late_fee_waived: false,
          auto_pay_enabled: true,
          disbursed: false,
          disbursement_id: null,
          notes: null,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          tenant: { full_name: 'John Doe', email: 'john@example.com', phone: '555-1234' },
          unit: {
            unit_number: '101',
            property_id: 'property-1',
            properties: { name: 'Sunset Apartments', address1: '123 Main St', city: 'City', state: 'CA' },
          },
        },
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

      const result = await getRecentPayments(testAccountId, 50);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'payment-1',
        accountId: testAccountId,
        leaseId: testLeaseId,
        tenantUserId: testTenantId,
        unitId: 'unit-1',
        amount: 2500,
        paymentType: 'rent',
        paidAt: '2024-01-15T10:00:00Z',
        status: 'paid',
        paymentMethod: 'ach',
        tenant: { name: 'John Doe', email: 'john@example.com', phone: '555-1234' },
        unit: { unitNumber: '101', propertyId: 'property-1' },
        property: { name: 'Sunset Apartments', address: '123 Main St' },
      });
      expect(mockSupabase.from).toHaveBeenCalledWith('payments');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        }),
      });

      await expect(getRecentPayments(testAccountId)).rejects.toThrow('Database error');
    });
  });

  describe('getOverduePayments', () => {
    it('should fetch payments past due date with status pending or late', async () => {
      const mockOverduePayments = [
        {
          payment_id: 'payment-overdue-1',
          lease_id: testLeaseId,
          tenant_user_id: testTenantId,
          unit_id: 'unit-1',
          amount: 1800,
          due_date: '2023-12-01T00:00:00Z',
          days_overdue: 45,
          tenant_name: 'Jane Smith',
          property_name: 'Sunset Apartments',
          unit_number: '101',
        },
      ];

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockOverduePayments,
        error: null,
      });

      const result = await getOverduePayments(testAccountId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'payment-overdue-1',
        leaseId: testLeaseId,
        tenantUserId: testTenantId,
        unitId: 'unit-1',
        amount: 1800,
        dueDate: '2023-12-01T00:00:00Z',
        daysOverdue: 45,
        tenantName: 'Jane Smith',
        propertyName: 'Sunset Apartments',
        unitNumber: '101',
      });
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_overdue_payments', {
        p_account_id: testAccountId,
      });
    });

    it('should calculate days overdue correctly', async () => {
      const mockPayments = [
        {
          payment_id: 'payment-1',
          due_date: '2024-01-01T00:00:00Z',
          days_overdue: 14,
          tenant_name: 'John Doe',
          property_name: 'Test Property',
          unit_number: '101',
        },
      ];

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockPayments,
        error: null,
      });

      const result = await getOverduePayments(testAccountId);

      expect(result[0].daysOverdue).toBe(14);
    });
  });

  describe('getCollectionStatistics', () => {
    it('should calculate collection rate from materialized view', async () => {
      const mockStats = {
        collected_this_month: 75000,
        collection_rate: 93.75,
        overdue_count: 3,
        auto_pay_enrollment_rate: 72.5,
        avg_collection_days: 3.2,
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockStats,
              error: null,
            }),
          }),
        }),
      });

      const result = await getCollectionStatistics(testAccountId);

      expect(result.collectionRate).toBe(93.75);
      expect(result.collectedThisMonth).toBe(75000);
      expect(result.overdueCount).toBe(3);
      expect(result.autoPayEnrolled).toBe(72.5);
    });

    it('should fall back to calculation if view is empty', async () => {
      const createQuery = (data: any, count?: number) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: any) => resolve({ data, error: null, count }),
      });

      const paymentsResponses = [
        [{ amount: 2500 }, { amount: 1800 }], // collectedThisMonth
        [{ amount: 2500 }, { amount: 1800 }], // totalDue
        [{ due_date: '2024-01-01', paid_at: '2024-01-05' }], // avgCollectionTime
      ];
      let paymentsCall = 0;

      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'collection_stats_by_account') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'payments') {
          if (paymentsCall === 3) {
            paymentsCall += 1;
            return createQuery([], 2);
          }
          const data = paymentsResponses[paymentsCall] || [];
          paymentsCall += 1;
          return createQuery(data);
        }
        if (table === 'leases') {
          return createQuery([{ auto_pay_enabled: true }, { auto_pay_enabled: false }]);
        }
        return createQuery([]);
      });

      const result = await getCollectionStatistics(testAccountId);

      expect(result.collectedThisMonth).toBeGreaterThan(0);
      expect(result.collectionRate).toBeGreaterThanOrEqual(0);
      expect(result.collectionRate).toBeLessThanOrEqual(100);
    });

    it('should handle zero division in collection rate', async () => {
      const mockStats = {
        collected_this_month: 0,
        collection_rate: 0,
        overdue_count: 0,
        auto_pay_enrollment_rate: 0,
        avg_collection_days: 0,
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockStats,
              error: null,
            }),
          }),
        }),
      });

      const result = await getCollectionStatistics(testAccountId);

      expect(result.collectionRate).toBe(0);
    });
  });

  describe('sendPaymentReminder', () => {
    it('should send reminder and log activity event', async () => {
      const mockPayment = {
        id: testPaymentId,
        lease_id: testLeaseId,
        tenant_user_id: testTenantId,
        amount: 2000,
        due_date: '2024-01-01T00:00:00Z',
        tenant: { full_name: 'Jane Smith', email: 'jane@example.com', phone: '555-9876' },
        unit: { unit_number: '101', properties: { name: 'Test Property' } },
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockPayment,
                error: null,
              }),
            }),
          }),
        }),
      });

      mockLogActivityEvent.mockResolvedValue(undefined);
      mockCreateLedgerEntry.mockResolvedValue(undefined);

      await sendPaymentReminder(testAccountId, testUserId, testPaymentId);

      expect(mockLogActivityEvent).toHaveBeenCalledWith(
        testAccountId,
        testUserId,
        'payment_reminder_sent',
        'Payment reminder sent to Jane Smith',
        expect.objectContaining({
          entityType: 'payment',
          entityId: testPaymentId,
          metadata: expect.objectContaining({
            tenant_name: 'Jane Smith',
            amount: 2000,
          }),
        })
      );
    });

    it('should throw error if payment not found', async () => {
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      });

      await expect(
        sendPaymentReminder(testAccountId, testUserId, 'nonexistent-payment')
      ).rejects.toThrow('Payment not found');
    });
  });

  describe('recordPayment', () => {
    it('should create payment record with correct data', async () => {
      const paymentData = {
        leaseId: testLeaseId,
        tenantUserId: testTenantId,
        unitId: 'unit-1',
        amount: 2500,
        paymentType: 'rent',
        dueDate: '2024-01-01T00:00:00Z',
        paidAt: '2024-01-15T00:00:00Z',
        paymentMethod: 'ach',
        notes: 'January rent',
      };

      const mockCreatedPayment = {
        id: 'new-payment-123',
        account_id: testAccountId,
        lease_id: paymentData.leaseId,
        tenant_user_id: paymentData.tenantUserId,
        unit_id: paymentData.unitId,
        amount: paymentData.amount,
        payment_type: paymentData.paymentType,
        due_date: paymentData.dueDate,
        paid_at: paymentData.paidAt,
        payment_method: paymentData.paymentMethod,
        status: 'paid',
        created_at: '2024-01-15T00:00:00Z',
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockCreatedPayment,
              error: null,
            }),
          }),
        }),
      });

      mockLogActivityEvent.mockResolvedValue(undefined);

      const result = await recordPayment(testAccountId, testUserId, paymentData);

      expect(result).toMatchObject({
        id: 'new-payment-123',
        accountId: testAccountId,
        leaseId: testLeaseId,
        tenantUserId: testTenantId,
        unitId: 'unit-1',
        amount: 2500,
        paymentType: 'rent',
        dueDate: '2024-01-01T00:00:00Z',
        paidAt: '2024-01-15T00:00:00Z',
        status: 'paid',
        paymentMethod: 'ach',
      });
      expect(mockSupabase.from).toHaveBeenCalledWith('payments');
      expect(mockLogActivityEvent).toHaveBeenCalledWith(
        testAccountId,
        testUserId,
        'payment_recorded',
        'Payment recorded: $2500',
        expect.objectContaining({
          entityType: 'payment',
          entityId: 'new-payment-123',
        })
      );
    });

    it('should handle duplicate payment errors', async () => {
      const paymentData = {
        leaseId: testLeaseId,
        tenantUserId: testTenantId,
        unitId: 'unit-1',
        amount: 2500,
        paymentType: 'rent',
        dueDate: '2024-01-01T00:00:00Z',
        paidAt: '2024-01-15T00:00:00Z',
        paymentMethod: 'ach',
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: '23505', message: 'Duplicate payment' },
            }),
          }),
        }),
      });

      await expect(recordPayment(testAccountId, testUserId, paymentData)).rejects.toThrow(
        'Duplicate payment'
      );
    });
  });
});
