import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { AiDisabledError, generateStructuredJson, getAiStatus } from './aiClient';

function formatPropertyAddress(property: any) {
  if (!property) return '';
  const parts = [property.address1, property.address2].filter(Boolean);
  const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(' ');
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(', ');
}

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
  priority: 'low' | 'normal' | 'medium' | 'high' | 'urgent' | 'emergency';
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

export interface EmergencySupportConfig {
  isEnabled: boolean;
  notificationPhone: string | null;
  notificationEmail: string | null;
  notificationChannels: EmergencyChannel[];
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
      property:properties!inner(name, address1, address2, city, state, zip),
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
        ? { name: r.property.name, address: formatPropertyAddress(r.property) }
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
      property:properties!inner(name, address1, address2, city, state, zip),
      unit:units!inner(unit_number)
    `
    )
    .single();

  if (error) throw error;

  let aiSuggestion: {
    suggestedPriority?: string;
    suggestedCategory?: string;
    summary?: string;
  } | null = null;

  try {
    const aiResult = await generateStructuredJson<{
      suggestedPriority?: string;
      suggestedCategory?: string;
      summary?: string;
    }>(
      'You triage maintenance requests. Return JSON with suggestedPriority, suggestedCategory, and a one-sentence summary. Do not include extra fields.',
      {
        title: data.title,
        description: data.description,
        providedPriority: data.priority,
        providedCategory: data.category,
      }
    );

    aiSuggestion = {
      suggestedPriority:
        typeof aiResult.suggestedPriority === 'string'
          ? aiResult.suggestedPriority.trim()
          : undefined,
      suggestedCategory:
        typeof aiResult.suggestedCategory === 'string'
          ? aiResult.suggestedCategory.trim()
          : undefined,
      summary:
        typeof aiResult.summary === 'string' ? aiResult.summary.trim() : undefined,
    };
  } catch (error) {
    if (!(error instanceof AiDisabledError)) {
      console.warn('[Maintenance] AI triage failed, using provided values:', error);
    }
  }

  const aiStatus = getAiStatus();

  // Log activity
  await logActivityEvent(
    accountId,
    userId,
    'maintenance_created',
    `New ${data.priority} priority maintenance request: ${data.title}`,
    {
      entityType: 'maintenance_request',
      entityId: request.id,
      metadata: {
        priority: data.priority,
        category: data.category,
        aiSuggestion,
        aiProvider: aiStatus.provider,
      },
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
      ? { name: request.property.name, address: formatPropertyAddress(request.property) }
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
      property:properties!inner(name, address1, address2, city, state, zip),
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
      ? { name: data.property.name, address: formatPropertyAddress(data.property) }
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
    notificationChannels?: EmergencyChannel[];
  }
): Promise<{ request: MaintenanceRequest; notifications: EmergencyNotificationResult[] }> {
  // Create request with emergency priority
  const request = await createMaintenanceRequest(accountId, userId, {
    ...data,
    priority: 'emergency' as const,
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

  const channels = normalizeEmergencyChannels(
    data.notificationChannels ?? (config?.notification_channels as EmergencyChannel[] | undefined)
  );

  const notifications = await sendEmergencyNotifications({
    accountId,
    request,
    channels,
    title: data.title,
    description: data.description,
    category: data.category,
    unitId: data.unitId,
    notificationPhone: config?.notification_phone,
    notificationEmail: config?.notification_email,
  });

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
        notificationResults: notifications,
        notificationPhone: config?.notification_phone,
        notificationEmail: config?.notification_email,
      },
    }
  );

  return { request, notifications };
}

export async function testEmergencyNotifications(
  accountId: string,
  userId: string | null,
  data: {
    title?: string;
    description?: string;
    category?: string;
    unitId?: string;
    propertyId?: string;
    notificationChannels?: EmergencyChannel[];
  }
): Promise<EmergencyNotificationResult[]> {
  const { data: config } = await supabase
    .from('emergency_support_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  const title = data.title?.trim() || 'Emergency Notification Test';
  const description = data.description?.trim() || 'This is a test of your emergency notification channels.';
  const category = data.category?.trim() || 'general';
  const unitId = data.unitId?.trim() || 'test-unit';
  const propertyId = data.propertyId?.trim() || 'test-property';
  const channels = normalizeEmergencyChannels(
    data.notificationChannels ?? (config?.notification_channels as EmergencyChannel[] | undefined)
  );

  const request: MaintenanceRequest = {
    id: `test-${Date.now()}`,
    title,
    description,
    priority: 'emergency',
    status: 'test',
    category,
    unitId,
    propertyId,
    reportedBy: userId,
    assignedTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const notifications = await sendEmergencyNotifications({
    accountId,
    request,
    channels,
    title,
    description,
    category,
    unitId,
    notificationPhone: config?.notification_phone,
    notificationEmail: config?.notification_email,
  });

  await logActivityEvent(
    accountId,
    userId,
    'maintenance_test',
    'Emergency notification test sent',
    {
      entityType: 'maintenance_request',
      entityId: request.id,
      metadata: {
        notificationResults: notifications,
        notificationPhone: config?.notification_phone,
        notificationEmail: config?.notification_email,
      },
    }
  );

  return notifications;
}

export async function getEmergencySupportConfig(
  accountId: string
): Promise<EmergencySupportConfig> {
  const { data, error } = await supabase
    .from('emergency_support_config')
    .select('is_enabled, notification_phone, notification_email, notification_channels')
    .eq('account_id', accountId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return {
    isEnabled: data?.is_enabled ?? false,
    notificationPhone: data?.notification_phone ?? null,
    notificationEmail: data?.notification_email ?? null,
    notificationChannels: normalizeEmergencyChannels(
      (data?.notification_channels as EmergencyChannel[] | undefined) ?? undefined
    ),
  };
}

export async function upsertEmergencySupportConfig(
  accountId: string,
  data: EmergencySupportConfig
): Promise<EmergencySupportConfig> {
  const payload = {
    account_id: accountId,
    is_enabled: data.isEnabled,
    notification_phone: data.notificationPhone || null,
    notification_email: data.notificationEmail || null,
    notification_channels: normalizeEmergencyChannels(data.notificationChannels),
  };

  const { data: updated, error } = await supabase
    .from('emergency_support_config')
    .upsert(payload, { onConflict: 'account_id' })
    .select('is_enabled, notification_phone, notification_email, notification_channels')
    .single();

  if (error) throw error;

  return {
    isEnabled: updated.is_enabled ?? false,
    notificationPhone: updated.notification_phone ?? null,
    notificationEmail: updated.notification_email ?? null,
    notificationChannels: normalizeEmergencyChannels(
      (updated.notification_channels as EmergencyChannel[] | undefined) ?? undefined
    ),
  };
}

type EmergencyChannel = 'webhook' | 'pagerduty' | 'opsgenie' | 'twilio' | 'slack' | 'email';

type EmergencyNotificationResult = {
  channel: EmergencyChannel;
  sent: boolean;
  status?: number;
  error?: string;
};

const DEFAULT_EMERGENCY_CHANNELS: EmergencyChannel[] = [
  'pagerduty',
  'opsgenie',
  'twilio',
  'slack',
  'email',
  'webhook',
];

function normalizeEmergencyChannels(
  channels?: EmergencyChannel[]
): EmergencyChannel[] {
  if (!channels || channels.length === 0) {
    return DEFAULT_EMERGENCY_CHANNELS;
  }

  const unique = new Set(
    channels.filter((channel) =>
      DEFAULT_EMERGENCY_CHANNELS.includes(channel)
    )
  );

  return unique.size > 0 ? Array.from(unique) : DEFAULT_EMERGENCY_CHANNELS;
}

async function sendEmergencyNotifications(payload: {
  accountId: string;
  request: MaintenanceRequest;
  channels: EmergencyChannel[];
  title: string;
  description: string;
  category: string;
  unitId: string;
  notificationPhone?: string | null;
  notificationEmail?: string | null;
}): Promise<EmergencyNotificationResult[]> {
  const results: EmergencyNotificationResult[] = [];

  for (const channel of payload.channels) {
    switch (channel) {
      case 'webhook':
        results.push(await sendEmergencyWebhook(payload));
        break;
      case 'slack':
        results.push(await sendSlackEmergency(payload));
        break;
      case 'pagerduty':
        results.push(await sendPagerDutyEmergency(payload));
        break;
      case 'opsgenie':
        results.push(await sendOpsgenieEmergency(payload));
        break;
      case 'twilio':
        results.push(await sendTwilioEmergency(payload));
        break;
      case 'email':
        results.push(await sendEmailEmergency(payload));
        break;
      default:
        results.push({
          channel,
          sent: false,
          error: 'Unsupported notification channel',
        });
        break;
    }
  }

  return results;
}

function buildEmergencyMessage(payload: {
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
}) {
  return [
    'Emergency Maintenance Request',
    `Title: ${payload.title}`,
    `Description: ${payload.description}`,
    `Category: ${payload.category}`,
    `Request ID: ${payload.request.id}`,
    `Property ID: ${payload.request.propertyId}`,
    `Unit ID: ${payload.unitId}`,
  ].join('\n');
}

async function sendEmergencyWebhook(payload: {
  accountId: string;
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
  notificationPhone?: string | null;
  notificationEmail?: string | null;
}): Promise<EmergencyNotificationResult> {
  const webhookUrl = process.env.EMERGENCY_WEBHOOK_URL;
  if (!webhookUrl) {
    return { channel: 'webhook', sent: false, error: 'EMERGENCY_WEBHOOK_URL not configured' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (process.env.EMERGENCY_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EMERGENCY_WEBHOOK_TOKEN}`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        accountId: payload.accountId,
        requestId: payload.request.id,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        unitId: payload.unitId,
        propertyId: payload.request.propertyId,
        priority: payload.request.priority,
        status: payload.request.status,
        createdAt: payload.request.createdAt,
        notificationPhone: payload.notificationPhone,
        notificationEmail: payload.notificationEmail,
      }),
    });

    if (!response.ok) {
      return {
        channel: 'webhook',
        sent: false,
        status: response.status,
        error: `Emergency webhook failed with status ${response.status}`,
      };
    }

    return { channel: 'webhook', sent: true, status: response.status };
  } catch (error) {
    return {
      channel: 'webhook',
      sent: false,
      error: error instanceof Error ? error.message : 'Emergency webhook failed',
    };
  }
}

