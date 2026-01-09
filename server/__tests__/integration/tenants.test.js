"use strict";
/**
 * Integration test for Tenants API endpoint
 * Tests authentication, RBAC, and org_id scoping
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const tenants_1 = __importDefault(require("../../src/routes/tenants"));
// Mock dependencies
jest.mock('../../src/supabase');
jest.mock('../../src/middleware/auth');
jest.mock('../../src/middleware/rbac');
const auth_1 = require("../../src/middleware/auth");
const rbac_1 = require("../../src/middleware/rbac");
const supabase_1 = require("../../src/supabase");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/api/tenants', tenants_1.default);
describe('Integration: Tenants API', () => {
    const mockAccountId = 'test-account-123';
    const mockUserId = 'test-user-456';
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock authenticate middleware to pass through with user data
        auth_1.authenticate.mockImplementation((req, _res, next) => {
            req.user = {
                id: mockUserId,
                accountId: mockAccountId,
                role: 'manager',
                email: 'test@example.com',
            };
            next();
        });
        // Mock RBAC permission middleware to pass through
        Object.keys(rbac_1.Permissions).forEach((key) => {
            rbac_1.Permissions[key] = jest.fn((_req, _res, next) => next());
        });
    });
    describe('GET /api/tenants', () => {
        it('should return tenants for the authenticated user\'s account', async () => {
            const mockTenants = [
                {
                    id: 'tenant-1',
                    account_id: mockAccountId,
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@example.com',
                    unit_id: 'unit-1',
                    status: 'active',
                    lease_start: '2024-01-01',
                    lease_end: '2024-12-31',
                    rent_amount: 1500,
                    created_at: '2024-01-01T00:00:00Z',
                    unit: {
                        unit_number: '101',
                        property: {
                            name: 'Test Property',
                            address: '123 Main St',
                        },
                    },
                },
            ];
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                range: jest.fn().mockResolvedValue({
                    data: mockTenants,
                    error: null,
                    count: 1,
                }),
            };
            supabase_1.supabase.from.mockReturnValue(mockChain);
            const response = await (0, supertest_1.default)(app).get('/api/tenants');
            expect(response.status).toBe(200);
            expect(response.body.tenants).toHaveLength(1);
            expect(response.body.total).toBe(1);
            // Verify account scoping
            expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
        });
        it('should filter tenants by status', async () => {
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                range: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                    count: 0,
                }),
            };
            supabase_1.supabase.from.mockReturnValue(mockChain);
            await (0, supertest_1.default)(app).get('/api/tenants?status=active');
            // Verify filtering
            expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
            expect(mockChain.eq).toHaveBeenCalledWith('status', 'active');
        });
        it('should enforce authentication', async () => {
            // Override mock to simulate unauthenticated request
            auth_1.authenticate.mockImplementation((req, res, _next) => {
                res.status(401).json({ error: 'Authentication required' });
            });
            const response = await (0, supertest_1.default)(app).get('/api/tenants');
            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Authentication required');
        });
    });
    describe('GET /api/tenants/:id', () => {
        it('should return a single tenant from the user\'s account', async () => {
            const tenantId = 'tenant-123';
            const mockTenant = {
                id: tenantId,
                account_id: mockAccountId,
                first_name: 'John',
                last_name: 'Doe',
                email: 'john@example.com',
                unit_id: 'unit-1',
                status: 'active',
                lease_start: '2024-01-01',
                lease_end: '2024-12-31',
                rent_amount: 1500,
                created_at: '2024-01-01T00:00:00Z',
                unit: {
                    unit_number: '101',
                    property: {
                        name: 'Test Property',
                        address: '123 Main St',
                    },
                },
            };
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: mockTenant,
                    error: null,
                }),
            };
            supabase_1.supabase.from.mockReturnValue(mockChain);
            const response = await (0, supertest_1.default)(app).get(`/api/tenants/${tenantId}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(tenantId);
            // Verify account scoping
            expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
            expect(mockChain.eq).toHaveBeenCalledWith('id', tenantId);
        });
        it('should not return tenants from other accounts', async () => {
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' }, // Not found
                }),
            };
            supabase_1.supabase.from.mockReturnValue(mockChain);
            const response = await (0, supertest_1.default)(app).get('/api/tenants/other-account-tenant');
            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Tenant not found');
            // Verify the query was scoped to the user's account
            expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
        });
    });
    describe('POST /api/tenants', () => {
        it('should create a tenant in the user\'s account', async () => {
            const newTenantData = {
                unitId: 'unit-1',
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
                leaseStart: '2024-01-01',
                leaseEnd: '2024-12-31',
                rentAmount: 1600,
            };
            // Mock unit verification
            const mockUnitChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: { id: 'unit-1', property_id: 'property-1' },
                    error: null,
                }),
            };
            // Mock property verification
            const mockPropertyChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: { id: 'property-1' },
                    error: null,
                }),
            };
            // Mock tenant creation
            const mockTenantChain = {
                insert: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: {
                        id: 'new-tenant-id',
                        account_id: mockAccountId,
                        ...newTenantData,
                        status: 'active',
                        unit: {
                            unit_number: '101',
                            property: {
                                name: 'Test Property',
                                address: '123 Main St',
                            },
                        },
                    },
                    error: null,
                }),
            };
            supabase_1.supabase.from.mockImplementation((table) => {
                if (table === 'units')
                    return mockUnitChain;
                if (table === 'properties')
                    return mockPropertyChain;
                if (table === 'tenants')
                    return mockTenantChain;
                return mockTenantChain;
            });
            const response = await (0, supertest_1.default)(app).post('/api/tenants').send(newTenantData);
            expect(response.status).toBe(201);
            expect(response.body.firstName).toBe('Jane');
            // Verify property ownership check
            expect(mockPropertyChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
        });
        it('should reject creating tenants in units from other accounts', async () => {
            // Mock unit verification - unit not found or from another account
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Unit not found' },
                }),
            };
            supabase_1.supabase.from.mockReturnValue(mockChain);
            const response = await (0, supertest_1.default)(app).post('/api/tenants').send({
                unitId: 'other-account-unit',
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
                leaseStart: '2024-01-01',
                leaseEnd: '2024-12-31',
                rentAmount: 1600,
            });
            expect(response.status).toBe(500);
            expect(response.body.details).toContain('Unit not found');
        });
    });
});
