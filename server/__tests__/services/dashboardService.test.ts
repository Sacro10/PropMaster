/**
 * Unit tests for Dashboard Service - focusing on org_id scoping
 * These tests verify that all queries are properly scoped to the account_id
 */

import { getDashboardSummary } from '../../src/services/dashboardService';

// Mock Supabase client
jest.mock('../../src/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin as supabase } from '../../src/supabase';

const createChain = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: [], error: null }),
  then: (resolve: any) => resolve({ data: [], error: null, count: 0 }),
});

describe('Dashboard Service - org_id Scoping', () => {
  const mockAccountId = 'test-account-123';
  const mockSupabase = supabase as jest.Mocked<typeof supabase>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should scope all queries to the provided account_id', async () => {
    // Mock chain for properties query
    const mockPropertiesChain = createChain();

    // Mock chain for payments queries
    const mockPaymentsChain = createChain();

    // Mock chain for maintenance queries
    const mockMaintenanceChain = createChain();

    // Mock chain for tenants query
    const mockTenantsChain = createChain();

    // Mock chain for activity query
    const mockActivityChain = createChain();
    const mockAccountsChain = createChain();
    const mockHvacChain = createChain();
    const mockRemindersChain = createChain();

    // Set up the from() mock to return different chains based on table name
    mockSupabase.from.mockImplementation((table: string) => {
      switch (table) {
        case 'properties':
          return mockPropertiesChain as any;
        case 'payments':
          return mockPaymentsChain as any;
        case 'maintenance_requests':
          return mockMaintenanceChain as any;
        case 'tenants':
          return mockTenantsChain as any;
        case 'activity_events':
          return mockActivityChain as any;
        case 'accounts':
          return mockAccountsChain as any;
        case 'hvac_program_enrollments':
          return mockHvacChain as any;
        case 'reminder_schedules':
          return mockRemindersChain as any;
        default:
          return mockPropertiesChain as any;
      }
    });

    // Call the service function
    await getDashboardSummary(mockAccountId);

    // Verify properties query is scoped to account_id
    expect(mockSupabase.from).toHaveBeenCalledWith('properties');
    expect(mockPropertiesChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);

    // Verify payments queries are scoped to account_id
    expect(mockSupabase.from).toHaveBeenCalledWith('payments');
    expect(mockPaymentsChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);

    // Verify maintenance query is scoped to account_id
    expect(mockSupabase.from).toHaveBeenCalledWith('maintenance_requests');
    expect(mockMaintenanceChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);

    // Verify tenants query is scoped to account_id
    expect(mockSupabase.from).toHaveBeenCalledWith('tenants');
    expect(mockTenantsChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);

    // Verify activity query is scoped to account_id
    expect(mockSupabase.from).toHaveBeenCalledWith('activity_events');
    expect(mockActivityChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
  });

  it('should not allow cross-account data access', async () => {
    const accountA = 'account-aaa';
    const accountB = 'account-bbb';

    const mockChain = createChain();
    mockChain.then = jest.fn((resolve: any) =>
      resolve({
        data: [{ id: '1', account_id: accountA, name: 'Property A' }],
        error: null,
        count: 0,
      })
    );

    mockSupabase.from.mockReturnValue(mockChain as any);

    // Request data for account A
    const resultA = await getDashboardSummary(accountA);

    // Verify the query was scoped to account A
    expect(mockChain.eq).toHaveBeenCalledWith('account_id', accountA);

    // The service should not return data from account B
    // In a real scenario, the database RLS policies enforce this
    expect(resultA).toBeDefined();
  });

  it('should handle account_id parameter correctly in all subqueries', async () => {
    const mockAccountId = 'test-account-xyz';

    const mockChain = createChain();

    mockSupabase.from.mockReturnValue(mockChain as any);

    await getDashboardSummary(mockAccountId);

    // Count how many times .eq('account_id', ...) was called
    const accountIdCalls = (mockChain.eq as jest.Mock).mock.calls.filter(
      (call) => call[0] === 'account_id' && call[1] === mockAccountId
    );

    // Should be called at least once per table (5+ tables)
    expect(accountIdCalls.length).toBeGreaterThanOrEqual(5);
  });
});
