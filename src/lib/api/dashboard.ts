/**
 * Dashboard API
 * Data access layer for dashboard metrics and overview
 */

import { supabase } from '../supabaseClient';

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
 * Get complete dashboard summary from backend API
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}/api/dashboard/summary`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch dashboard summary: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Dashboard API] Error fetching summary:', error);
    throw error;
  }
}

/**
 * Get dashboard KPI metrics
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    const summary = await getDashboardSummary();

    return {
      total_units: summary.kpis.totalUnits,
      occupied_units: summary.kpis.occupiedUnits,
      occupancy_rate: summary.properties.occupancyRate,
      occupancy_change: 0, // Can be calculated from occupancy trend
      active_tenants: summary.kpis.activeTenants,
      tenant_change: summary.tenants.moveIns - summary.tenants.moveOuts,
      monthly_revenue: summary.kpis.monthlyRevenue,
      revenue_change: summary.revenue.percentChange,
    };
  } catch (error) {
    console.error('[Dashboard API] Error fetching metrics:', error);
    throw error;
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
    throw error;
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
