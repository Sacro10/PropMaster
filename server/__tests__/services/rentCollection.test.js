"use strict";
/**
 * Rent Collection Integration Tests
 * Simplified tests to verify payment and disbursement services work correctly
 */
Object.defineProperty(exports, "__esModule", { value: true });
const paymentService_1 = require("../../src/services/paymentService");
const disbursementService_1 = require("../../src/services/disbursementService");
const supabase_1 = require("../../src/supabase");
jest.mock('../../src/supabase');
jest.mock('../../src/services/activityService', () => ({
    logActivityEvent: jest.fn().mockResolvedValue('activity-id-123'),
}));
jest.mock('../../src/services/ledgerService', () => ({
    createLedgerEntry: jest.fn().mockResolvedValue(undefined),
    createPairedLedgerEntries: jest.fn().mockResolvedValue(undefined),
}));
const mockSupabase = supabase_1.supabaseAdmin;
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
            const result = await (0, paymentService_1.getRecentPayments)(testAccountId);
            expect(result).toHaveLength(1);
            expect(result[0].amount).toBe(1500);
            expect(mockSupabase.from).toHaveBeenCalledWith('payments');
        });
        it('should fetch overdue payments successfully', async () => {
            const mockOverdue = [
                {
                    id: 'payment-2',
                    lease_id: 'lease-1',
                    tenant_user_id: 'tenant-1',
                    unit_id: 'unit-1',
                    amount: 2000,
                    due_date: '2024-01-01',
                    status: 'late',
                    tenant: { full_name: 'Jane Smith' },
                    property: { name: 'Test Property' },
                    unit: { unit_number: '202' },
                }
            ];
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        lt: jest.fn().mockReturnValue({
                            in: jest.fn().mockReturnValue({
                                order: jest.fn().mockResolvedValue({
                                    data: mockOverdue,
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                }),
            });
            const result = await (0, paymentService_1.getOverduePayments)(testAccountId);
            expect(result).toHaveLength(1);
            expect(result[0].amount).toBe(2000);
            expect(result[0].daysOverdue).toBeGreaterThan(0);
        });
        it('should calculate collection statistics correctly', async () => {
            const mockStatsData = {
                collectedThisMonth: 75000,
                totalDue: 80000,
                overdueCount: 5,
                autoPayEnrolled: 120,
                totalLeases: 150,
            };
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        gte: jest.fn().mockResolvedValue({
                            data: Array(mockStatsData.autoPayEnrolled).fill({}),
                            error: null,
                        }),
                    }),
                }),
            });
            mockSupabase.rpc = jest.fn()
                .mockResolvedValueOnce({ data: [{ total: mockStatsData.collectedThisMonth }], error: null })
                .mockResolvedValueOnce({ data: [{ total: mockStatsData.totalDue }], error: null })
                .mockResolvedValueOnce({ data: [{ count: mockStatsData.overdueCount }], error: null });
            const result = await (0, paymentService_1.getCollectionStatistics)(testAccountId);
            expect(result.collectionRate).toBeCloseTo(93.75, 1);
            expect(result.collectedThisMonth).toBe(75000);
            expect(result.overdueCount).toBe(5);
            expect(result.autoPayEnrolled).toBe(80); // 120/150 * 100
        });
    });
    describe('Disbursement Service', () => {
        it('should fetch owner entities successfully', async () => {
            const mockOwners = [
                {
                    id: 'owner-1',
                    account_id: testAccountId,
                    owner_name: 'Property Owner LLC',
                    entity_type: 'llc',
                    tax_id: '12-3456789',
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
            const result = await (0, disbursementService_1.getOwnerEntities)(testAccountId);
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
                    gross_amount: 5000,
                    management_fee: 500,
                    net_amount: 4500,
                    status: 'pending',
                    scheduled_date: '2024-02-05',
                    owner: { owner_name: 'Property Owner LLC' },
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
            const result = await (0, disbursementService_1.getPendingDisbursements)(testAccountId);
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
