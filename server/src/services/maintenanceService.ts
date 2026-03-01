import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { AiDisabledError, generateStructuredJson, getAiStatus } from './aiClient';
import { sendResendEmail } from './emailService';
import { stripe } from '../stripe';
import { config } from '../config';
import {
  buildMaintenanceActionUrl,
  createNotifications,
  getAccountRoleMap,
  getAccountUsersByRoles,
} from './notificationService';

function formatPropertyAddress(property: any) {
  if (!property) return '';
  const parts = [property.address1, property.address2].filter(Boolean);
  const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(' ');
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(', ');
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

function normalizeImageUrls(value: any): string[] {
  if (!value) return [];

  const list = Array.isArray(value) ? value : typeof value === 'string' ? (() => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.startsWith('http') ? [value] : [];
    }
  })() : [];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    urls.push(trimmed);
  }

  return urls;
}

function formatPhotoLines(title: string, urls: string[]) {
  if (urls.length === 0) return [];
  return [title, ...urls.map((url) => `- ${url}`), ''];
}

function formatUsdAmount(value: number) {
  return `$${value.toFixed(2)}`;
}

function isMissingColumnError(error: any, column: string) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  const field = column.toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes(`column "${field}"`) ||
    message.includes(`column '${field}'`) ||
    message.includes(`'${field}' column`) ||
    (message.includes(field) && message.includes('does not exist'))
  );
}

function buildMaintenanceLocationLabel(request: {
  property?: { name?: string | null } | null;
  unit?: { unit_number?: string | null } | null;
}) {
  const propertyName = request.property?.name || 'Property';
  const unitLabel = request.unit?.unit_number ? ` #${request.unit.unit_number}` : '';
  return `${propertyName}${unitLabel}`;
}

async function notifyMaintenanceUsers(params: {
  accountId: string;
  recipientIds: string[];
  requestId: string;
  title: string;
  message: string;
  payload?: Record<string, any>;
}) {
  const recipientIds = Array.from(new Set(params.recipientIds.filter(Boolean)));
  if (recipientIds.length === 0) {
    return;
  }

  const roleMap = await getAccountRoleMap(params.accountId, recipientIds);
  await createNotifications(
    recipientIds.map((recipientId) => ({
      accountId: params.accountId,
      userId: recipientId,
      type: 'maintenance_update',
      title: params.title,
      message: params.message,
      actionUrl: buildMaintenanceActionUrl(roleMap.get(recipientId), params.requestId),
      relatedEntityType: 'maintenance_request',
      relatedEntityId: params.requestId,
      payload: params.payload,
    }))
  );
}