async function sendSlackEmergency(payload: {
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
}): Promise<EmergencyNotificationResult> {
  const webhookUrl = process.env.SLACK_EMERGENCY_WEBHOOK_URL;
  if (!webhookUrl) {
    return { channel: 'slack', sent: false, error: 'SLACK_EMERGENCY_WEBHOOK_URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: buildEmergencyMessage(payload),
      }),
    });

    if (!response.ok) {
      return {
        channel: 'slack',
        sent: false,
        status: response.status,
        error: `Slack notification failed with status ${response.status}`,
      };
    }

    return { channel: 'slack', sent: true, status: response.status };
  } catch (error) {
    return {
      channel: 'slack',
      sent: false,
      error: error instanceof Error ? error.message : 'Slack notification failed',
    };
  }
}

async function sendPagerDutyEmergency(payload: {
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
}): Promise<EmergencyNotificationResult> {
  const routingKey = process.env.PAGERDUTY_INTEGRATION_KEY;
  if (!routingKey) {
    return { channel: 'pagerduty', sent: false, error: 'PAGERDUTY_INTEGRATION_KEY not configured' };
  }

  try {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: routingKey,
        event_action: 'trigger',
        payload: {
          summary: payload.title,
          source: process.env.PAGERDUTY_SOURCE || 'property-management-app',
          severity: 'critical',
          timestamp: new Date().toISOString(),
          component: payload.category,
          group: 'maintenance',
          class: 'emergency',
          custom_details: {
            requestId: payload.request.id,
            propertyId: payload.request.propertyId,
            unitId: payload.unitId,
            description: payload.description,
          },
        },
      }),
    });

    if (!response.ok) {
      return {
        channel: 'pagerduty',
        sent: false,
        status: response.status,
        error: `PagerDuty notification failed with status ${response.status}`,
      };
    }

    return { channel: 'pagerduty', sent: true, status: response.status };
  } catch (error) {
    return {
      channel: 'pagerduty',
      sent: false,
      error: error instanceof Error ? error.message : 'PagerDuty notification failed',
    };
  }
}

