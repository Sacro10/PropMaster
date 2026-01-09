"use strict";
/**
 * Payment Service Tests
 * Comprehensive tests for rent collection and payment tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
const paymentService_1 = require("../../src/services/paymentService");
const supabase_1 = require("../../src/supabase");
const activityService_1 = require("../../src/services/activityService");
// Mock dependencies
jest.mock('../../src/supabase');
jest.mock('../../src/services/activityService');
const mockSupabase = supabase_1.supabaseAdmin;
const mockLogActivityEvent = activityService_1.logActivityEvent;
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
                    tenant_id: testTenantId,
                    amount: 2500,
                    payment_date: '2024-01-15T10:00:00Z',
                    due_date: '2024-01-01T00:00:00Z',
                    payment_method: 'ACH',
                    status: 'paid',
                    created_at: '2024-01-15T10:00:00Z',
                    tenant: { id: testTenantId, name: 'John Doe', email: 'john@example.com' },
                    unit: { id: 'unit-1', unit_number: '101', property_id: 'property-1' },
                    property: { id: 'property-1', name: 'Sunset Apartments', address: '123 Main St' },
                },
            ];
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue({
                                data: mockPayments,
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            const result = await (0, paymentService_1.getRecentPayments)(testAccountId, 50);
            expect(result).toEqual(mockPayments);
            expect(mockSupabase.from).toHaveBeenCalledWith('payments');
        });
        it('should handle database errors gracefully', async () => {
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue({
                                data: null,
                                error: { message: 'Database error' },
                            }),
                        }),
                    }),
                }),
            });
            await expect((0, paymentService_1.getRecentPayments)(testAccountId)).rejects.toThrow('Database error');
        });
    });
    describe('getOverduePayments', () => {
        it('should fetch payments past due date with status pending or late', async () => {
            const mockOverduePayments = [
                {
                    id: 'payment-overdue-1',
                    lease_id: testLeaseId,
                    tenant_id: testTenantId,
                    amount: 1800,
                    due_date: '2023-12-01T00:00:00Z',
                    status: 'late',
                    days_overdue: 45,
                },
            ];
            mockSupabase.rpc = jest.fn().mockResolvedValue({
                data: mockOverduePayments,
                error: null,
            });
            const result = await (0, paymentService_1.getOverduePayments)(testAccountId);
            expect(result).toEqual(mockOverduePayments);
            expect(mockSupabase.rpc).toHaveBeenCalledWith('get_overdue_payments', {
                p_account_id: testAccountId,
            });
        });
        it('should calculate days overdue correctly', async () => {
            const mockPayments = [
                {
                    id: 'payment-1',
                    due_date: '2024-01-01T00:00:00Z',
                    days_overdue: 14,
                    status: 'late',
                },
            ];
            mockSupabase.rpc = jest.fn().mockResolvedValue({
                data: mockPayments,
                error: null,
            });
            const result = await (0, paymentService_1.getOverduePayments)(testAccountId);
            expect(result[0].days_overdue).toBe(14);
        });
    });
    describe('getCollectionStatistics', () => {
        it('should calculate collection rate from materialized view', async () => {
            const mockStats = [
                {
                    total_collected: 75000,
                    total_due: 80000,
                    collection_rate: 93.75,
                    overdue_count: 3,
                    overdue_amount: 5000,
                    auto_pay_count: 87,
                    manual_pay_count: 13,
                },
            ];
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: mockStats,
                        error: null,
                    }),
                }),
            });
            const result = await (0, paymentService_1.getCollectionStatistics)(testAccountId);
            expect(result.collection_rate).toBe(93.75);
            expect(result.total_collected).toBe(75000);
            expect(result.total_due).toBe(80000);
        });
        it('should fall back to calculation if view is empty', async () => {
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: [],
                        error: null,
                    }),
                }),
            });
            // Mock raw payment queries
            mockSupabase.from = jest.fn((table) => {
                if (table === 'collection_stats_by_account') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                    };
                }
                if (table === 'payments') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                in: jest.fn().mockResolvedValue({
                                    data: [{ amount: 2500 }, { amount: 1800 }],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === 'leases') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({
                                data: [{ rent_amount: 2500 }, { rent_amount: 1800 }],
                                error: null,
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
            const result = await (0, paymentService_1.getCollectionStatistics)(testAccountId);
            expect(result.total_collected).toBeGreaterThan(0);
            expect(result.collection_rate).toBeGreaterThanOrEqual(0);
            expect(result.collection_rate).toBeLessThanOrEqual(100);
        });
        it('should handle zero division in collection rate', async () => {
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: [
                            {
                                total_collected: 0,
                                total_due: 0,
                                collection_rate: 0,
                                overdue_count: 0,
                                overdue_amount: 0,
                                auto_pay_count: 0,
                                manual_pay_count: 0,
                            },
                        ],
                        error: null,
                    }),
                }),
            });
            const result = await (0, paymentService_1.getCollectionStatistics)(testAccountId);
            expect(result.collection_rate).toBe(0);
        });
    });
    describe('sendPaymentReminder', () => {
        it('should send reminder and log activity event', async () => {
            const mockPayment = {
                id: testPaymentId,
                lease_id: testLeaseId,
                tenant_id: testTenantId,
                amount: 2000,
                due_date: '2024-01-01T00:00:00Z',
                tenant: { id: testTenantId, name: 'Jane Smith', email: 'jane@example.com' },
            };
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: [mockPayment],
                        error: null,
                    }),
                }),
            });
            mockLogActivityEvent.mockResolvedValue(undefined);
            await (0, paymentService_1.sendPaymentReminder)(testPaymentId, testAccountId, testUserId);
            expect(mockLogActivityEvent).toHaveBeenCalledWith(testAccountId, testUserId, 'payment_reminder_sent', 'payment', testPaymentId, expect.objectContaining({
                tenant_name: 'Jane Smith',
                amount: 2000,
            }));
        });
        it('should throw error if payment not found', async () => {
            mockSupabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: [],
                        error: null,
                    }),
                }),
            });
            await expect((0, paymentService_1.sendPaymentReminder)(testAccountId, testUserId, 'nonexistent-payment')).rejects.toThrow('Payment not found');
        });
    });
    describe('recordPayment', () => {
        it('should create payment record with correct data', async () => {
            const paymentData = {
                lease_id: testLeaseId,
                tenant_id: testTenantId,
                amount: 2500,
                payment_date: '2024-01-15T00:00:00Z',
                due_date: '2024-01-01T00:00:00Z',
                payment_method: 'ACH',
                notes: 'January rent',
            };
            const mockCreatedPayment = {
                id: 'new-payment-123',
                ...paymentData,
                account_id: testAccountId,
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
            mockCreateActivityEvent.mockResolvedValue(undefined);
            const result = await (0, paymentService_1.recordPayment)(testAccountId, testUserId, paymentData);
            expect(result).toEqual(mockCreatedPayment);
            expect(mockSupabase.from).toHaveBeenCalledWith('payments');
            expect(mockCreateActivityEvent).toHaveBeenCalledWith(testAccountId, testUserId, 'payment_recorded', 'payment', 'new-payment-123', expect.objectContaining({ amount: 2500 }));
        });
        it('should handle duplicate payment errors', async () => {
            const paymentData = {
                lease_id: testLeaseId,
                tenant_id: testTenantId,
                amount: 2500,
                payment_date: '2024-01-15T00:00:00Z',
                due_date: '2024-01-01T00:00:00Z',
                payment_method: 'ACH',
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
            await expect((0, paymentService_1.recordPayment)(testAccountId, testUserId, paymentData)).rejects.toThrow('Duplicate payment');
        });
    });
});