async function findVendorStripeAccountIdByMetadata(params: {
  accountId: string;
  vendorProfileId: string;
  vendorUserId: string;
}): Promise<string | null> {
  try {
    let startingAfter: string | undefined = undefined;
    for (let page = 0; page < 10; page += 1) {
      const accountPage: Awaited<ReturnType<typeof stripe.accounts.list>> = await stripe.accounts.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      const match = (accountPage.data || []).find((account: any) => {
        const metadata = account?.metadata || {};
        const profileMatch = String(metadata.vendor_profile_id || '') === params.vendorProfileId;
        const userMatch = String(metadata.user_id || '') === params.vendorUserId;
        const accountMatch = !metadata.account_id || String(metadata.account_id) === params.accountId;
        return (profileMatch || userMatch) && accountMatch;
      });

      if (match?.id) {
        return match.id;
      }

      if (!accountPage.has_more || accountPage.data.length === 0) {
        break;
      }
      startingAfter = accountPage.data[accountPage.data.length - 1]?.id;
    }
  } catch (error) {
    console.warn('[Maintenance] Failed to resolve vendor Stripe account by metadata:', error);
  }

  return null;
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
  images?: string[];
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

  const basePayload = {
    account_id: accountId,
    property_id: unit.property_id,
    unit_id: data.unitId,
    title: data.title,
    description: data.description,
    priority: data.priority,
    category: data.category,
    status: 'open',
    reported_by: data.reportedBy || userId,
  };

  const requestSelect = `
      *,
      property:properties!inner(name, address1, address2, city, state, zip),
      unit:units!inner(unit_number)
    `;

  let request: any = null;
  let error: any = null;

  ({ data: request, error } = await supabase
    .from('maintenance_requests')
    .insert({
      ...basePayload,
      images: normalizeImageUrls(data.images),
    })
    .select(requestSelect)
    .single());

  // Older schemas may not have maintenance_requests.images yet.
  if (error && isMissingColumnError(error, 'images')) {
    ({ data: request, error } = await supabase
      .from('maintenance_requests')
      .insert(basePayload)
      .select(requestSelect)
      .single());
  }

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

  // In-app owner/manager/admin notification for tenant-submitted requests.
  const requesterUserId = request.reported_by || userId;
  if (requesterUserId) {
    try {
      const { data: requesterMembership } = await supabase
        .from('account_members')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', requesterUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (requesterMembership?.role === 'tenant') {
        const recipients = await getAccountUsersByRoles(accountId, ['owner', 'manager', 'admin'], {
          excludeUserIds: [requesterUserId],
        });

        await notifyMaintenanceUsers({
          accountId,
          recipientIds: recipients,
          requestId: request.id,
          title: 'New tenant maintenance request',
          message: [
            `A tenant submitted a new maintenance request.`,
            `Title: ${request.title}`,
            `Priority: ${request.priority}`,
            `Location: ${buildMaintenanceLocationLabel(request)}`,
          ].join('\n'),
          payload: {
            requestId: request.id,
            priority: request.priority,
            category: request.category,
            status: request.status,
          },
        });

        await notifyMaintenanceUsers({
          accountId,
          recipientIds: [requesterUserId],
          requestId: request.id,
          title: 'Maintenance request submitted',
          message: [
            `Your maintenance request has been submitted.`,
            `Title: ${request.title}`,
            `Priority: ${request.priority}`,
            `Location: ${buildMaintenanceLocationLabel(request)}`,
            `Status: ${request.status}`,
          ].join('\n'),
          payload: {
            requestId: request.id,
            priority: request.priority,
            category: request.category,
            status: request.status,
          },
        });
      }
    } catch (notificationError) {
      console.warn('[Maintenance] Unexpected notification error after request create:', notificationError);
    }
  }

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
  const { data: existingRequest } = await supabase
    .from('maintenance_requests')
    .select('id, status, reported_by')
    .eq('id', requestId)
    .eq('account_id', accountId)
    .maybeSingle();

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

    try {
      const ownerRecipients = await getAccountUsersByRoles(accountId, ['owner', 'manager', 'admin'], {
        excludeUserIds: userId ? [userId] : [],
      });
      const tenantRecipients =
        data.reported_by && data.reported_by !== userId ? [data.reported_by] : [];
      const recipients = [...ownerRecipients, ...tenantRecipients];

      await notifyMaintenanceUsers({
        accountId,
        recipientIds: recipients,
        requestId,
        title: 'Maintenance status updated',
        message: [
          `Maintenance request updated: ${data.title}`,
          existingRequest?.status ? `Previous status: ${existingRequest.status}` : null,
          `Current status: ${updates.status}`,
          `Location: ${buildMaintenanceLocationLabel(data)}`,
        ]
          .filter(Boolean)
          .join('\n'),
        payload: {
          requestId,
          previousStatus: existingRequest?.status || null,
          status: updates.status,
        },
      });
    } catch (notificationError) {
      console.warn('[Maintenance] Failed to create status notifications:', notificationError);
    }
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
 * Delete a maintenance request
 */
