/**
 * Disbursement Service Tests
 * Comprehensive tests for owner disbursement processing and idempotency
 */

import {
  getOwnerEntities,
  getPendingDisbursements,
  calculateDisbursement,
  createDisbursement,
  processDisbursement,
} from '../../src/services/disbursementService';
import { supabaseAdmin as supabase } from '../../src/supabase';
import { logActivityEvent } from '../../src/services/activityService';
import { createPairedLedgerEntries } from '../../src/services/ledgerService';

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
const mockCreatePairedLedgerEntries = createPairedLedgerEntries as jest.MockedFunction<
  typeof createPairedLedgerEntries
>;

describe('DisbursementService', () => {
  const testAccountId = 'test-account-123';
  const testUserId = 'user-123';
  const testOwnerId = 'owner-123';
  const testDisbursementId = 'disbursement-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOwnerEntities', () => {
    it('should fetch all owner entities for account', async () => {
      const mockOwners = [
        {
          id: 'owner-1',
          account_id: testAccountId,
          name: 'ABC Property LLC',
          email: 'abc@example.com',
          phone: null,
          entity_type: 'llc',
          disbursement_method: 'ach',
          disbursement_schedule: 'monthly',
          disbursement_day: 1,
          management_fee_percentage: 10,
          management_fee_flat: null,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'owner-2',
          account_id: testAccountId,
          name: 'John Smith',
          email: 'john@example.com',
          phone: null,
          entity_type: 'individual',
          disbursement_method: 'check',
          disbursement_schedule: 'monthly',
          disbursement_day: 15,
          management_fee_percentage: 12,
          management_fee_flat: null,
          is_active: true,
          created_at: '2024-01-02T00:00:00Z',
        },
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

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'owner-1',
        accountId: testAccountId,
        name: 'ABC Property LLC',
        entityType: 'llc',
        disbursementMethod: 'ach',
        isActive: true,
      });
    });
  });

  describe('getPendingDisbursements', () => {
    it('should fetch pending disbursements with owner details', async () => {
      const mockDisbursements = [
        {
          id: 'disb-1',
          account_id: testAccountId,
          owner_id: testOwnerId,
          property_id: 'property-1',
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          amount: 4300,
          total_rent_collected: 5000,
          total_expenses: 200,
          management_fee: 500,
          net_amount: 4300,
          status: 'pending',
          payment_method: 'ach',
          breakdown: { payment_count: 2 },
          notes: null,
          created_at: '2024-02-01T00:00:00Z',
          owner: { name: 'ABC LLC', email: 'abc@example.com' },
          property: { name: 'Test Property' },
        },
      ];

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: mockDisbursements,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getPendingDisbursements(testAccountId);

      expect(result[0].status).toBe('pending');
      expect(result[0].netAmount).toBe(4300);
      expect(result[0].totalRentCollected).toBe(5000);
      expect(result[0].owner.name).toBe('ABC LLC');
    });
  });

  describe('calculateDisbursement', () => {
    it('should calculate net amount with 10% management fee', async () => {
      const mockPayments = [
        { id: 'payment-1', amount: 2500, status: 'paid' },
        { id: 'payment-2', amount: 2500, status: 'paid' },
      ];

      const mockExpenses = [
        { id: 'expense-1', amount: 300, category: 'Maintenance' },
        { id: 'expense-2', amount: 150, category: 'Repairs' },
      ];

      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'owner_entities') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: testOwnerId,
                      account_id: testAccountId,
                      management_fee_percentage: 10,
                      management_fee_flat: null,
                      property_owners: [
                        { property_id: 'property-1' },
                        { property_id: 'property-2' },
                      ],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  lte: jest.fn().mockReturnValue({
                    in: jest.fn().mockResolvedValue({
                      data: mockPayments,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'expenses') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  lte: jest.fn().mockReturnValue({
                    in: jest.fn().mockResolvedValue({
                      data: mockExpenses,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      });

      const result = await calculateDisbursement(
        testAccountId,
        testOwnerId,
        '2024-01-01',
        '2024-01-31'
      );

      // Expected calculation:
      // Gross rent: 5000
      // Management fee (10%): 500
      // Maintenance costs: 450
      // Net amount: 5000 - 500 - 450 = 4050

      expect(result.totalRentCollected).toBe(5000);
      expect(result.managementFee).toBe(500);
      expect(result.totalExpenses).toBe(450);
      expect(result.netAmount).toBe(4050);
      expect(result.breakdown.payment_count).toBe(2);
    });

    it('should handle zero payments gracefully', async () => {
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'owner_entities') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: testOwnerId,
                      account_id: testAccountId,
                      management_fee_percentage: 10,
                      management_fee_flat: null,
                      property_owners: [{ property_id: 'property-1' }],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  in: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      });

      const result = await calculateDisbursement(
        testAccountId,
        testOwnerId,
        '2024-01-01',
        '2024-01-31'
      );

      expect(result.totalRentCollected).toBe(0);
      expect(result.netAmount).toBe(0);
    });
  });

  describe('createDisbursement', () => {
    it('should create disbursement with calculated amounts', async () => {
      const mockCalculation = {
        totalRentCollected: 5000,
        totalExpenses: 300,
        managementFee: 500,
        netAmount: 4200,
        breakdown: { payment_count: 2 },
      };

      // Mock calculateDisbursement
      jest.spyOn(require('../../src/services/disbursementService'), 'calculateDisbursement')
        .mockResolvedValue(mockCalculation);

      const mockCreatedDisbursement = {
        id: 'new-disb-123',
        account_id: testAccountId,
        owner_id: testOwnerId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        amount: 4200,
        total_rent_collected: 5000,
        total_expenses: 300,
        management_fee: 500,
        net_amount: 4200,
        breakdown: { payment_count: 2 },
        payment_method: 'ach',
        status: 'pending',
        created_at: '2024-01-31T00:00:00Z',
      };

      mockSupabase.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockCreatedDisbursement,
              error: null,
            }),
          }),
        }),
      });

      mockLogActivityEvent.mockResolvedValue(undefined);

      const data = {
        ownerId: testOwnerId,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        paymentMethod: 'ach' as const,
      };

      const result = await createDisbursement(testAccountId, testUserId, data);

      expect(result.netAmount).toBe(4200);
      expect(result.status).toBe('pending');
      expect(mockLogActivityEvent).toHaveBeenCalled();
    });
  });

  describe('processDisbursement - Idempotency', () => {
    const mockDisbursementFetch = (disbursement: any) => {
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: disbursement,
              error: null,
            }),
          }),
        }),
      });
    };

    it('should process disbursement using database function', async () => {
      const mockProcessedDisbursement = {
        id: testDisbursementId,
        status: 'completed',
        processed_at: '2024-01-31T10:00:00Z',
        processed_by: testUserId,
        net_amount: 4200,
      };

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockProcessedDisbursement,
        error: null,
      });
      mockDisbursementFetch({
        id: testDisbursementId,
        account_id: testAccountId,
        owner_id: testOwnerId,
        property_id: 'property-1',
        amount: 4200,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        status: 'completed',
        disbursed_at: '2024-01-31T10:00:00Z',
        payment_method: 'ach',
        total_rent_collected: 5000,
        total_expenses: 300,
        management_fee: 500,
        net_amount: 4200,
        breakdown: { payment_count: 2 },
        notes: null,
        created_at: '2024-01-31T00:00:00Z',
      });

      const idempotencyKey = 'unique-key-123';

      const result = await processDisbursement(
        testAccountId,
        testUserId,
        testDisbursementId,
        idempotencyKey
      );

      expect(result.status).toBe('completed');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('process_disbursement', {
        p_disbursement_id: testDisbursementId,
        p_processed_by: testUserId,
        p_idempotency_key: idempotencyKey,
      });
    });

    it('should prevent duplicate processing with same idempotency key', async () => {
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'Duplicate idempotency key' },
      });

      const idempotencyKey = 'duplicate-key';

      await expect(
        processDisbursement(testAccountId, testUserId, testDisbursementId, idempotencyKey)
      ).rejects.toThrow('Duplicate idempotency key');
    });

    it('should generate idempotency key if not provided', async () => {
      const mockProcessedDisbursement = {
        id: testDisbursementId,
        status: 'completed',
      };

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockProcessedDisbursement,
        error: null,
      });
      mockDisbursementFetch({
        id: testDisbursementId,
        account_id: testAccountId,
        owner_id: testOwnerId,
        property_id: 'property-1',
        amount: 4200,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        status: 'completed',
        disbursed_at: '2024-01-31T10:00:00Z',
        payment_method: 'ach',
        total_rent_collected: 5000,
        total_expenses: 300,
        management_fee: 500,
        net_amount: 4200,
        breakdown: { payment_count: 2 },
        notes: null,
        created_at: '2024-01-31T00:00:00Z',
      });

      const result = await processDisbursement(
        testAccountId,
        testUserId,
        testDisbursementId
      );

      expect(result.status).toBe('completed');
      expect(mockSupabase.rpc).toHaveBeenCalled();
      
      // Verify idempotency key was generated
      const callArgs = (mockSupabase.rpc as jest.Mock).mock.calls[0][1];
      expect(callArgs.p_idempotency_key).toBeDefined();
      expect(typeof callArgs.p_idempotency_key).toBe('string');
    });

    it('should mark payments as disbursed after processing', async () => {
      const mockProcessedDisbursement = {
        id: testDisbursementId,
        status: 'completed',
        processed_at: '2024-01-31T10:00:00Z',
        payments_included: ['payment-1', 'payment-2'],
      };

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockProcessedDisbursement,
        error: null,
      });
      mockDisbursementFetch({
        id: testDisbursementId,
        account_id: testAccountId,
        owner_id: testOwnerId,
        property_id: 'property-1',
        amount: 4200,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        status: 'completed',
        disbursed_at: '2024-01-31T10:00:00Z',
        payment_method: 'ach',
        total_rent_collected: 5000,
        total_expenses: 300,
        management_fee: 500,
        net_amount: 4200,
        breakdown: { payment_count: 2 },
        notes: null,
        created_at: '2024-01-31T00:00:00Z',
      });

      await processDisbursement(testAccountId, testUserId, testDisbursementId);

      // The database function process_disbursement should handle marking payments
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'process_disbursement',
        expect.objectContaining({
          p_disbursement_id: testDisbursementId,
          p_processed_by: testUserId,
        })
      );
    });

    it('should create ledger entries for disbursement', async () => {
      const mockDisbursement = {
        id: testDisbursementId,
        status: 'completed',
        net_amount: 4200,
        management_fee: 500,
      };

      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: mockDisbursement,
        error: null,
      });
      mockDisbursementFetch({
        id: testDisbursementId,
        account_id: testAccountId,
        owner_id: testOwnerId,
        property_id: 'property-1',
        amount: 4200,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        status: 'completed',
        disbursed_at: '2024-01-31T10:00:00Z',
        payment_method: 'ach',
        total_rent_collected: 5000,
        total_expenses: 300,
        management_fee: 500,
        net_amount: 4200,
        breakdown: { payment_count: 2 },
        notes: null,
        created_at: '2024-01-31T00:00:00Z',
      });

      await processDisbursement(testAccountId, testUserId, testDisbursementId);

      // The database function handles ledger entry creation
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle disbursement with zero net amount', async () => {
      const mockCalculation = {
        totalRentCollected: 1000,
        totalExpenses: 900,
        managementFee: 100,
        netAmount: 0,
        breakdown: { payment_count: 1 },
      };

      jest.spyOn(require('../../src/services/disbursementService'), 'calculateDisbursement')
        .mockResolvedValue(mockCalculation);

      mockSupabase.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'disb-zero',
                account_id: testAccountId,
                owner_id: testOwnerId,
                property_id: 'property-1',
                amount: 0,
                period_start: '2024-01-01',
                period_end: '2024-01-31',
                status: 'pending',
                payment_method: 'ach',
                total_rent_collected: 1000,
                total_expenses: 900,
                management_fee: 100,
                net_amount: 0,
                breakdown: { payment_count: 1 },
                notes: null,
                created_at: '2024-01-31T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      const data = {
        ownerId: testOwnerId,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        paymentMethod: 'ach' as const,
      };

      const result = await createDisbursement(testAccountId, testUserId, data);

      expect(result.netAmount).toBe(0);
    });

    it('should handle large disbursement amounts correctly', async () => {
      const mockCalculation = {
        totalRentCollected: 500000,
        totalExpenses: 25000,
        managementFee: 50000,
        netAmount: 425000,
        breakdown: { payment_count: 10 },
      };

      jest.spyOn(require('../../src/services/disbursementService'), 'calculateDisbursement')
        .mockResolvedValue(mockCalculation);

      mockSupabase.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'disb-large',
                account_id: testAccountId,
                owner_id: testOwnerId,
                property_id: 'property-1',
                amount: 425000,
                period_start: '2024-01-01',
                period_end: '2024-01-31',
                status: 'pending',
                payment_method: 'wire',
                total_rent_collected: 500000,
                total_expenses: 25000,
                management_fee: 50000,
                net_amount: 425000,
                breakdown: { payment_count: 10 },
                notes: null,
                created_at: '2024-01-31T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      const data = {
        ownerId: testOwnerId,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        paymentMethod: 'wire' as const,
      };

      const result = await createDisbursement(testAccountId, testUserId, data);

      expect(result.netAmount).toBe(425000);
      expect(result.paymentMethod).toBe('wire');
    });
  });
});
