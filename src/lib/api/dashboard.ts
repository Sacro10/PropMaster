/**
 * Dashboard API
 * Data access layer for dashboard metrics and overview
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError } from './client';
import { getCurrentMonthRange, getPreviousMonthRange, getStartOfWeek, getEndOfWeek } from '../utils/dateHelpers';

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
  type: 'maintenance' | 'tenant' | 'showing' | 'payment';
  title: string;
  property: string;
  time: string;
  status: 'completed' | 'pending' | 'urgent' | 'active';
}

export interface SystemMetrics {
  support_status: '24/7' | 'Business Hours';
  avg_lease_time_days: number;
  eviction_rate: number;
}

export interface UpcomingTask {
  task: string;
  property: string;
  due: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Get dashboard KPI metrics
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const currentMonth = getCurrentMonthRange();
    const previousMonth = getPreviousMonthRange();

    // Fetch all metrics in parallel
    const [unitsData, currentRevenueData, previousRevenueData, currentTenantsData, previousTenantsData] = await Promise.all([
      // Units data
      supabase
        .from('units')
        .select('status', { count: 'exact' })
        .eq('account_id', accountId),

      // Current month revenue
      supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('status', 'paid')
        .gte('paid_at', currentMonth.start.toISOString())
        .lte('paid_at', currentMonth.end.toISOString()),

      // Previous month revenue
      supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('status', 'paid')
        .gte('paid_at', previousMonth.start.toISOString())
        .lte('paid_at', previousMonth.end.toISOString()),

      // Current active tenants
      supabase
        .from('leases')
        .select('tenant_user_id', { count: 'exact' })
        .eq('account_id', accountId)
        .eq('status', 'active'),

      // Previous month active tenants (approximation)
      supabase
        .from('leases')
        .select('tenant_user_id', { count: 'exact' })
        .eq('account_id', accountId)
        .in('status', ['active', 'expired'])
        .lte('lease_start', previousMonth.end.toISOString()),
    ]);

    // Calculate units metrics
    const totalUnits = unitsData.count || 0;
    const occupiedUnits = (unitsData.data || []).filter(u => u.status === 'occupied').length;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // TODO: Get previous occupancy for accurate change calculation
    const occupancyChange = 0; // Placeholder

    // Calculate tenant metrics
    const activeTenants = currentTenantsData.count || 0;
    const previousTenants = previousTenantsData.count || 0;
    const tenantChange = previousTenants > 0 ? activeTenants - previousTenants : 0;

    // Calculate revenue metrics
    const currentRevenue = (currentRevenueData.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const previousRevenue = (previousRevenueData.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    return {
      total_units: totalUnits,
      occupied_units: occupiedUnits,
      occupancy_rate: Math.round(occupancyRate * 10) / 10,
      occupancy_change,
      active_tenants: activeTenants,
      tenant_change: tenantChange,
      monthly_revenue: currentRevenue,
      revenue_change: Math.round(revenueChange * 10) / 10,
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
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Fetch recent activities from different tables
    const [maintenanceData, leasesData, showingsData, paymentsData] = await Promise.all([
      // Recent maintenance requests
      supabase
        .from('maintenance_requests')
        .select('id, title, requested_at, status, units(unit_number, properties(name))')
        .eq('account_id', accountId)
        .order('requested_at', { ascending: false })
        .limit(limit),

      // Recent lease signings
      supabase
        .from('leases')
        .select('id, created_at, status, units(unit_number, properties(name))')
        .eq('account_id', accountId)
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent showings
      supabase
        .from('showings')
        .select('id, created_at, status, units(unit_number, properties(name))')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent payments
      supabase
        .from('payments')
        .select('id, paid_at, payment_type, status, unit_id, units(unit_number, properties(name))')
        .eq('account_id', accountId)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(limit),
    ]);

    const activities: RecentActivity[] = [];

    // Process maintenance requests
    if (maintenanceData.data) {
      maintenanceData.data.forEach((req: any) => {
        const unit = req.units || {};
        const property = unit.properties || {};
        activities.push({
          id: req.id,
          type: 'maintenance',
          title: req.title,
          property: `${property.name} #${unit.unit_number}`,
          time: req.requested_at,
          status: req.status === 'completed' ? 'completed' : req.priority === 'emergency' ? 'urgent' : 'pending',
        });
      });
    }

    // Process leases
    if (leasesData.data) {
      leasesData.data.forEach((lease: any) => {
        const unit = lease.units || {};
        const property = unit.properties || {};
        activities.push({
          id: lease.id,
          type: 'tenant',
          title: 'New Lease Signed',
          property: `${property.name} #${unit.unit_number}`,
          time: lease.created_at,
          status: lease.status === 'active' ? 'completed' : 'pending',
        });
      });
    }

    // Process showings
    if (showingsData.data) {
      showingsData.data.forEach((showing: any) => {
        const unit = showing.units || {};
        const property = unit.properties || {};
        activities.push({
          id: showing.id,
          type: 'showing',
          title: 'Property Viewing Scheduled',
          property: `${property.name} #${unit.unit_number}`,
          time: showing.created_at,
          status: showing.status === 'completed' ? 'completed' : 'pending',
        });
      });
    }

    // Process payments
    if (paymentsData.data) {
      paymentsData.data.forEach((payment: any) => {
        const unit = payment.units || {};
        const property = unit.properties || {};
        activities.push({
          id: payment.id,
          type: 'payment',
          title: 'Rent Payment Received',
          property: `${property.name} #${unit.unit_number}`,
          time: payment.paid_at,
          status: 'completed',
        });
      });
    }

    // Sort by time and return top N
    return activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit);
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
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Fetch account plan for support status
    const { data: accountData } = await supabase
      .from('accounts')
      .select('plan')
      .eq('id', accountId)
      .single();

    const supportStatus = accountData?.plan === 'premium' ? '24/7' : 'Business Hours';

    // Calculate average lease time
    const { data: leasesData } = await supabase
      .from('leases')
      .select('lease_start, lease_end')
      .eq('account_id', accountId)
      .in('status', ['active', 'expired']);

    let avgLeaseTimeDays = 0;
    if (leasesData && leasesData.length > 0) {
      const totalDays = leasesData.reduce((sum, lease) => {
        const start = new Date(lease.lease_start);
        const end = new Date(lease.lease_end);
        const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);
      avgLeaseTimeDays = Math.round(totalDays / leasesData.length);
    }

    // Calculate eviction rate (simplified)
    const { data: tenantsData } = await supabase
      .from('tenant_profiles')
      .select('screening_notes, move_out_date')
      .eq('account_id', accountId);

    let evictionRate = 0;
    if (tenantsData && tenantsData.length > 0) {
      const evictions = tenantsData.filter(t =>
        t.move_out_date && t.screening_notes?.toLowerCase().includes('eviction')
      ).length;
      evictionRate = (evictions / tenantsData.length) * 100;
    }

    return {
      support_status: supportStatus,
      avg_lease_time_days: avgLeaseTimeDays,
      eviction_rate: Math.round(evictionRate * 10) / 10,
    };
  } catch (error) {
    console.error('[Dashboard API] Error fetching system metrics:', error);
    return {
      support_status: 'Business Hours',
      avg_lease_time_days: 0,
      eviction_rate: 0,
    };
  }
}

/**
 * Get upcoming tasks
 */