export async function deleteMaintenanceRequest(
  accountId: string,
  userId: string | null,
  requestId: string
): Promise<void> {
  const { data: request, error: fetchError } = await supabase
    .from('maintenance_requests')
    .select('id, title')
    .eq('account_id', accountId)
    .eq('id', requestId)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      throw new Error('Maintenance request not found');
    }
    throw fetchError;
  }

  const { error: deleteError } = await supabase
    .from('maintenance_requests')
    .delete()
    .eq('account_id', accountId)
    .eq('id', requestId);

  if (deleteError) throw deleteError;

  await logActivityEvent(
    accountId,
    userId,
    'maintenance_deleted',
    `Maintenance request deleted: ${request.title}`,
    {
      entityType: 'maintenance_request',
      entityId: requestId,
    }
  );
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
  propertyZip: string,
  radiusMiles?: number
): Promise<Array<{
  id: string;
  businessName: string;
  rating: number;
  jobsCompleted: number;
  hourlyRate: number;
  email: string | null;
}>> {
  let data: any = null;
  let error: any = null;

  const { data: vendorMembers, error: membersError } = await supabase
    .from('account_members')
    .select('user_id, role, is_active')
    .eq('account_id', accountId)
    .eq('role', 'vendor')
    .eq('is_active', true);

  if (membersError) {
    throw membersError;
  }

  const vendorUserIds = new Set(
    (vendorMembers || [])
      .map((member: any) => member.user_id)
      .filter(Boolean)
  );

  if (vendorUserIds.size === 0) {
    return [];
  }

  if (typeof radiusMiles === 'number') {
    ({ data, error } = await supabase.rpc('find_available_vendors', {
      p_account_id: accountId,
      p_category: category,
      p_property_zip: propertyZip,
      p_limit: 10,
      p_radius_miles: radiusMiles,
    }));
  } else {
    ({ data, error } = await supabase.rpc('find_available_vendors', {
      p_account_id: accountId,
      p_category: category,
      p_property_zip: propertyZip,
      p_limit: 10,
    }));
  }

  if (error && typeof radiusMiles === 'number') {
    // Retry without radius if the RPC signature doesn't support it.
    ({ data, error } = await supabase.rpc('find_available_vendors', {
      p_account_id: accountId,
      p_category: category,
      p_property_zip: propertyZip,
      p_limit: 10,
    }));
  }

  if (!error && data) {
    const vendorIds = (data || []).map((v: any) => v.vendor_id).filter(Boolean);
    const { data: vendorProfiles } = await supabase
      .from('vendor_profiles')
      .select('id, email, business_name, user_id')
      .eq('account_id', accountId)
      .in('id', vendorIds);
    const invitedProfiles = (vendorProfiles || []).filter((v: any) => vendorUserIds.has(v.user_id));
    const vendorEmailMap = new Map(
      invitedProfiles.map((v: any) => [v.id, { email: v.email || null, businessName: v.business_name }])
    );

    return (
      data
        ?.filter((v: any) => vendorEmailMap.has(v.vendor_id))
        .map((v: any) => ({
          id: v.vendor_id,
          businessName: vendorEmailMap.get(v.vendor_id)?.businessName || v.business_name,
          rating: v.rating ?? 0,
          jobsCompleted: v.jobs_completed ?? 0,
          hourlyRate: v.hourly_rate ?? 85,
          email: vendorEmailMap.get(v.vendor_id)?.email || null,
        })) || []
    );
  }

  // Fallback: fetch vendors directly when RPC is unavailable or misconfigured.
  const { data: vendorProfiles, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, email, avg_rating, total_jobs_completed, is_active, user_id')
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (vendorError) {
    throw vendorError;
  }

  const invitedProfiles = (vendorProfiles || []).filter((v) => vendorUserIds.has(v.user_id));

  let eligibleVendorIds = new Set<string>((invitedProfiles || []).map((v) => v.id));

  if (category) {
    const { data: vendorServices, error: servicesError } = await supabase
      .from('vendor_services')
      .select('vendor_profile_id, vendor_id, service_type')
      .eq('account_id', accountId)
      .eq('service_type', category);

    if (!servicesError && vendorServices && vendorServices.length > 0) {
      eligibleVendorIds = new Set(
        vendorServices
          .map((s: any) => s.vendor_profile_id || s.vendor_id)
          .filter(Boolean)
      );
    }
  }

  return (invitedProfiles || [])
    .filter((v) => eligibleVendorIds.has(v.id))
    .map((v) => ({
      id: v.id,
      businessName: v.business_name ?? 'Unknown Vendor',
      rating: v.avg_rating ?? 0,
      jobsCompleted: v.total_jobs_completed ?? 0,
      hourlyRate: 85,
      email: v.email || null,
    }));
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

  const assignmentTimestamp = new Date().toISOString();
  const updatePayload = {
    status: 'assigned',
    assigned_at: assignmentTimestamp,
    eta_hours: etaHours,
    scheduled_for: scheduledFor.toISOString(),
  };

  // Update request status (fallback for schemas without eta_hours).
  let updateError: any = null;
  ({ error: updateError } = await supabase
    .from('maintenance_requests')
    .update(updatePayload)
    .eq('id', requestId)
    .eq('account_id', accountId));

  if (updateError && isMissingColumnError(updateError, 'eta_hours')) {
    ({ error: updateError } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'assigned',
        assigned_at: assignmentTimestamp,
        scheduled_for: scheduledFor.toISOString(),
      })
      .eq('id', requestId)
      .eq('account_id', accountId));
  }

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

  // Notify assigned vendor
  try {
    const { data: vendorProfile, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('user_id, business_name, email')
      .eq('id', vendorProfileId)
      .eq('account_id', accountId)
      .single();

    if (!vendorError && vendorProfile?.user_id) {
      const { data: requestDetails } = await supabase
        .from('maintenance_requests')
        .select('title, description, priority, category, property_id, unit_id, requested_at, reported_by, images, properties(name, address1, address2, city, state, zip), units(unit_number)')
        .eq('id', requestId)
        .eq('account_id', accountId)
        .single();

      const subject = `Maintenance assignment: ${requestDetails?.title || 'New request'}`;
      const property = normalizeRelation<any>(requestDetails?.properties);
      const unit = normalizeRelation<any>(requestDetails?.units);
      const issueImageUrls = normalizeImageUrls(requestDetails?.images);
      const propertyName = property?.name || 'Property';
      const propertyAddress = formatPropertyAddress(property);
      const unitNumber = unit?.unit_number
        ? ` #${unit.unit_number}`
        : '';
      const body = [
        `You have been assigned a maintenance request.`,
        `Title: ${requestDetails?.title || 'N/A'}`,
        `Property: ${propertyName}${unitNumber}`,
        `Address: ${propertyAddress || 'N/A'}`,
        `Priority: ${requestDetails?.priority || 'normal'}`,
        `Category: ${requestDetails?.category || 'general'}`,
        `Description: ${requestDetails?.description || 'N/A'}`,
        ...formatPhotoLines('Issue photos uploaded by tenant:', issueImageUrls),
      ].join('\n');

      const { sendMessage } = await import('./communicationsService');
      await sendMessage(accountId, userId || vendorProfile.user_id, {
        recipientId: vendorProfile.user_id,
        subject,
        body,
        propertyId: requestDetails?.property_id || undefined,
        unitId: requestDetails?.unit_id || undefined,
      });

      const vendorEmail =
        vendorProfile.email ||
        (await supabase.auth.admin.getUserById(vendorProfile.user_id)).data?.user?.email ||
        null;

      if (vendorEmail) {
        await sendVendorAssignmentEmail({
          vendorEmail,
          vendorName: vendorProfile.business_name || undefined,
          requestTitle: requestDetails?.title || undefined,
          requestDescription: requestDetails?.description || undefined,
          propertyName,
          propertyAddress: propertyAddress || undefined,
          unitNumber: unit?.unit_number || undefined,
          priority: requestDetails?.priority || undefined,
          category: requestDetails?.category || undefined,
          requestedAt: requestDetails?.requested_at || undefined,
          issueImageUrls,
          requestId,
        });
      }

      await notifyMaintenanceUsers({
        accountId,
        recipientIds: [vendorProfile.user_id],
        requestId,
        title: 'New maintenance assignment',
        message: [
          'You have been assigned a maintenance request.',
          `Title: ${requestDetails?.title || 'N/A'}`,
          `Priority: ${requestDetails?.priority || 'normal'}`,
          `Location: ${propertyName}${unitNumber}`,
        ].join('\n'),
        payload: {
          requestId,
          vendorProfileId,
          status: 'assigned',
        },
      });

      const ownerRecipients = await getAccountUsersByRoles(accountId, ['owner', 'manager', 'admin'], {
        excludeUserIds: userId ? [userId] : [],
      });
      const tenantRecipientIds =
        typeof (requestDetails as any)?.reported_by === 'string' && (requestDetails as any).reported_by !== userId
          ? [(requestDetails as any).reported_by]
          : [];

      await notifyMaintenanceUsers({
        accountId,
        recipientIds: [...ownerRecipients, ...tenantRecipientIds],
        requestId,
        title: 'Vendor assigned to maintenance request',
        message: [
          `${vendorProfile.business_name || 'A vendor'} has been assigned.`,
          `Title: ${requestDetails?.title || 'N/A'}`,
          `Location: ${propertyName}${unitNumber}`,
          `Estimated response window: ${etaHours} hour${etaHours === 1 ? '' : 's'}`,
        ].join('\n'),
        payload: {
          requestId,
          vendorProfileId,
          etaHours,
          status: 'assigned',
        },
      });
    }
  } catch (error) {
    console.warn('[assignVendorToRequest] Failed to notify vendor:', error);
  }
}

