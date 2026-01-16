/**
 * Dashboard API
 * Data access layer for dashboard metrics and overview
 */

import { supabase } from '../supabaseClient';
import { fetchJsonWithRetry } from './client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface DashboardMetrics {
  total_units: number;
  occupied_units: number;
  occupancy_rate: number;
  occupancy_change: number;
  active_tenants: number;
  tenant_change: number;
  monthly_revenue: number;
  revenue_change: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  summary: string;
  timestamp: string;
}

export interface SystemMetrics {
  support_status: '24/7' | 'Business Hours';
  avg_lease_time_days: number;
  eviction_rate: number;
  occupancy_trend: 'up' | 'down' | 'stable';
}

export interface UpcomingTask {
  id: string;
  type: 'lease_renewal' | 'maintenance' | 'hvac_delivery' | 'inspection' | 'reminder';
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  relatedEntityId?: string;
  relatedEntityType?: string;
}

export interface DashboardSummary {
  kpis: {
    totalUnits: number;
    occupiedUnits: number;
    activeTenants: number;
    monthlyRevenue: number;
  };
  properties: {
    total: number;
    active: number;
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: number;
  };
  revenue: {
    currentMonth: number;
    previousMonth: number;
    percentChange: number;
    collectionRate: number;
  };
  maintenance: {
    open: number;
    inProgress: number;
    urgent: number;
    avgResolutionTime: number;
  };
  tenants: {
    total: number;
    moveIns: number;
    moveOuts: number;
    leasesExpiring: number;
  };
  systemStatus: {
    supportAvailable: boolean;
    avgLeaseTime: number;
    evictionRate: number;
    occupancyTrend: 'up' | 'down' | 'stable';
  };
  recentActivity: RecentActivity[];
  upcomingTasks: UpcomingTask[];
}

/**
 * Get access token for API requests
 */
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Mock dashboard data for when backend is unavailable
 */
function getMockDashboardSummary(): DashboardSummary {
  return {
    kpis: {
      totalUnits: 0,
      occupiedUnits: 0,
      activeTenants: 0,
      monthlyRevenue: 0,
    },
    properties: {
      total: 0,
      active: 0,
      totalUnits: 0,
      occupiedUnits: 0,
      occupancyRate: 0,
    },
    revenue: {
      currentMonth: 0,
      previousMonth: 0,
      percentChange: 0,
      collectionRate: 0,
    },
    maintenance: {
      open: 0,
      inProgress: 0,
      urgent: 0,
      avgResolutionTime: 0,
    },
    tenants: {
      total: 0,
      moveIns: 0,
      moveOuts: 0,
      leasesExpiring: 0,
    },
    systemStatus: {
      supportAvailable: false,
      avgLeaseTime: 0,
      evictionRate: 0,
      occupancyTrend: 'stable',
    },
    recentActivity: [],
    upcomingTasks: [],
  };
}

/**
 * Get complete dashboard summary from backend API
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const token = await getAccessToken();
    if (!token) {
      console.warn('[Dashboard API] No auth token - using mock data');
      return getMockDashboardSummary();
    }

    const url = `${API_URL}/api/dashboard/summary`;
    const response = await fetchJsonWithRetry<DashboardSummary | Record<string, unknown>>(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }, {
      cacheKey: `${url}|${token}`,
      cacheTtlMs: 15000,
      retries: 1,
    });

    if (!response.ok) {
      // Check if response is HTML (error page) instead of JSON
      if (response.contentType && response.contentType.includes('text/html')) {
        console.error('[Dashboard API] Received HTML instead of JSON - API server may not be running');
        console.warn('[Dashboard API] Using fallback mock data. Please start the backend server with: cd server && npm run dev');
        return getMockDashboardSummary();
      }

      const errorData = response.data || {};
      console.error('[Dashboard API] API error:', errorData);
      return getMockDashboardSummary();
    }

    return (response.data as DashboardSummary) || getMockDashboardSummary();
  } catch (error) {
    console.error('[Dashboard API] Error fetching summary:', error);

    // Return mock data for any error to prevent UI crash
    console.warn('[Dashboard API] Using fallback mock data - backend server is not available');
    console.warn('[Dashboard API] To fix: Start the backend server with: cd server && npm run dev');
    return getMockDashboardSummary();
  }
}

/**
 * Get current account ID from user session
 */
async function getCurrentAccountId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('[Dashboard API] Error fetching account ID:', error);
    return null;
  }

  return data?.account_id || null;
}