export async function getUpcomingTasks(): Promise<UpcomingTask[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const tasks: UpcomingTask[] = [];
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Lease renewals due soon
    const { data: renewalLeases } = await supabase
      .from('leases')
      .select('id, lease_end, units(properties(name))')
      .eq('account_id', accountId)
      .eq('status', 'active')
      .gte('lease_end', now.toISOString())
      .lte('lease_end', thirtyDaysFromNow.toISOString())
      .is('renewal_status', null);

    if (renewalLeases && renewalLeases.length > 0) {
      tasks.push({
        task: 'Lease Renewal Review',
        property: `${renewalLeases.length} properties`,
        due: 'This week',
        priority: 'high',
      });
    }

    // HVAC filter deliveries
    const { data: hvacDeliveries } = await supabase
      .from('hvac_filter_deliveries')
      .select('id, scheduled_for, units(properties(name))', { count: 'exact' })
      .eq('account_id', accountId)
      .eq('status', 'scheduled')
      .gte('scheduled_for', now.toISOString())
      .lte('scheduled_for', sevenDaysFromNow.toISOString());

    if (hvacDeliveries && hvacDeliveries.count && hvacDeliveries.count > 0) {
      tasks.push({
        task: 'HVAC Filter Delivery',
        property: `${hvacDeliveries.count} units`,
        due: 'Next 7 days',
        priority: 'medium',
      });
    }

    // Pending maintenance requests
    const { data: maintenanceRequests, count: maintenanceCount } = await supabase
      .from('maintenance_requests')
      .select('id', { count: 'exact' })
      .eq('account_id', accountId)
      .in('status', ['submitted', 'reviewed']);

    if (maintenanceCount && maintenanceCount > 0) {
      tasks.push({
        task: 'Pending Maintenance Requests',
        property: `${maintenanceCount} requests`,
        due: 'Review needed',
        priority: 'high',
      });
    }

    // Add a generic financial report task if it's near month end
    const daysUntilMonthEnd = 30 - now.getDate();
    if (daysUntilMonthEnd <= 7) {
      tasks.push({
        task: 'Financial Reports Due',
        property: 'All properties',
        due: `${daysUntilMonthEnd} days`,
        priority: 'high',
      });
    }

    return tasks;
  } catch (error) {
    console.error('[Dashboard API] Error fetching upcoming tasks:', error);
    return [];
  }
}