async function sendVendorAssignmentEmail(payload: {
  vendorEmail: string;
  vendorName?: string;
  requestTitle?: string;
  requestDescription?: string;
  propertyName?: string;
  propertyAddress?: string;
  unitNumber?: string;
  priority?: string;
  category?: string;
  requestedAt?: string;
  issueImageUrls?: string[];
  requestId: string;
}): Promise<void> {
  const unitLabel = payload.unitNumber ? `#${payload.unitNumber}` : 'N/A';
  const lines = [
    `Hello${payload.vendorName ? ` ${payload.vendorName}` : ''},`,
    '',
    'You have been assigned a maintenance request.',
    '',
    `Request ID: ${payload.requestId}`,
    `Title: ${payload.requestTitle || 'N/A'}`,
    `Description: ${payload.requestDescription || 'N/A'}`,
    `Property: ${payload.propertyName || 'N/A'}`,
    `Unit: ${unitLabel}`,
    `Address: ${payload.propertyAddress || 'N/A'}`,
    `Priority: ${payload.priority || 'normal'}`,
    `Category: ${payload.category || 'general'}`,
    `Reported: ${payload.requestedAt || 'N/A'}`,
    ...formatPhotoLines('Issue photos uploaded by tenant:', normalizeImageUrls(payload.issueImageUrls)),
  ];

  await sendResendEmail({
    to: payload.vendorEmail,
    subject: `Maintenance Assignment: ${payload.requestTitle || payload.requestId}`,
    text: lines.join('\n'),
  });
}

