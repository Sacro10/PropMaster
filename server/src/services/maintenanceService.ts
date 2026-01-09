import { supabase } from '../supabase';
import { logActivityEvent } from './activityService';

export interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string;
  unitId: string;
  propertyId: string;
  reportedBy: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: {
    name: string;
    address: string;
  };
  unit?: {
    unitNumber: string;
  };
}

export interface CreateMaintenanceData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  unitId: string;
  reportedBy?: string;
}

export interface UpdateMaintenanceData {
  status?: string;
  assignedTo?: string;
  priority?: string;
  notes?: string;
}

export interface SLAMetrics {
  totalRequests: number;
  avgResponseTime: number;
  avgResolutionTime: number;
  responseSLAMet: number;
  resolutionSLAMet: number;
  byPriority: {
    urgent: { total: number; slaMetPercentage: number };
    high: { total: number; slaMetPercentage: number };
    medium: { total: number; slaMetPercentage: number };
    low: { total: number; slaMetPercentage: number };
  };
}

/**
 * Get maintenance requests with filtering
 */
export async function getMaintenanceRequests(
  accountId: string,
  filters?: {
    status?: string;
    priority?: string;
    propertyId?: string;
    unitId?: string;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ requests: MaintenanceRequest[]; total: number }> {
  const {
    status,
    priority,
    propertyId,
    unitId,
    assignedTo,
    limit = 50,
    offset = 0,
  } = filters || {};

  let query = supabase
    .from('maintenance_requests')
    .select(
      `
      *,
      property:properties!inner(name, address),
      unit:units!inner(unit_number)
    `,
      { count: 'exact' }
    )
    .eq('account_id', accountId);

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (propertyId) query = query.eq('property_id', propertyId);
  if (unitId) query = query.eq('unit_id', unitId);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  query = query.order('created_at', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const requests: MaintenanceRequest[] =
    data?.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      category: r.category,
      unitId: r.unit_id,
      propertyId: r.property_id,
      reportedBy: r.reported_by,
      assignedTo: r.assigned_to,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      property: r.property
        ? { name: r.property.name, address: r.property.address }
        : undefined,
      unit: r.unit ? { unitNumber: r.unit.unit_number } : undefined,
    })) || [];

  return { requests, total: count || 0 };
}

/**
 * Create a new maintenance request
 */
