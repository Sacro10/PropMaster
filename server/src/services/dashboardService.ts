import { supabaseAdmin as supabase } from '../supabase';

function isMissingTable(error: any, tableName?: string) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  if (error.code === '42P01') return true;
  if (!tableName) return message.includes('does not exist');
  return message.includes(`"${tableName}"`) && message.includes('does not exist');
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
    moveIns: number; // This month
    moveOuts: number; // This month
    leasesExpiring: number; // Next 60 days
  };
  systemStatus: {
    supportAvailable: boolean;
    avgLeaseTime: number; // in days
    evictionRate: number; // percentage
    occupancyTrend: 'up' | 'down' | 'stable';
  };
  recentActivity: Array<{
    id: string;
    type: string;
    summary: string;
    timestamp: string;
  }>;
  upcomingTasks: Array<{
    id: string;
    type: 'lease_renewal' | 'maintenance' | 'hvac_delivery' | 'inspection' | 'reminder';
    title: string;
    dueDate: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    relatedEntityId?: string;
    relatedEntityType?: string;
  }>;
}

/**
 * Get comprehensive dashboard summary for an account
 * All queries are scoped to the provided accountId
 */
export async function getDashboardSummary(
  accountId: string
): Promise<DashboardSummary> {
  // Properties summary
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('*')
    .eq('account_id', accountId);

  if (propertiesError) throw propertiesError;

  const totalProperties = properties?.length || 0;
  const activeProperties =
    properties?.filter((p) =>
      typeof p.status === 'string' ? p.status === 'active' : true
    ).length || 0;

  const { data: units, error: unitsError } = await supabase
    .from('units')
    .select('id, status')
    .eq('account_id', accountId);

  if (unitsError) throw unitsError;

  const totalUnits = units?.length || 0;
  const occupiedUnits =
    units?.filter((unit) => unit.status === 'occupied').length || 0;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  // Revenue summary
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const { data: currentMonthPayments } = await supabase
    .from('payments')
    .select('amount, status')
    .eq('account_id', accountId)
    .gte('payment_date', currentMonthStart.toISOString().split('T')[0]);

  const { data: previousMonthPayments } = await supabase
    .from('payments')
    .select('amount, status')
    .eq('account_id', accountId)
    .gte('payment_date', previousMonthStart.toISOString().split('T')[0])
    .lte('payment_date', previousMonthEnd.toISOString().split('T')[0]);

  const currentMonth =
    currentMonthPayments
      ?.filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  const previousMonth =
    previousMonthPayments
      ?.filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  const percentChange =
    previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;

  const totalDue =
    currentMonthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const collectionRate = totalDue > 0 ? (currentMonth / totalDue) * 100 : 0;

  // Maintenance summary
  const { data: maintenanceRequests } = await supabase
    .from('maintenance_requests')
    .select('id, status, priority, created_at, updated_at')
    .eq('account_id', accountId)
    .in('status', ['open', 'in_progress', 'assigned']);

  const open = maintenanceRequests?.filter((m) => m.status === 'open').length || 0;
  const inProgress =
    maintenanceRequests?.filter((m) =>
      ['in_progress', 'assigned'].includes(m.status)
    ).length || 0;
  const urgent =
    maintenanceRequests?.filter((m) => m.priority === 'urgent').length || 0;

  // Calculate average resolution time from completed requests in the last 30 days
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: completedRequests } = await supabase
    .from('maintenance_requests')
    .select('created_at, updated_at')
    .eq('account_id', accountId)
    .eq('status', 'completed')
    .gte('updated_at', thirtyDaysAgo.toISOString());

  let avgResolutionTime = 0;
  if (completedRequests && completedRequests.length > 0) {
    const totalHours = completedRequests.reduce((sum, req) => {
      const created = new Date(req.created_at).getTime();
      const completed = new Date(req.updated_at).getTime();
      return sum + (completed - created) / (1000 * 60 * 60); // Convert to hours
    }, 0);
    avgResolutionTime = totalHours / completedRequests.length;
  }

  // Tenants summary (based on leases + tenant profiles)
  const { data: leases, error: leasesError } = await supabase
    .from('leases')
    .select('id, lease_start, lease_end, status, move_out_date')
    .eq('account_id', accountId);

  if (leasesError) throw leasesError;

  const activeLeases =
    leases?.filter((lease) =>
      typeof lease.status === 'string' ? lease.status === 'active' : true
    ) || [];

  const totalTenants = activeLeases.length;

  const moveIns =
    leases?.filter((lease) => {
      const leaseStart = new Date(lease.lease_start);
      return leaseStart >= currentMonthStart && leaseStart <= now;
    }).length || 0;

  const moveOuts =
    leases?.filter((lease) => {
      if (!lease.move_out_date) return false;
      const moveOutDate = new Date(lease.move_out_date);
      return moveOutDate >= currentMonthStart && moveOutDate <= now;
    }).length || 0;

  const sixtyDaysFromNow = new Date(now);
  sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

  const leasesExpiring =
    activeLeases.filter((lease) => {
      const leaseEnd = new Date(lease.lease_end);
      return leaseEnd >= now && leaseEnd <= sixtyDaysFromNow;
    }).length || 0;

  // Recent activity
  const { data: recentActivity, error: recentActivityError } = await supabase
    .from('activity_events')
    .select('id, event_type, summary, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentActivityError && !isMissingTable(recentActivityError, 'activity_events')) {
    throw recentActivityError;
  }

  // System Status - Average Lease Time
  let avgLeaseTime = 0;
  if (leases && leases.length > 0) {
    const totalDays = leases.reduce((sum, lease) => {
      const start = new Date(lease.lease_start).getTime();
      const end = new Date(lease.lease_end).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) return sum;
      return sum + (end - start) / (1000 * 60 * 60 * 24); // Convert to days
    }, 0);
    avgLeaseTime = Math.round(totalDays / leases.length);
  }

  // Eviction Rate (use tenant status = 'evicted' or activity_events with eviction)
  const { data: evictedTenants, error: evictedTenantsError } = await supabase
    .from('activity_events')
    .select('id')
    .eq('account_id', accountId)
    .eq('event_type', 'lease_terminated')
    .ilike('summary', '%evict%');

  if (evictedTenantsError && !isMissingTable(evictedTenantsError, 'activity_events')) {
    throw evictedTenantsError;
  }

  const totalLeases = leases?.length || 0;
  const evictionCount = evictedTenants?.length || 0;
  const evictionRate = totalLeases > 0 ? (evictionCount / totalLeases) * 100 : 0;

  // Occupancy Trend (compare current vs last month)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const { count: lastMonthOccupiedCount } = await supabase
    .from('leases')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .in('status', ['active', 'pending'])
    .lte('lease_start', lastMonthEnd.toISOString().split('T')[0])
    .gte('lease_end', lastMonthStart.toISOString().split('T')[0]);

  const lastMonthOccupied = lastMonthOccupiedCount || 0;
  let occupancyTrend: 'up' | 'down' | 'stable' = 'stable';
  if (occupiedUnits > lastMonthOccupied) {
    occupancyTrend = 'up';
  } else if (occupiedUnits < lastMonthOccupied) {
    occupancyTrend = 'down';
  }

  // Get account settings for support availability
  const { data: account } = await supabase
    .from('accounts')
    .select('plan')
    .eq('id', accountId)
    .single();

  const supportAvailable = account?.plan === 'premium' || account?.plan === 'pro';

  // Upcoming Tasks
  const upcomingTasks: Array<any> = [];

  // 1. Lease Renewals (leases expiring in next 90 days)
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  const { data: expiringLeases } = await supabase
    .from('leases')
    .select('id, lease_end, unit_id, tenant_user_id')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .gte('lease_end', now.toISOString().split('T')[0])
    .lte('lease_end', ninetyDaysFromNow.toISOString().split('T')[0])
    .order('lease_end', { ascending: true });

  expiringLeases?.forEach((lease) => {
    const daysUntilExpiry = Math.floor(
      (new Date(lease.lease_end).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    upcomingTasks.push({
      id: `lease-${lease.id}`,
      type: 'lease_renewal' as const,
      title: `Renew lease`,
      dueDate: lease.lease_end,
      priority: daysUntilExpiry < 30 ? 'high' : daysUntilExpiry < 60 ? 'medium' : 'low',
      relatedEntityId: lease.id,
      relatedEntityType: 'lease',
    });
  });

  // 2. Urgent Maintenance Requests
  const { data: urgentMaintenance } = await supabase
    .from('maintenance_requests')
    .select('id, title, created_at')
    .eq('account_id', accountId)
    .eq('priority', 'urgent')
    .in('status', ['open', 'assigned'])
    .order('created_at', { ascending: true });

  urgentMaintenance?.forEach((req) => {
    upcomingTasks.push({
      id: `maintenance-${req.id}`,
      type: 'maintenance' as const,
      title: req.title,
      dueDate: new Date(new Date(req.created_at).getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0], // Due within 24 hours for urgent
      priority: 'urgent' as const,
      relatedEntityId: req.id,
      relatedEntityType: 'maintenance_request',
    });
  });

  // 3. Upcoming HVAC Deliveries (next 30 days)
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const { data: hvacDeliveries, error: hvacError } = await supabase
    .from('hvac_filter_subscriptions')
    .select('id, unit_id, next_delivery_date, status')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .gte('next_delivery_date', now.toISOString().split('T')[0])
    .lte('next_delivery_date', thirtyDaysFromNow.toISOString().split('T')[0])
    .order('next_delivery_date', { ascending: true });

  if (hvacError && !isMissingTable(hvacError, 'hvac_filter_subscriptions')) {
    throw hvacError;
  }

  hvacDeliveries?.forEach((delivery) => {
    upcomingTasks.push({
      id: `hvac-${delivery.id}`,
      type: 'hvac_delivery' as const,
      title: `HVAC filter delivery`,
      dueDate: delivery.next_delivery_date,
      priority: 'low' as const,
      relatedEntityId: delivery.id,
      relatedEntityType: 'hvac_subscription',
    });
  });

  // 4. Active Reminder Schedules (next run)
  const { data: reminders, error: remindersError } = await supabase
    .from('reminder_schedules')
    .select('id, name, next_run_at')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .gte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true });

  if (remindersError && !isMissingTable(remindersError, 'reminder_schedules')) {
    throw remindersError;
  }

  reminders?.forEach((reminder) => {
    upcomingTasks.push({
      id: `reminder-${reminder.id}`,
      type: 'reminder' as const,
      title: reminder.name,
      dueDate: reminder.next_run_at.split('T')[0],
      priority: 'low' as const,
      relatedEntityId: reminder.id,
      relatedEntityType: 'reminder_schedule',
    });
  });

  // Sort all tasks by due date and limit to 10
  upcomingTasks.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );
  const limitedTasks = upcomingTasks.slice(0, 10);

  return {
    kpis: {
      totalUnits,
      occupiedUnits,
      activeTenants: totalTenants,
      monthlyRevenue: Math.round(currentMonth * 100) / 100,
    },
    properties: {
      total: totalProperties,
      active: activeProperties,
      totalUnits,
      occupiedUnits,
      occupancyRate: Math.round(occupancyRate * 10) / 10,
    },
    revenue: {
      currentMonth: Math.round(currentMonth * 100) / 100,
      previousMonth: Math.round(previousMonth * 100) / 100,
      percentChange: Math.round(percentChange * 10) / 10,
      collectionRate: Math.round(collectionRate * 10) / 10,
    },
    maintenance: {
      open,
      inProgress,
      urgent,
      avgResolutionTime: Math.round(avgResolutionTime * 10) / 10,
    },
    tenants: {
      total: totalTenants,
      moveIns,
      moveOuts,
      leasesExpiring,
    },
    systemStatus: {
      supportAvailable,
      avgLeaseTime,
      evictionRate: Math.round(evictionRate * 10) / 10,
      occupancyTrend,
    },
    recentActivity:
      !recentActivityError || isMissingTable(recentActivityError, 'activity_events')
        ? recentActivity?.map((activity) => ({
            id: activity.id,
            type: activity.event_type,
            summary: activity.summary,
            timestamp: activity.created_at,
          })) || []
        : [],
    upcomingTasks: limitedTasks,
  };
}