/**
 * Get dashboard KPI metrics directly from Supabase
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      console.warn('[Dashboard API] No account ID found');
      return {
        total_units: 0,
        occupied_units: 0,
        occupancy_rate: 0,
        occupancy_change: 0,
        active_tenants: 0,
        tenant_change: 0,
        monthly_revenue: 0,
        revenue_change: 0,
      };
    }

    // Get properties and units
    const { data: properties } = await supabase
      .from('properties')
      .select('id, total_units')
      .eq('account_id', accountId);

    const { data: units, error: unitsError } = await supabase
      .from('units')
      .select('status')
      .eq('account_id', accountId);

    if (unitsError) {
      console.error('[Dashboard API] Error fetching units:', unitsError);
    }

    const total_units = (units && units.length > 0)
      ? units.length
      : (properties?.reduce((sum, p) => sum + (p.total_units || 0), 0) || 0);
    const occupied_units = units?.filter((unit) => unit.status === 'occupied').length || 0;

    // Get tenant profiles for active tenant change calculations
    const { data: tenantProfiles, error: tenantsError } = await supabase
      .from('tenant_profiles')
      .select('created_at, move_out_date')
      .eq('account_id', accountId);

    if (tenantsError) {
      console.error('[Dashboard API] Error fetching tenant profiles:', tenantsError);
    }

    // Get leases for occupancy change calculations
    const { data: leases, error: leasesError } = await supabase
      .from('leases')
      .select('lease_start, lease_end, status')
      .eq('account_id', accountId);

    if (leasesError) {
      console.error('[Dashboard API] Error fetching leases:', leasesError);
    }

    // Get monthly revenue
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const { data: currentMonthPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .gte('paid_at', currentMonthStart.toISOString());

    const { data: previousMonthPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .gte('paid_at', previousMonthStart.toISOString())
      .lt('paid_at', currentMonthStart.toISOString());

    const monthly_revenue = currentMonthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const previous_revenue = previousMonthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const revenue_change = previous_revenue > 0 
      ? Math.round(((monthly_revenue - previous_revenue) / previous_revenue) * 100) 
      : 0;

    const isLeaseActiveOnDate = (lease: any, date: Date) => {
      if (!lease?.lease_start) return false;
      const start = new Date(lease.lease_start);
      const end = lease.lease_end ? new Date(lease.lease_end) : null;
      const status = String(lease.status || '').toLowerCase();
      return start <= date && (!end || end >= date) && (status === 'active' || status === 'pending');
    };

    const isTenantActiveOnDate = (tenant: any, date: Date) => {
      if (!tenant?.created_at) return false;
      const created = new Date(tenant.created_at);
      const movedOut = tenant.move_out_date ? new Date(tenant.move_out_date) : null;
      return created <= date && (!movedOut || movedOut > date);
    };

    const activeTenantsNow = (tenantProfiles || []).filter((tenant) => isTenantActiveOnDate(tenant, now)).length;
    const activeTenantsPrevious = (tenantProfiles || []).filter((tenant) => isTenantActiveOnDate(tenant, previousMonthEnd)).length;
    const tenant_change = activeTenantsNow - activeTenantsPrevious;

    const occupiedFromLeasesNow = (leases || []).filter((lease) => isLeaseActiveOnDate(lease, now)).length;
    const occupiedFromLeasesPrevious = (leases || []).filter((lease) => isLeaseActiveOnDate(lease, previousMonthEnd)).length;
    const effectiveOccupiedNow = occupied_units > 0 ? occupied_units : occupiedFromLeasesNow;
    const occupancy_rate = total_units > 0 ? Math.round((effectiveOccupiedNow / total_units) * 100) : 0;
    const previousOccupancyRate = total_units > 0
      ? Math.round((occupiedFromLeasesPrevious / total_units) * 100)
      : 0;
    const occupancy_change = previousOccupancyRate > 0
      ? Math.round(((occupancy_rate - previousOccupancyRate) / previousOccupancyRate) * 100)
      : 0;

    return {
      total_units,
      occupied_units: effectiveOccupiedNow,
      occupancy_rate,
      occupancy_change,
      active_tenants: activeTenantsNow,
      tenant_change,
      monthly_revenue,
      revenue_change,
    };
  } catch (error) {
    console.error('[Dashboard API] Error fetching metrics:', error);
    return {
      total_units: 0,
      occupied_units: 0,
      occupancy_rate: 0,
      occupancy_change: 0,
      active_tenants: 0,
      tenant_change: 0,
      monthly_revenue: 0,
      revenue_change: 0,
    };
  }
}

/**
 * Get recent activity across all modules
 */
export async function getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
  try {
    const summary = await getDashboardSummary();
    return summary.recentActivity.slice(0, limit);
  } catch (error) {
    console.error('[Dashboard API] Error fetching recent activity:', error);
    return [];
  }
}

/**
 * Get system metrics
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    const summary = await getDashboardSummary();

    return {
      support_status: summary.systemStatus.supportAvailable ? '24/7' : 'Business Hours',
      avg_lease_time_days: summary.systemStatus.avgLeaseTime,
      eviction_rate: summary.systemStatus.evictionRate,
      occupancy_trend: summary.systemStatus.occupancyTrend,
    };
  } catch (error) {
    console.error('[Dashboard API] Error fetching system metrics:', error);
    return {
      support_status: 'Business Hours',
      avg_lease_time_days: 0,
      eviction_rate: 0,
      occupancy_trend: 'stable',
    };
  }
}

/**
 * Get upcoming tasks
 */
export async function getUpcomingTasks(): Promise<UpcomingTask[]> {
  try {
    const summary = await getDashboardSummary();
    return summary.upcomingTasks;
  } catch (error) {
    console.error('[Dashboard API] Error fetching upcoming tasks:', error);
    return [];
  }
}