export async function createMaintenanceRequest(
  accountId: string,
  userId: string | null,
  data: CreateMaintenanceData
): Promise<MaintenanceRequest> {
  // Verify unit belongs to account
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('property_id')
    .eq('id', data.unitId)
    .single();

  if (unitError || !unit) {
    throw new Error('Unit not found');
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id')
    .eq('id', unit.property_id)
    .eq('account_id', accountId)
    .single();

  if (propertyError || !property) {
    throw new Error('Unit does not belong to your account');
  }

  const { data: request, error } = await supabase
    .from('maintenance_requests')
    .insert({
      account_id: accountId,
      property_id: unit.property_id,
      unit_id: data.unitId,
      title: data.title,
      description: data.description,
      priority: data.priority,
      category: data.category,
      status: 'open',
      reported_by: data.reportedBy || userId,
    })
    .select(
      `
      *,
      property:properties!inner(name, address),
      unit:units!inner(unit_number)
    `
    )
    .single();

  if (error) throw error;

  // Log activity
  await logActivityEvent(
    accountId,
    userId,
    'maintenance_created',
    `New ${data.priority} priority maintenance request: ${data.title}`,
    {
      entityType: 'maintenance_request',
      entityId: request.id,
      metadata: { priority: data.priority, category: data.category },
    }
  );

  return {
    id: request.id,
    title: request.title,
    description: request.description,
    priority: request.priority,
    status: request.status,
    category: request.category,
    unitId: request.unit_id,
    propertyId: request.property_id,
    reportedBy: request.reported_by,
    assignedTo: request.assigned_to,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    property: request.property
      ? { name: request.property.name, address: request.property.address }
      : undefined,
    unit: request.unit ? { unitNumber: request.unit.unit_number } : undefined,
  };
}

/**
 * Update maintenance request status or assignment
 */
export async function updateMaintenanceRequest(
  accountId: string,
  userId: string | null,
  requestId: string,
  updates: UpdateMaintenanceData
): Promise<MaintenanceRequest> {
  const updateData: any = {};
  if (updates.status) updateData.status = updates.status;
  if (updates.assignedTo !== undefined) updateData.assigned_to = updates.assignedTo;
  if (updates.priority) updateData.priority = updates.priority;

  const { data, error } = await supabase
    .from('maintenance_requests')
    .update(updateData)
    .eq('id', requestId)
    .eq('account_id', accountId)
    .select(
      `
      *,
      property:properties!inner(name, address),
      unit:units!inner(unit_number)
    `
    )
    .single();

  if (error) throw error;

  // Log activity based on what changed
  if (updates.status) {
    await logActivityEvent(
      accountId,
      userId,
      updates.status === 'completed'
        ? 'maintenance_completed'
        : 'maintenance_assigned',
      `Maintenance request ${updates.status}: ${data.title}`,
      {
        entityType: 'maintenance_request',
        entityId: requestId,
        metadata: { newStatus: updates.status },
      }
    );
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    priority: data.priority,
    status: data.status,
    category: data.category,
    unitId: data.unit_id,
    propertyId: data.property_id,
    reportedBy: data.reported_by,
    assignedTo: data.assigned_to,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    property: data.property
      ? { name: data.property.name, address: data.property.address }
      : undefined,
    unit: data.unit ? { unitNumber: data.unit.unit_number } : undefined,
  };
}

/**
 * Get SLA metrics for maintenance requests
 */
export async function getSLAMetrics(accountId: string): Promise<SLAMetrics> {
  const { data, error } = await supabase
    .from('maintenance_sla_metrics')
    .select('*')
    .eq('account_id', accountId);

  if (error) throw error;

  const totalRequests = data?.length || 0;

  if (totalRequests === 0) {
    return {
      totalRequests: 0,
      avgResponseTime: 0,
      avgResolutionTime: 0,
      responseSLAMet: 0,
      resolutionSLAMet: 0,
      byPriority: {
        urgent: { total: 0, slaMetPercentage: 0 },
        high: { total: 0, slaMetPercentage: 0 },
        medium: { total: 0, slaMetPercentage: 0 },
        low: { total: 0, slaMetPercentage: 0 },
      },
    };
  }

  const avgResponseTime =
    data.reduce((sum, m) => sum + (m.actual_response_hours || 0), 0) / totalRequests;
  const avgResolutionTime =
    data.reduce((sum, m) => sum + (m.actual_resolution_hours || 0), 0) / totalRequests;
  const responseSLAMet = data.filter((m) => m.response_met).length;
  const resolutionSLAMet = data.filter((m) => m.resolution_met).length;

  const byPriority: any = {
    urgent: { total: 0, slaMetPercentage: 0 },
    high: { total: 0, slaMetPercentage: 0 },
    medium: { total: 0, slaMetPercentage: 0 },
    low: { total: 0, slaMetPercentage: 0 },
  };

  ['urgent', 'high', 'medium', 'low'].forEach((priority) => {
    const priorityMetrics = data.filter((m) => m.priority === priority);
    byPriority[priority].total = priorityMetrics.length;
    if (priorityMetrics.length > 0) {
      const metCount = priorityMetrics.filter((m) => m.resolution_met).length;
      byPriority[priority].slaMetPercentage = (metCount / priorityMetrics.length) * 100;
    }
  });

  return {
    totalRequests,
    avgResponseTime: Math.round(avgResponseTime * 10) / 10,
    avgResolutionTime: Math.round(avgResolutionTime * 10) / 10,
    responseSLAMet: Math.round((responseSLAMet / totalRequests) * 100),
    resolutionSLAMet: Math.round((resolutionSLAMet / totalRequests) * 100),
    byPriority,
  };
}

/**
 * Get maintenance KPI statistics
 */
export async function getMaintenanceStats(accountId: string): Promise<{
  activeRequests: number;
  avgResponseTimeHours: number;
  completionRate: number;
  emergencySupportEnabled: boolean;
  recentEmergencyCount: number;
}> {
  // Get active requests count
  const { count: activeCount } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .in('status', ['open', 'assigned', 'scheduled', 'in_progress']);

  // Get avg response time from SLA metrics
  const { data: slaData } = await supabase
    .from('maintenance_sla_metrics')
    .select('actual_response_hours')
    .eq('account_id', accountId)
    .not('actual_response_hours', 'is', null);

  let avgResponseTime = 0;
  if (slaData && slaData.length > 0) {
    avgResponseTime =
      slaData.reduce((sum, m) => sum + (m.actual_response_hours || 0), 0) / slaData.length;
  }

  // Get completion rate
  const { count: totalCount } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  const { count: completedCount } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'completed');

  const completionRate =
    totalCount && totalCount > 0 ? ((completedCount || 0) / totalCount) * 100 : 0;

  // Get emergency support status
  const { data: emergencyConfig } = await supabase
    .from('emergency_support_config')
    .select('is_enabled')
    .eq('account_id', accountId)
    .single();

  // Get recent emergency count (last 24 hours)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { count: emergencyCount } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('priority', 'emergency')
    .gte('created_at', yesterday.toISOString());

  return {
    activeRequests: activeCount || 0,
    avgResponseTimeHours: Math.round(avgResponseTime * 10) / 10,
    completionRate: Math.round(completionRate * 10) / 10,
    emergencySupportEnabled: emergencyConfig?.is_enabled || false,
    recentEmergencyCount: emergencyCount || 0,
  };
}

/**
 * Get available vendors for assignment
 */
export async function getAvailableVendors(
  accountId: string,
  category: string,
  propertyZip: string
): Promise<Array<{
  id: string;
  businessName: string;
  rating: number;
  jobsCompleted: number;
  hourlyRate: number;
}>> {
  const { data, error } = await supabase.rpc('find_available_vendors', {
    p_account_id: accountId,
    p_category: category,
    p_property_zip: propertyZip,
    p_limit: 10,
  });

  if (error) throw error;

  return (
    data?.map((v: any) => ({
      id: v.vendor_id,
      businessName: v.business_name,
      rating: v.rating,
      jobsCompleted: v.jobs_completed,
      hourlyRate: 85, // Default if not in response
    })) || []
  );
}