async function sendOpsgenieEmergency(payload: {
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
}): Promise<EmergencyNotificationResult> {
  const apiKey = process.env.OPSGENIE_API_KEY;
  if (!apiKey) {
    return { channel: 'opsgenie', sent: false, error: 'OPSGENIE_API_KEY not configured' };
  }

  const apiUrl = process.env.OPSGENIE_API_URL || 'https://api.opsgenie.com';

  try {
    const response = await fetch(`${apiUrl}/v2/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${apiKey}`,
      },
      body: JSON.stringify({
        message: payload.title,
        alias: payload.request.id,
        description: payload.description,
        priority: 'P1',
        details: {
          category: payload.category,
          requestId: payload.request.id,
          propertyId: payload.request.propertyId,
          unitId: payload.unitId,
        },
      }),
    });

    if (!response.ok) {
      return {
        channel: 'opsgenie',
        sent: false,
        status: response.status,
        error: `Opsgenie notification failed with status ${response.status}`,
      };
    }

    return { channel: 'opsgenie', sent: true, status: response.status };
  } catch (error) {
    return {
      channel: 'opsgenie',
      sent: false,
      error: error instanceof Error ? error.message : 'Opsgenie notification failed',
    };
  }
}

async function sendTwilioEmergency(payload: {
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
  notificationPhone?: string | null;
}): Promise<EmergencyNotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      channel: 'twilio',
      sent: false,
      error: 'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER not configured',
    };
  }

  if (!payload.notificationPhone) {
    return { channel: 'twilio', sent: false, error: 'No emergency notification phone configured' };
  }

  const message = buildEmergencyMessage(payload);

  try {
    const body = new URLSearchParams({
      From: fromNumber,
      To: payload.notificationPhone,
      Body: message,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      return {
        channel: 'twilio',
        sent: false,
        status: response.status,
        error: `Twilio notification failed with status ${response.status}`,
      };
    }

    return { channel: 'twilio', sent: true, status: response.status };
  } catch (error) {
    return {
      channel: 'twilio',
      sent: false,
      error: error instanceof Error ? error.message : 'Twilio notification failed',
    };
  }
}

async function sendEmailEmergency(payload: {
  request: MaintenanceRequest;
  title: string;
  description: string;
  category: string;
  unitId: string;
  notificationEmail?: string | null;
}): Promise<EmergencyNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return { channel: 'email', sent: false, error: 'RESEND_API_KEY/RESEND_FROM_EMAIL not configured' };
  }

  if (!payload.notificationEmail) {
    return { channel: 'email', sent: false, error: 'No emergency notification email configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.notificationEmail],
        subject: `Emergency Maintenance: ${payload.title}`,
        text: buildEmergencyMessage(payload),
      }),
    });

    if (!response.ok) {
      return {
        channel: 'email',
        sent: false,
        status: response.status,
        error: `Email notification failed with status ${response.status}`,
      };
    }

    return { channel: 'email', sent: true, status: response.status };
  } catch (error) {
    return {
      channel: 'email',
      sent: false,
      error: error instanceof Error ? error.message : 'Email notification failed',
    };
  }
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