async function resolveAssigningOwnerUserId(accountId: string, requestId: string): Promise<string | null> {
  try {
    const { data: events, error: eventsError } = await supabase
      .from('activity_events')
      .select('user_id, created_at')
      .eq('account_id', accountId)
      .eq('event_type', 'maintenance_assigned')
      .eq('entity_type', 'maintenance_request')
      .eq('entity_id', requestId)
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (eventsError) {
      const message = String(eventsError.message || '').toLowerCase();
      if (!message.includes('does not exist')) {
        throw eventsError;
      }
    } else if (events && events.length > 0) {
      for (const event of events) {
        if (!event.user_id) continue;
        const { data: member } = await supabase
          .from('account_members')
          .select('role, is_active')
          .eq('account_id', accountId)
          .eq('user_id', event.user_id)
          .maybeSingle();

        if (member?.is_active !== false && ['owner', 'manager', 'admin'].includes(member?.role || '')) {
          return event.user_id;
        }
      }
    }
  } catch (error) {
    console.warn('[Maintenance] Failed to resolve assigning owner from activity events:', error);
  }

  const { data: owners, error: ownerError } = await supabase
    .from('account_members')
    .select('user_id, role, joined_at, created_at')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .in('role', ['owner', 'manager', 'admin'])
    .order('joined_at', { ascending: false });

  if (ownerError || !owners || owners.length === 0) {
    return null;
  }

  const sorted = [...owners].sort((a, b) => {
    const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
    const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return sorted[0]?.user_id || null;
}

export async function updateMaintenanceAssignmentPhotosAndNotify(
  accountId: string,
  actorUserId: string,
  params: {
    assignmentId: string;
    requestId: string;
    beforeImages?: string[] | null;
    afterImages?: string[] | null;
  }
): Promise<{
  beforeImages: string[];
  afterImages: string[];
  notifiedRecipients: string[];
}> {
  const { assignmentId, requestId, beforeImages, afterImages } = params;

  const { data: assignment, error: assignmentError } = await supabase
    .from('maintenance_assignments')
    .select('id, request_id, vendor_profile_id, before_images, after_images')
    .eq('id', assignmentId)
    .eq('request_id', requestId)
    .eq('account_id', accountId)
    .single();

  if (assignmentError || !assignment) {
    throw new Error('Maintenance assignment not found');
  }

  const existingBefore = normalizeImageUrls(assignment.before_images);
  const existingAfter = normalizeImageUrls(assignment.after_images);
  const nextBefore = Array.isArray(beforeImages)
    ? normalizeImageUrls(beforeImages)
    : existingBefore;
  const nextAfter = Array.isArray(afterImages)
    ? normalizeImageUrls(afterImages)
    : existingAfter;

  const updates: Record<string, any> = {};
  if (Array.isArray(beforeImages)) updates.before_images = nextBefore;
  if (Array.isArray(afterImages)) updates.after_images = nextAfter;

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from('maintenance_assignments')
      .update(updates)
      .eq('id', assignmentId)
      .eq('request_id', requestId)
      .eq('account_id', accountId);

    if (updateError) {
      throw updateError;
    }
  }

  const addedBefore = Array.isArray(beforeImages)
    ? nextBefore.filter((url) => !existingBefore.includes(url))
    : [];
  const addedAfter = Array.isArray(afterImages)
    ? nextAfter.filter((url) => !existingAfter.includes(url))
    : [];

  const newlyAdded = [...addedBefore, ...addedAfter];
  if (newlyAdded.length === 0) {
    return {
      beforeImages: nextBefore,
      afterImages: nextAfter,
      notifiedRecipients: [],
    };
  }

  const [{ data: request }, { data: vendorProfile }] = await Promise.all([
    supabase
      .from('maintenance_requests')
      .select('id, title, property_id, unit_id, created_by_user_id, properties(name, address1, address2, city, state, zip), units(unit_number)')
      .eq('id', requestId)
      .eq('account_id', accountId)
      .single(),
    assignment.vendor_profile_id
      ? supabase
          .from('vendor_profiles')
          .select('id, user_id, business_name')
          .eq('id', assignment.vendor_profile_id)
          .eq('account_id', accountId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ]);

  const recipients = new Set<string>();
  if (request?.created_by_user_id && request.created_by_user_id !== actorUserId) {
    recipients.add(request.created_by_user_id);
  }

  const assigningOwnerUserId = await resolveAssigningOwnerUserId(accountId, requestId);
  if (assigningOwnerUserId && assigningOwnerUserId !== actorUserId) {
    recipients.add(assigningOwnerUserId);
  }

  const recipientIds = [...recipients];
  if (recipientIds.length === 0) {
    return {
      beforeImages: nextBefore,
      afterImages: nextAfter,
      notifiedRecipients: [],
    };
  }

  const property = normalizeRelation<any>(request?.properties);
  const unit = normalizeRelation<any>(request?.units);
  const propertyName = property?.name || 'Property';
  const unitLabel = unit?.unit_number ? ` #${unit.unit_number}` : '';
  const vendorName = vendorProfile?.business_name || 'Assigned vendor';
  const subject = `Maintenance photo update: ${request?.title || requestId}`;
  const bodyLines = [
    `${vendorName} uploaded new work photos for a maintenance request.`,
    `Title: ${request?.title || 'N/A'}`,
    `Property: ${propertyName}${unitLabel}`,
    `Address: ${formatPropertyAddress(property) || 'N/A'}`,
    ...formatPhotoLines('New before-work photos:', addedBefore),
    ...formatPhotoLines('New after-work photos:', addedAfter),
  ];

  const { sendMessage } = await import('./communicationsService');
  const notifiedRecipients: string[] = [];
  for (const recipientId of recipientIds) {
    try {
      await sendMessage(accountId, actorUserId, {
        recipientId,
        subject,
        body: bodyLines.join('\n'),
        propertyId: request?.property_id || undefined,
        unitId: request?.unit_id || undefined,
      });
      notifiedRecipients.push(recipientId);
    } catch (error) {
      console.warn('[Maintenance] Failed to notify photo update recipient:', {
        requestId,
        assignmentId,
        recipientId,
        error,
      });
    }
  }

  await logActivityEvent(
    accountId,
    actorUserId,
    'maintenance_photo_update',
    `Vendor uploaded maintenance photos`,
    {
      entityType: 'maintenance_request',
      entityId: requestId,
      metadata: {
        assignmentId,
        beforeCount: addedBefore.length,
        afterCount: addedAfter.length,
        recipientsNotified: notifiedRecipients,
      },
    }
  );

  return {
    beforeImages: nextBefore,
    afterImages: nextAfter,
    notifiedRecipients,
  };
}

export async function completeMaintenanceAssignmentAndCreatePaymentLink(
  accountId: string,
  actorUserId: string,
  params: {
    assignmentId: string;
    requestId: string;
    actualCost: number;
    notes?: string | null;
  }
): Promise<{
  checkoutSessionId: string;
  paymentUrl: string;
  notifiedRecipients: string[];
}> {
  const { assignmentId, requestId } = params;
  const normalizedCost = Number(params.actualCost);

  if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) {
    throw new Error('actualCost must be a number greater than 0');
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('maintenance_assignments')
    .select('id, request_id, vendor_profile_id, status, before_images, after_images')
    .eq('id', assignmentId)
    .eq('request_id', requestId)
    .eq('account_id', accountId)
    .single();

  if (assignmentError || !assignment) {
    throw new Error('Maintenance assignment not found');
  }

  if (!assignment.vendor_profile_id) {
    throw new Error('No vendor is assigned to this maintenance request');
  }

  let vendorProfile: any = null;
  let vendorError: any = null;

  ({ data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('id, user_id, business_name, email, stripe_connected_account_id')
    .eq('id', assignment.vendor_profile_id)
    .eq('account_id', accountId)
    .single());

  if (vendorError && isMissingColumnError(vendorError, 'stripe_connected_account_id')) {
    ({ data: vendorProfile, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, business_name, email')
      .eq('id', assignment.vendor_profile_id)
      .eq('account_id', accountId)
      .single());
  }

  if (vendorError || !vendorProfile) {
    throw new Error('Assigned vendor profile was not found');
  }

  if (vendorProfile.user_id !== actorUserId) {
    throw new Error('You are not assigned to this maintenance request');
  }

  let vendorStripeAccountId = String(vendorProfile.stripe_connected_account_id || '').trim();
  if (!vendorStripeAccountId) {
    const discoveredStripeAccountId = await findVendorStripeAccountIdByMetadata({
      accountId,
      vendorProfileId: vendorProfile.id,
      vendorUserId: vendorProfile.user_id,
    });
    vendorStripeAccountId = String(discoveredStripeAccountId || '').trim();
  }

  if (!vendorStripeAccountId) {
    throw new Error('Vendor Stripe account is not connected. Complete Stripe onboarding in the vendor portal before requesting payout.');
  }
  if (!vendorStripeAccountId.startsWith('acct_')) {
    throw new Error('Vendor Stripe account ID is invalid. Expected value starting with acct_.');
  }

  try {
    const stripeAccount = await stripe.accounts.retrieve(vendorStripeAccountId);
    if (!stripeAccount?.charges_enabled || !stripeAccount?.payouts_enabled) {
      throw new Error('Vendor Stripe account is not fully enabled for charges/payouts.');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unable to verify vendor Stripe account: ${error.message}`);
    }
    throw new Error('Unable to verify vendor Stripe account');
  }

  const { data: request, error: requestError } = await supabase
    .from('maintenance_requests')
    .select(
      `
      id,
      title,
      description,
      property_id,
      unit_id,
      requested_at,
      images,
      reported_by,
      properties(name, address1, address2, city, state, zip),
      units(unit_number)
    `
    )
    .eq('id', requestId)
    .eq('account_id', accountId)
    .single();

  if (requestError || !request) {
    throw new Error('Maintenance request not found');
  }

  const amountInCents = Math.round(normalizedCost * 100);
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    throw new Error('Invalid maintenance completion cost');
  }

  const property = normalizeRelation<any>(request.properties);
  const unit = normalizeRelation<any>(request.units);
  const propertyName = property?.name || 'Property';
  const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : null;
  const vendorName = vendorProfile.business_name || 'Assigned vendor';

  const metadata: Record<string, string> = {
    account_id: accountId,
    request_id: requestId,
    assignment_id: assignmentId,
    vendor_profile_id: assignment.vendor_profile_id,
    vendor_user_id: vendorProfile.user_id,
    payment_type: 'vendor_maintenance_payout',
    vendor_stripe_account_id: vendorStripeAccountId,
  };

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountInCents,
          product_data: {
            name: `Vendor Bill - ${request.title || 'Maintenance Request'}`,
            description: [propertyName, unitLabel].filter(Boolean).join(' • ') || undefined,
          },
        },
      },
    ],
    success_url: `${config.frontendUrl}/app/maintenance?vendor_bill=paid&request_id=${encodeURIComponent(requestId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.frontendUrl}/app/maintenance?vendor_bill=cancelled&request_id=${encodeURIComponent(requestId)}`,
    metadata,
    payment_intent_data: {
      metadata,
      transfer_data: {
        destination: vendorStripeAccountId,
      },
    },
  });

  if (!checkoutSession.url) {
    throw new Error('Stripe checkout URL was not returned');
  }

  const nowIso = new Date().toISOString();
  const completionNotes = params.notes?.trim() || null;

  const { error: updateAssignmentError } = await supabase
    .from('maintenance_assignments')
    .update({
      status: 'completed',
      completed_at: nowIso,
      completion_notes: completionNotes,
    })
    .eq('id', assignmentId)
    .eq('request_id', requestId)
    .eq('account_id', accountId);

  if (updateAssignmentError) {
    throw updateAssignmentError;
  }

  const { error: updateRequestError } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'completed',
      completed_at: nowIso,
      actual_cost: normalizedCost,
    })
    .eq('id', requestId)
    .eq('account_id', accountId);

  if (updateRequestError) {
    throw updateRequestError;
  }

  await logActivityEvent(
    accountId,
    actorUserId,
    'maintenance_completed',
    `Maintenance request completed by vendor: ${request.title || requestId}`,
    {
      entityType: 'maintenance_request',
      entityId: requestId,
      metadata: {
        assignmentId,
        actualCost: normalizedCost,
        checkoutSessionId: checkoutSession.id,
      },
    }
  );

  const recipients = new Set<string>();
  const assigningOwnerUserId = await resolveAssigningOwnerUserId(accountId, requestId);
  if (assigningOwnerUserId && assigningOwnerUserId !== actorUserId) {
    recipients.add(assigningOwnerUserId);
  }

  const { data: ownerMembers, error: ownerMembersError } = await supabase
    .from('account_members')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .in('role', ['owner', 'manager', 'admin']);

  if (!ownerMembersError) {
    (ownerMembers || []).forEach((member: any) => {
      if (member.user_id && member.user_id !== actorUserId) {
        recipients.add(member.user_id);
      }
    });
  }

  if (recipients.size === 0) {
    const fallbackUserId = request.reported_by || null;
    if (fallbackUserId && fallbackUserId !== actorUserId) {
      recipients.add(fallbackUserId);
    }
  }

  if (request.reported_by && request.reported_by !== actorUserId) {
    recipients.add(request.reported_by);
  }

  const recipientIds = Array.from(recipients);
  if (recipientIds.length === 0) {
    return {
      checkoutSessionId: checkoutSession.id,
      paymentUrl: checkoutSession.url,
      notifiedRecipients: [],
    };
  }

  const issueImages = normalizeImageUrls(request.images);
  const beforeImages = normalizeImageUrls(assignment.before_images);
  const afterImages = normalizeImageUrls(assignment.after_images);
  const subject = `Job completed: ${request.title || requestId}`;
  const messageLines = [
    `${vendorName} marked this maintenance job as completed.`,
    `Title: ${request.title || 'N/A'}`,
    `Property: ${propertyName}${unit?.unit_number ? ` #${unit.unit_number}` : ''}`,
    `Address: ${formatPropertyAddress(property) || 'N/A'}`,
    `Total Cost: ${formatUsdAmount(normalizedCost)}`,
    ...(completionNotes ? [`Completion Notes: ${completionNotes}`] : []),
    ...formatPhotoLines('Tenant issue photos:', issueImages),
    ...formatPhotoLines('Vendor before-work photos:', beforeImages),
    ...formatPhotoLines('Vendor after-work photos:', afterImages),
    `Pay vendor via Stripe: ${checkoutSession.url}`,
  ];

  const notificationMessage = [
    `Job completed: ${request.title || 'Maintenance request'}`,
    `Vendor: ${vendorName}`,
    `Cost: ${formatUsdAmount(normalizedCost)}`,
    ...(completionNotes ? [`Notes: ${completionNotes}`] : []),
    ...formatPhotoLines('Before-work photos:', beforeImages),
    ...formatPhotoLines('After-work photos:', afterImages),
    `Pay vendor: ${checkoutSession.url}`,
  ].join('\n');

  const { sendMessage } = await import('./communicationsService');
  const notifiedRecipients: string[] = [];
  for (const recipientId of recipientIds) {
    try {
      await sendMessage(accountId, actorUserId, {
        recipientId,
        subject,
        body: messageLines.join('\n'),
        propertyId: request.property_id || undefined,
        unitId: request.unit_id || undefined,
      });
      notifiedRecipients.push(recipientId);
    } catch (error) {
      console.warn('[Maintenance] Failed to send completion message to recipient:', {
        requestId,
        assignmentId,
        recipientId,
        error,
      });
    }
  }

  try {
    await notifyMaintenanceUsers({
      accountId,
      recipientIds,
      requestId,
      title: subject,
      message: notificationMessage,
      payload: {
        requestId,
        assignmentId,
        paymentUrl: checkoutSession.url,
        actualCost: normalizedCost,
        status: 'completed',
      },
    });
  } catch (notificationError) {
    console.warn('[Maintenance] Failed to create completion notifications:', notificationError);
  }

  return {
    checkoutSessionId: checkoutSession.id,
    paymentUrl: checkoutSession.url,
    notifiedRecipients,
  };
}

export async function notifyVendorPayoutCompleted(params: {
  accountId: string;
  requestId: string;
  assignmentId?: string | null;
  vendorUserId: string;
  amount?: number | null;
  checkoutSessionId?: string | null;
}): Promise<void> {
  const { accountId, requestId, assignmentId, vendorUserId, amount, checkoutSessionId } = params;

  const { data: request } = await supabase
    .from('maintenance_requests')
    .select('title')
    .eq('id', requestId)
    .eq('account_id', accountId)
    .maybeSingle();

  await notifyMaintenanceUsers({
    accountId,
    recipientIds: [vendorUserId],
    requestId,
    title: 'Vendor payment completed',
    message: [
      `Payment for ${request?.title || 'your maintenance job'} has been completed.`,
      amount ? `Amount: ${formatUsdAmount(amount)}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    payload: {
      requestId,
      assignmentId: assignmentId || null,
      checkoutSessionId: checkoutSessionId || null,
      amount: amount ?? null,
      paymentStatus: 'paid',
    },
  });

  await logActivityEvent(
    accountId,
    vendorUserId,
    'vendor_payment_completed',
    `Vendor payment completed for maintenance request ${requestId}`,
    {
      entityType: 'maintenance_request',
      entityId: requestId,
      metadata: {
        assignmentId: assignmentId || null,
        checkoutSessionId: checkoutSessionId || null,
        amount: amount ?? null,
      },
    }
  );
}

export async function getMaintenanceRequestVendorContext(
  accountId: string,
  requestId: string
): Promise<{ category: string; propertyZip: string | null }> {
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('category, properties(zip)')
    .eq('id', requestId)
    .eq('account_id', accountId)
    .single();

  if (error || !data) {
    throw error || new Error('Request not found');
  }

  return {
    category: data.category || 'general',
    propertyZip: data.properties?.[0]?.zip || null,
  };
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
  if (!payload.notificationEmail) {
    return { channel: 'email', sent: false, error: 'No emergency notification email configured' };
  }

  try {
    await sendResendEmail({
      to: payload.notificationEmail,
      subject: `Emergency Maintenance: ${payload.title}`,
      text: buildEmergencyMessage(payload),
    });

    return { channel: 'email', sent: true };
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
