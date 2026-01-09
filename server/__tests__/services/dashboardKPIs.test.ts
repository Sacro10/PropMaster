/**
 * Unit tests for Dashboard KPI Calculations
 * Verifies correct calculation of all dashboard metrics
 */

import { getDashboardSummary } from '../../src/services/dashboardService';

// Mock Supabase client
jest.mock('../../src/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../src/supabase';

describe('Dashboard KPI Calculations', () => {
  const mockAccountId = 'test-account-123';
  const mockSupabase = supabase as jest.Mocked<typeof supabase>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Total Units and Occupancy', () => {
    it('should calculate total units correctly', async () => {
      const mockProperties = [
        { id: '1', total_units: 10, occupied_units: 8, status: 'active', account_id: mockAccountId },
        { id: '2', total_units: 5, occupied_units: 3, status: 'active', account_id: mockAccountId },
        { id: '3', total_units: 15, occupied_units: 12, status: 'active', account_id: mockAccountId },
      ];

      setupMocks({
        properties: mockProperties,
        payments: [],
        maintenanceRequests: [],
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'pro' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      expect(result.kpis.totalUnits).toBe(30); // 10 + 5 + 15
      expect(result.kpis.occupiedUnits).toBe(23); // 8 + 3 + 12
      expect(result.properties.occupancyRate).toBe(76.7); // (23/30) * 100 rounded to 1 decimal
    });

    it('should handle zero units correctly', async () => {
      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: [],
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      expect(result.kpis.totalUnits).toBe(0);
      expect(result.kpis.occupiedUnits).toBe(0);
      expect(result.properties.occupancyRate).toBe(0);
    });
  });

  describe('Monthly Revenue Calculations', () => {
    it('should calculate current month revenue from paid payments only', async () => {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const mockPayments = [
        {
          amount: 1500,
          status: 'paid',
          payment_date: currentMonthStart.toISOString().split('T')[0],
          account_id: mockAccountId
        },
        {
          amount: 2000,
          status: 'paid',
          payment_date: currentMonthStart.toISOString().split('T')[0],
          account_id: mockAccountId
        },
        {
          amount: 1000,
          status: 'pending',
          payment_date: currentMonthStart.toISOString().split('T')[0],
          account_id: mockAccountId
        },
      ];

      setupMocks({
        properties: [],
        payments: mockPayments,
        maintenanceRequests: [],
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      // Only paid payments count toward revenue
      expect(result.kpis.monthlyRevenue).toBe(3500); // 1500 + 2000
      expect(result.revenue.currentMonth).toBe(3500);
    });

    it('should calculate revenue change percentage correctly', async () => {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const mockPayments = [
        // Current month: 5000
        {
          amount: 5000,
          status: 'paid',
          payment_date: currentMonthStart.toISOString().split('T')[0],
          account_id: mockAccountId
        },
        // Previous month: 4000
        {
          amount: 4000,
          status: 'paid',
          payment_date: previousMonthStart.toISOString().split('T')[0],
          account_id: mockAccountId
        },
      ];

      setupMocks({
        properties: [],
        payments: mockPayments,
        maintenanceRequests: [],
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      // (5000 - 4000) / 4000 * 100 = 25%
      expect(result.revenue.percentChange).toBe(25);
    });
  });

  describe('Active Tenants Count', () => {
    it('should count only active tenants', async () => {
      const now = new Date();
      const mockTenants = [
        {
          id: '1',
          status: 'active',
          lease_start: '2024-01-01',
          lease_end: '2025-01-01',
          first_name: 'John',
          last_name: 'Doe',
          account_id: mockAccountId,
        },
        {
          id: '2',
          status: 'active',
          lease_start: '2024-01-01',
          lease_end: '2025-01-01',
          first_name: 'Jane',
          last_name: 'Smith',
          account_id: mockAccountId,
        },
        {
          id: '3',
          status: 'moved_out',
          lease_start: '2023-01-01',
          lease_end: '2024-01-01',
          first_name: 'Bob',
          last_name: 'Johnson',
          account_id: mockAccountId,
        },
      ];

      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: [],
        tenants: mockTenants,
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      expect(result.kpis.activeTenants).toBe(2);
      expect(result.tenants.total).toBe(2);
    });
  });

  describe('System Metrics', () => {
    it('should calculate average lease time correctly', async () => {
      const mockTenants = [
        {
          id: '1',
          lease_start: '2024-01-01',
          lease_end: '2024-12-31', // 365 days
          status: 'active',
          first_name: 'John',
          last_name: 'Doe',
          account_id: mockAccountId,
        },
        {
          id: '2',
          lease_start: '2024-01-01',
          lease_end: '2024-07-01', // ~182 days
          status: 'active',
          first_name: 'Jane',
          last_name: 'Smith',
          account_id: mockAccountId,
        },
      ];

      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: [],
        tenants: mockTenants,
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'premium' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      // Average should be around (365 + 182) / 2 = 273.5 rounded to 274
      expect(result.systemStatus.avgLeaseTime).toBeGreaterThan(250);
      expect(result.systemStatus.avgLeaseTime).toBeLessThan(300);
    });

    it('should set support availability based on plan', async () => {
      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: [],
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'premium' }],
      });

      const premiumResult = await getDashboardSummary(mockAccountId);
      expect(premiumResult.systemStatus.supportAvailable).toBe(true);

      jest.clearAllMocks();

      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: [],
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const basicResult = await getDashboardSummary(mockAccountId);
      expect(basicResult.systemStatus.supportAvailable).toBe(false);
    });

    it('should calculate eviction rate correctly', async () => {
      const mockTenants = [
        { id: '1', lease_start: '2024-01-01', lease_end: '2025-01-01', status: 'active', account_id: mockAccountId },
        { id: '2', lease_start: '2024-01-01', lease_end: '2025-01-01', status: 'active', account_id: mockAccountId },
        { id: '3', lease_start: '2023-01-01', lease_end: '2024-01-01', status: 'moved_out', account_id: mockAccountId },
      ];

      const mockActivityEvents = [
        {
          id: '1',
          event_type: 'lease_terminated',
          summary: 'Lease terminated due to eviction',
          created_at: new Date().toISOString(),
          account_id: mockAccountId,
        },
      ];

      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: [],
        tenants: mockTenants,
        activityEvents: mockActivityEvents,
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      // 1 eviction out of 3 total leases = 33.3%
      expect(result.systemStatus.evictionRate).toBeCloseTo(33.3, 1);
    });
  });

  describe('Maintenance Metrics', () => {
    it('should count open and in-progress maintenance requests', async () => {
      const mockMaintenanceRequests = [
        { id: '1', status: 'open', priority: 'high', created_at: new Date().toISOString(), account_id: mockAccountId },
        { id: '2', status: 'open', priority: 'urgent', created_at: new Date().toISOString(), account_id: mockAccountId },
        { id: '3', status: 'in_progress', priority: 'medium', created_at: new Date().toISOString(), account_id: mockAccountId },
        { id: '4', status: 'completed', priority: 'low', created_at: new Date().toISOString(), account_id: mockAccountId },
      ];

      setupMocks({
        properties: [],
        payments: [],
        maintenanceRequests: mockMaintenanceRequests,
        tenants: [],
        activityEvents: [],
        accounts: [{ id: mockAccountId, plan: 'basic' }],
      });

      const result = await getDashboardSummary(mockAccountId);

      expect(result.maintenance.open).toBe(2);
      expect(result.maintenance.inProgress).toBe(1);
      expect(result.maintenance.urgent).toBe(1);
    });
  });

  // Helper function to set up all mocks
  function setupMocks(data: {
    properties: any[];
    payments: any[];
    maintenanceRequests: any[];
    tenants: any[];
    activityEvents: any[];
    accounts: any[];
  }) {
    mockSupabase.from.mockImplementation((table: string) => {
      const baseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      switch (table) {
        case 'properties':
          baseChain.eq = jest.fn().mockResolvedValue({ data: data.properties, error: null });
          return baseChain as any;
        case 'payments':
          baseChain.lte = jest.fn().mockResolvedValue({ data: data.payments, error: null });
          return baseChain as any;
        case 'maintenance_requests':
          baseChain.gte = jest.fn().mockResolvedValue({ data: data.maintenanceRequests, error: null });
          baseChain.in = jest.fn().mockResolvedValue({ data: data.maintenanceRequests, error: null });
          return baseChain as any;
        case 'tenants':
          baseChain.eq = jest.fn().mockResolvedValue({ data: data.tenants, error: null });
          baseChain.gte = jest.fn().mockResolvedValue({ data: [], error: null, count: 0 });
          return baseChain as any;
        case 'activity_events':
          baseChain.limit = jest.fn().mockResolvedValue({ data: data.activityEvents, error: null });
          baseChain.ilike = jest.fn().mockResolvedValue({ data: data.activityEvents.filter(e => e.summary?.toLowerCase().includes('evict')), error: null });
          return baseChain as any;
        case 'accounts':
          baseChain.single = jest.fn().mockResolvedValue({ data: data.accounts[0], error: null });
          return baseChain as any;
        case 'hvac_program_enrollments':
          baseChain.lte = jest.fn().mockResolvedValue({ data: [], error: null });
          return baseChain as any;
        case 'reminder_schedules':
          baseChain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
          return baseChain as any;
        default:
          baseChain.eq = jest.fn().mockResolvedValue({ data: [], error: null });
          return baseChain as any;
      }
    });
  }
});
