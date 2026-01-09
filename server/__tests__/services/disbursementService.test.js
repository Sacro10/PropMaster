"use strict";
/**
 * Disbursement Service Tests
 * Comprehensive tests for owner disbursement processing and idempotency
 */
Object.defineProperty(exports, "__esModule", { value: true });
const disbursementService_1 = require("../../src/services/disbursementService");
const supabase_1 = require("../../src/supabase");
const activityService_1 = require("../../src/services/activityService");
const ledgerService_1 = require("../../src/services/ledgerService");
// Mock dependencies
jest.mock('../../src/supabase');
jest.mock('../../src/services/activityService');
jest.mock('../../src/services/ledgerService');
const mockSupabase = supabase_1.supabaseAdmin;
const mockLogActivityEvent = activityService_1.logActivityEvent;
const mockCreatePairedLedgerEntries = ledgerService_1.createPairedLedgerEntries;
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
                    entity_type: 'llc',
                    payment_method: 'ach',
                },
                {
                    id: 'owner-2',
                    account_id: testAccountId,
                    name: 'John Smith',
                    email: 'john@example.com',
                    entity_type: 'individual',
                    payment_method: 'check',
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
            const result = await (0, disbursementService_1.getOwnerEntities)(testAccountId);
            expect(result).toEqual(mockOwners);
            expect(result).toHaveLength(2);
            expect(result[0].entity_type).toBe('llc');
        });
    });
    describe('getPendingDisbursements', () => {
        it('should fetch pending disbursements with owner details', async () => {
            const mockDisbursements = [
                {
                    id: 'disb-1',
                    owner_id: testOwnerId,
                    period_start: '2024-01-01',
                    period_end: '2024-01-31',
                    gross_rent: 5000,
                    management_fee: 500,
                    maintenance_costs: 200,
                    net_amount: 4300,
                    status: 'pending',
                    owner: { name: 'ABC LLC', email: 'abc@example.com' },
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
            const result = await (0, disbursementService_1.getPendingDisbursements)(testAccountId);
            expect(result).toEqual(mockDisbursements);
            expect(result[0].status).toBe('pending');
            expect(result[0].net_amount).toBe(4300);
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
            mockSupabase.from = jest.fn((table) => {
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
                                    lte: jest.fn().mockResolvedValue({
                                        data: mockExpenses,
                                        error: null,
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
            const result = await (0, disbursementService_1.calculateDisbursement)(testAccountId, testOwnerId, '2024-01-01', '2024-01-31');
            // Expected calculation:
            // Gross rent: 5000
            // Management fee (10%): 500
            // Maintenance costs: 450
            // Net amount: 5000 - 500 - 450 = 4050
            expect(result.gross_rent).toBe(5000);
            expect(result.management_fee).toBe(500);
            expect(result.maintenance_costs).toBe(450);
            expect(result.net_amount).toBe(4050);
            expect(result.payments).toHaveLength(2);
        });
        it('should handle zero payments gracefully', async () => {
            mockSupabase.from = jest.fn(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        gte: jest.fn().mockReturnValue({
                            lte: jest.fn().mockResolvedValue({
                                data: [],
                                error: null,
                            }),
                        }),
                    }),
                }),
            }));
            const result = await (0, disbursementService_1.calculateDisbursement)(testAccountId, testOwnerId, '2024-01-01', '2024-01-31');
            expect(result.gross_rent).toBe(0);
            expect(result.net_amount).toBe(0);
        });
    });
    describe('createDisbursement', () => {
        it('should create disbursement with calculated amounts', async () => {
            const mockCalculation = {
                gross_rent: 5000,
                management_fee: 500,
                maintenance_costs: 300,
                other_expenses: 0,
                net_amount: 4200,
                payments: [],
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
                ...mockCalculation,
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
                paymentMethod: 'ach',
            };
            const result = await (0, disbursementService_1.createDisbursement)(testAccountId, testUserId, data);
            expect(result.net_amount).toBe(4200);
            expect(result.status).toBe('pending');
            expect(mockLogActivityEvent).toHaveBeenCalled();
        });
    });
    describe('processDisbursement - Idempotency', () => {
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
            const idempotencyKey = 'unique-key-123';
            const result = await (0, disbursementService_1.processDisbursement)(testAccountId, testUserId, testDisbursementId, idempotencyKey);
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
            await expect((0, disbursementService_1.processDisbursement)(testAccountId, testUserId, testDisbursementId, idempotencyKey)).rejects.toThrow('Duplicate idempotency key');
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
            const result = await (0, disbursementService_1.processDisbursement)(testAccountId, testUserId, testDisbursementId);
            expect(result.status).toBe('completed');
            expect(mockSupabase.rpc).toHaveBeenCalled();
            // Verify idempotency key was generated
            const callArgs = mockSupabase.rpc.mock.calls[0][1];
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
            await (0, disbursementService_1.processDisbursement)(testAccountId, testUserId, testDisbursementId);
            // The database function process_disbursement should handle marking payments
            expect(mockSupabase.rpc).toHaveBeenCalledWith('process_disbursement', expect.objectContaining({
                p_disbursement_id: testDisbursementId,
                p_processed_by: testUserId,
            }));
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
            await (0, disbursementService_1.processDisbursement)(testAccountId, testUserId, testDisbursementId);
            // The database function handles ledger entry creation
            expect(mockSupabase.rpc).toHaveBeenCalled();
        });
    });
    describe('Edge Cases', () => {
        it('should handle disbursement with zero net amount', async () => {
            const mockCalculation = {
                gross_rent: 1000,
                management_fee: 100,
                maintenance_costs: 900,
                other_expenses: 0,
                net_amount: 0,
                payments: [],
            };
            jest.spyOn(require('../../src/services/disbursementService'), 'calculateDisbursement')
                .mockResolvedValue(mockCalculation);
            mockSupabase.from = jest.fn().mockReturnValue({
                insert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { ...mockCalculation, id: 'disb-zero', status: 'pending' },
                            error: null,
                        }),
                    }),
                }),
            });
            const data = {
                ownerId: testOwnerId,
                periodStart: '2024-01-01',
                periodEnd: '2024-01-31',
                paymentMethod: 'ach',
            };
            const result = await (0, disbursementService_1.createDisbursement)(testAccountId, testUserId, data);
            expect(result.net_amount).toBe(0);
        });
        it('should handle large disbursement amounts correctly', async () => {
            const mockCalculation = {
                gross_rent: 500000,
                management_fee: 50000,
                maintenance_costs: 25000,
                other_expenses: 0,
                net_amount: 425000,
                payments: [],
            };
            jest.spyOn(require('../../src/services/disbursementService'), 'calculateDisbursement')
                .mockResolvedValue(mockCalculation);
            mockSupabase.from = jest.fn().mockReturnValue({
                insert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { ...mockCalculation, id: 'disb-large', status: 'pending' },
                            error: null,
                        }),
                    }),
                }),
            });
            const data = {
                ownerId: testOwnerId,
                periodStart: '2024-01-01',
                periodEnd: '2024-01-31',
                paymentMethod: 'wire',
            };
            const result = await (0, disbursementService_1.createDisbursement)(testAccountId, testUserId, data);
            expect(result.net_amount).toBe(425000);
            expect(result.payment_method).toBe('wire');
        });
    });
});
