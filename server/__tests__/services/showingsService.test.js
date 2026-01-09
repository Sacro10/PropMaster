"use strict";
/**
 * Showings Service Tests
 * Tests for electronic property showings functionality
 */
Object.defineProperty(exports, "__esModule", { value: true });
const showingsService_1 = require("../../src/services/showingsService");
const supabase_1 = require("../../src/supabase");
const activityService_1 = require("../../src/services/activityService");
// Mock dependencies
jest.mock('../../src/supabase');
jest.mock('../../src/services/activityService');
describe('Showings Service', () => {
    const mockAccountId = 'test-account-id';
    const mockUserId = 'test-user-id';
    const mockShowingId = 'test-showing-id';
    const mockUnitId = 'test-unit-id';
    const mockPropertyId = 'test-property-id';
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('getShowings', () => {
        it('should fetch showings for an account with org scoping', async () => {
            const mockShowings = [
                {
                    id: mockShowingId,
                    account_id: mockAccountId,
                    unit_id: mockUnitId,
                    property_id: mockPropertyId,
                    showing_date: '2026-01-10T14:00:00Z',
                    duration_minutes: 30,
                    status: 'scheduled',
                    showing_type: 'self_guided',
                    visitor_name: 'John Doe',
                    visitor_email: 'john@example.com',
                    access_code: 'ABC12345',
                    created_at: '2026-01-08T10:00:00Z',
                    updated_at: '2026-01-08T10:00:00Z',
                    unit: { unit_number: '101', rent_amount: 1500 },
                    property: { name: 'Test Property', address: '123 Main St' },
                    showing_outcomes: [],
                },
            ];
            supabase_1.supabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            range: jest.fn().mockResolvedValue({
                                data: mockShowings,
                                error: null,
                                count: 1,
                            }),
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.getShowings)(mockAccountId, {});
            expect(supabase_1.supabase.from).toHaveBeenCalledWith('showings');
            expect(result.showings).toHaveLength(1);
            expect(result.showings[0].id).toBe(mockShowingId);
            expect(result.showings[0].showingType).toBe('self_guided');
            expect(result.total).toBe(1);
        });
        it('should filter showings by status', async () => {
            supabase_1.supabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            order: jest.fn().mockReturnValue({
                                range: jest.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                    count: 0,
                                }),
                            }),
                        }),
                    }),
                }),
            });
            await (0, showingsService_1.getShowings)(mockAccountId, { status: 'confirmed' });
            // Verify status filter was applied
            expect(supabase_1.supabase.from).toHaveBeenCalledWith('showings');
        });
    });
    describe('createShowing', () => {
        it('should create a showing with unique access code for self-guided', async () => {
            const mockUnit = { property_id: mockPropertyId };
            const mockProperty = { id: mockPropertyId };
            const mockAccessCode = 'UNIQUE123';
            // Mock unit lookup
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: mockUnit,
                            error: null,
                        }),
                    }),
                }),
            });
            // Mock property lookup
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: mockProperty,
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            // Mock access code generation
            supabase_1.supabase.rpc.mockResolvedValue({
                data: mockAccessCode,
                error: null,
            });
            // Mock showing insert
            const mockShowing = {
                id: mockShowingId,
                account_id: mockAccountId,
                unit_id: mockUnitId,
                property_id: mockPropertyId,
                showing_date: '2026-01-10T14:00:00Z',
                duration_minutes: 30,
                showing_type: 'self_guided',
                visitor_name: 'Jane Doe',
                visitor_email: 'jane@example.com',
                access_code: mockAccessCode,
                access_code_expires_at: '2026-01-10T14:30:00Z',
                status: 'scheduled',
                created_at: '2026-01-08T10:00:00Z',
                updated_at: '2026-01-08T10:00:00Z',
                unit: { unit_number: '102', rent_amount: 1600 },
                property: { name: 'Test Property', address: '456 Oak Ave' },
            };
            supabase_1.supabase.from.mockReturnValueOnce({
                insert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: mockShowing,
                            error: null,
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.createShowing)(mockAccountId, mockUserId, {
                unitId: mockUnitId,
                showingDate: '2026-01-10T14:00:00Z',
                showingType: 'self_guided',
                visitorName: 'Jane Doe',
                visitorEmail: 'jane@example.com',
            });
            expect(result.accessCode).toBe(mockAccessCode);
            expect(result.showingType).toBe('self_guided');
            expect(activityService_1.logActivityEvent).toHaveBeenCalledWith(mockAccountId, mockUserId, 'showing_scheduled', expect.stringContaining('Jane Doe'), expect.any(Object));
        });
        it('should not generate access code for agent-assisted showings', async () => {
            const mockUnit = { property_id: mockPropertyId };
            const mockProperty = { id: mockPropertyId };
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: mockUnit,
                            error: null,
                        }),
                    }),
                }),
            });
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: mockProperty,
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            const mockShowing = {
                id: mockShowingId,
                account_id: mockAccountId,
                showing_type: 'agent_assisted',
                access_code: null,
                unit: {},
                property: {},
            };
            supabase_1.supabase.from.mockReturnValueOnce({
                insert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: mockShowing,
                            error: null,
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.createShowing)(mockAccountId, mockUserId, {
                unitId: mockUnitId,
                showingDate: '2026-01-10T14:00:00Z',
                showingType: 'agent_assisted',
                visitorName: 'Bob Smith',
                visitorEmail: 'bob@example.com',
            });
            expect(result.accessCode).toBeNull();
            expect(supabase_1.supabase.rpc).not.toHaveBeenCalled();
        });
        it('should verify unit belongs to account (org scoping)', async () => {
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { property_id: mockPropertyId },
                            error: null,
                        }),
                    }),
                }),
            });
            // Property does NOT belong to account
            supabase_1.supabase.from.mockReturnValueOnce({
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
            await expect((0, showingsService_1.createShowing)(mockAccountId, mockUserId, {
                unitId: mockUnitId,
                showingDate: '2026-01-10T14:00:00Z',
                showingType: 'self_guided',
                visitorName: 'Test',
                visitorEmail: 'test@example.com',
            })).rejects.toThrow('Unit does not belong to your account');
        });
    });
    describe('regenerateAccessCode', () => {
        it('should generate a new unique access code', async () => {
            const mockShowing = {
                id: mockShowingId,
                showing_type: 'self_guided',
                showing_date: '2026-01-10T14:00:00Z',
                duration_minutes: 30,
            };
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: mockShowing,
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            const newAccessCode = 'NEWCODE1';
            supabase_1.supabase.rpc.mockResolvedValue({
                data: newAccessCode,
                error: null,
            });
            supabase_1.supabase.from.mockReturnValueOnce({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({
                            error: null,
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.regenerateAccessCode)(mockAccountId, mockUserId, mockShowingId);
            expect(result.accessCode).toBe(newAccessCode);
            expect(result.expiresAt).toBeTruthy();
            expect(activityService_1.logActivityEvent).toHaveBeenCalledWith(mockAccountId, mockUserId, 'showing_access_code_regenerated', expect.any(String), expect.any(Object));
        });
        it('should throw error for non-self-guided showings', async () => {
            supabase_1.supabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: {
                                    id: mockShowingId,
                                    showing_type: 'agent_assisted',
                                },
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            await expect((0, showingsService_1.regenerateAccessCode)(mockAccountId, mockUserId, mockShowingId)).rejects.toThrow('Access codes are only available for self-guided showings');
        });
    });
    describe('sendShowingReminder', () => {
        it('should send reminder and log activity event', async () => {
            const mockShowing = {
                id: mockShowingId,
                visitor_name: 'Test Visitor',
                visitor_email: 'visitor@example.com',
                visitor_phone: '555-1234',
                showing_date: '2026-01-10T14:00:00Z',
                access_code: 'TEST1234',
                showing_type: 'self_guided',
                unit: { unit_number: '101' },
                property: { name: 'Test Property', address: '123 Main' },
            };
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: mockShowing,
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            supabase_1.supabase.from.mockReturnValueOnce({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({
                            error: null,
                        }),
                    }),
                }),
            });
            await (0, showingsService_1.sendShowingReminder)(mockAccountId, mockUserId, mockShowingId);
            expect(activityService_1.logActivityEvent).toHaveBeenCalledWith(mockAccountId, mockUserId, 'showing_reminder_sent', expect.stringContaining('Test Visitor'), expect.objectContaining({
                entityType: 'showing',
                entityId: mockShowingId,
                metadata: expect.objectContaining({
                    visitor_name: 'Test Visitor',
                    access_code: 'TEST1234',
                }),
            }));
        });
    });
    describe('expireOldAccessCodes', () => {
        it('should call database function to expire codes', async () => {
            supabase_1.supabase.rpc.mockResolvedValue({
                data: 3,
                error: null,
            });
            const result = await (0, showingsService_1.expireOldAccessCodes)();
            expect(supabase_1.supabase.rpc).toHaveBeenCalledWith('expire_old_access_codes');
            expect(result).toBe(3);
        });
        it('should handle errors gracefully', async () => {
            supabase_1.supabase.rpc.mockResolvedValue({
                data: null,
                error: new Error('Database error'),
            });
            const result = await (0, showingsService_1.expireOldAccessCodes)();
            expect(result).toBe(0);
        });
    });
    describe('getShowingStatistics', () => {
        it('should fetch statistics from view', async () => {
            const mockStats = {
                account_id: mockAccountId,
                scheduled_today: 5,
                total_this_week: 12,
                avg_response_time_hours: 2.5,
                conversion_rate_percent: 35.5,
            };
            supabase_1.supabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({
                            data: mockStats,
                            error: null,
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.getShowingStatistics)(mockAccountId);
            expect(result.scheduled_today).toBe(5);
            expect(result.total_this_week).toBe(12);
            expect(result.avg_response_time).toBe('2.5');
            expect(result.conversion_rate).toBe('36');
        });
        it('should fallback to manual calculation if view fails', async () => {
            // Mock view error
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({
                            data: null,
                            error: new Error('View not found'),
                        }),
                    }),
                }),
            });
            // Mock manual query
            const mockShowings = [
                {
                    id: '1',
                    showing_date: new Date().toISOString(),
                    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    status: 'completed',
                    application_submitted: true,
                },
            ];
            supabase_1.supabase.from.mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        gte: jest.fn().mockResolvedValue({
                            data: mockShowings,
                            error: null,
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.getShowingStatistics)(mockAccountId);
            expect(result).toBeDefined();
            expect(result.scheduled_today).toBeGreaterThanOrEqual(0);
        });
    });
    describe('getAvailableUnits', () => {
        it('should fetch only vacant units for the account', async () => {
            const mockUnits = [
                {
                    id: mockUnitId,
                    unit_number: '101',
                    bedrooms: 2,
                    bathrooms: 1,
                    sqft: 850,
                    rent_amount: 1500,
                    status: 'vacant',
                    available_date: '2026-02-01',
                    property: {
                        id: mockPropertyId,
                        name: 'Test Complex',
                        address1: '123 Main St',
                        city: 'Test City',
                        state: 'TS',
                        zip: '12345',
                    },
                },
            ];
            supabase_1.supabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            order: jest.fn().mockResolvedValue({
                                data: mockUnits,
                                error: null,
                            }),
                        }),
                    }),
                }),
            });
            const result = await (0, showingsService_1.getAvailableUnits)(mockAccountId);
            expect(result).toHaveLength(1);
            expect(result[0].unit_number).toBe('101');
            expect(result[0].property.name).toBe('Test Complex');
        });
    });
});