/**
 * Assign vendor to maintenance request
 */
export async function assignVendorToRequest(
  accountId: string,
  userId: string | null,
  requestId: string,
  vendorProfileId: string
): Promise<void> {
  // Get request details for ETA calculation
  const { data: request, error: requestError } = await supabase
    .from('maintenance_requests')
    .select('priority, category, created_at')
    .eq('id', requestId)
    .eq('account_id', accountId)
    .single();

  if (requestError || !request) {
    throw new Error('Request not found');
  }

  // Create assignment
  const { error: assignmentError } = await supabase.from('maintenance_assignments').insert({
    account_id: accountId,
    request_id: requestId,
    vendor_profile_id: vendorProfileId,
    status: 'pending',
    assigned_at: new Date().toISOString(),
  });

  if (assignmentError) throw assignmentError;

  // Calculate ETA based on priority
  const etaMap: Record<string, number> = {
    emergency: 2,
    urgent: 4,
    high: 8,
    normal: 24,
    low: 48,
  };
  const etaHours = etaMap[request.priority] || 24;
  const scheduledFor = new Date();
  scheduledFor.setHours(scheduledFor.getHours() + etaHours);

  // Update request status
  const { error: updateError } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      eta_hours: etaHours,
      scheduled_for: scheduledFor.toISOString(),
    })
    .eq('id', requestId)
    .eq('account_id', accountId);

  if (updateError) throw updateError;

  // Log activity
  await logActivityEvent(
    accountId,
    userId,
    'maintenance_assigned',
    `Maintenance request assigned to vendor`,
    {
      entityType: 'maintenance_request',
      entityId: requestId,
      metadata: { vendorProfileId, etaHours },
    }
  );
}

/**
 * Create emergency maintenance request
 */
export async function createEmergencyRequest(
  accountId: string,
  userId: string | null,
  data: {
    title: string;
    description: string;
    category: string;
    unitId: string;
    reportedBy?: string;
  }
): Promise<MaintenanceRequest> {
  // Create request with emergency priority
  const request = await createMaintenanceRequest(accountId, userId, {
    ...data,
    priority: 'emergency',
  });

  // Update is_emergency flag
  await supabase
    .from('maintenance_requests')
    .update({ is_emergency: true })
    .eq('id', request.id);

  // Get emergency support config
  const { data: config } = await supabase
    .from('emergency_support_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (config?.is_enabled) {
    // Send notifications (stub - would integrate with email/SMS service)
    console.log(
      `[Emergency] Sending notifications for emergency request ${request.id}`,
      config
    );

    // Log emergency notification
    await logActivityEvent(
      accountId,
      userId,
      'maintenance_created',
      `EMERGENCY: ${data.title}`,
      {
        entityType: 'maintenance_request',
        entityId: request.id,
        metadata: {
          priority: 'emergency',
          notificationSent: true,
          notificationPhone: config.notification_phone,
          notificationEmail: config.notification_email,
        },
      }
    );
  }

  return { ...request, is_emergency: true };
}

/**
 * Get smart routing metrics
 */
export async function getRoutingMetrics(accountId: string): Promise<{
  routingEfficiency: number;
  autoAssignmentRate: number;
  avgVendorResponseTime: number;
}> {
  // Get total requests
  const { count: totalRequests } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // Get assigned requests
  const { count: assignedRequests } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .not('assigned_at', 'is', null);

  // Get assignments with acceptance time
  const { data: assignments } = await supabase
    .from('maintenance_assignments')
    .select('assigned_at, accepted_at, status')
    .eq('account_id', accountId)
    .not('accepted_at', 'is', null);

  // Calculate metrics
  const autoAssignmentRate =
    totalRequests && totalRequests > 0
      ? ((assignedRequests || 0) / totalRequests) * 100
      : 0;

  let avgResponseTime = 0;
  if (assignments && assignments.length > 0) {
    const totalHours = assignments.reduce((sum, a) => {
      const assigned = new Date(a.assigned_at).getTime();
      const accepted = new Date(a.accepted_at).getTime();
      return sum + (accepted - assigned) / (1000 * 60 * 60);
    }, 0);
    avgResponseTime = totalHours / assignments.length;
  }

  // Routing efficiency: percentage of assignments that were accepted
  const acceptedCount =
    assignments?.filter((a) =>
      ['accepted', 'in_progress', 'completed'].includes(a.status)
    ).length || 0;
  const routingEfficiency =
    assignments && assignments.length > 0 ? (acceptedCount / assignments.length) * 100 : 0;

  return {
    routingEfficiency: Math.round(routingEfficiency * 10) / 10,
    autoAssignmentRate: Math.round(autoAssignmentRate * 10) / 10,
    avgVendorResponseTime: Math.round(avgResponseTime * 10) / 10,
  };
}
