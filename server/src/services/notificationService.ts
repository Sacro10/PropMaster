import { supabaseAdmin as supabase } from '../supabase';

export type NotificationType =
  | 'payment_due'
  | 'payment_received'
  | 'maintenance_update'
  | 'lease_expiring'
  | 'message'
  | 'system'
  | 'announcement';

export interface NotificationInsert {
  accountId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  payload?: Record<string, any>;
  sentViaEmail?: boolean;
  sentViaSms?: boolean;
  sentViaPush?: boolean;
}

export async function createNotifications(entries: NotificationInsert[]): Promise<void> {
  const rows = entries
    .filter((entry) => entry.accountId && entry.userId && entry.title && entry.message)
    .map((entry) => ({
      account_id: entry.accountId,
      user_id: entry.userId,
      type: entry.type,
      title: entry.title,
      message: entry.message,
      action_url: entry.actionUrl || null,
      related_entity_type: entry.relatedEntityType || null,
      related_entity_id: entry.relatedEntityId || null,
      payload: entry.payload || {},
      sent_via_email: entry.sentViaEmail || false,
      sent_via_sms: entry.sentViaSms || false,
      sent_via_push: entry.sentViaPush || false,
    }));

  if (rows.length === 0) {
    return;
  }

  const dedupedRows = Array.from(
    new Map(
      rows.map((row) => [
        [
          row.account_id,
          row.user_id,
          row.type,
          row.title,
          row.message,
          row.action_url || '',
          row.related_entity_type || '',
          row.related_entity_id || '',
        ].join('::'),
        row,
      ])
    ).values()
  );

  const { error } = await supabase.from('notifications').insert(dedupedRows);

  if (error) {
    throw error;
  }
}

export async function getAccountRoleMap(
  accountId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const filteredIds = Array.from(new Set(userIds.filter(Boolean)));
  if (filteredIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('account_members')
    .select('user_id, role')
    .eq('account_id', accountId)
    .in('user_id', filteredIds);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((row: any) => [row.user_id, row.role]));
}

export async function getAccountUsersByRoles(
  accountId: string,
  roles: string[],
  options?: {
    excludeUserIds?: string[];
    activeOnly?: boolean;
  }
): Promise<string[]> {
  let query = supabase
    .from('account_members')
    .select('user_id')
    .eq('account_id', accountId)
    .in('role', roles);

  if (options?.activeOnly !== false) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const excluded = new Set((options?.excludeUserIds || []).filter(Boolean));
  return Array.from(
    new Set(
      (data || [])
        .map((row: any) => row.user_id)
        .filter((userId: string | null) => Boolean(userId) && !excluded.has(userId as string))
    )
  ) as string[];
}

export async function getUserDisplayName(
  accountId: string,
  userId: string
): Promise<string | null> {
  const { data: tenantProfile } = await supabase
    .from('tenant_profiles')
    .select('full_name')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (tenantProfile?.full_name) {
    return tenantProfile.full_name;
  }

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('business_name, contact_name')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (vendorProfile?.contact_name || vendorProfile?.business_name) {
    return vendorProfile.contact_name || vendorProfile.business_name;
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return null;
  }

  const fullName =
    typeof data.user.user_metadata?.full_name === 'string'
      ? data.user.user_metadata.full_name.trim()
      : '';

  return fullName || data.user.email || null;
}

export function buildMaintenanceActionUrl(role: string | null | undefined, requestId?: string | null) {
  if (role === 'vendor') {
    return requestId ? `/vendor/dashboard?request=${encodeURIComponent(requestId)}` : '/vendor/dashboard';
  }

  if (role === 'tenant') {
    return requestId
      ? `/portal/tenant?section=maintenance&request=${encodeURIComponent(requestId)}`
      : '/portal/tenant?section=maintenance';
  }

  return requestId
    ? `/app/maintenance?request=${encodeURIComponent(requestId)}`
    : '/app/maintenance';
}

export function buildCommunicationActionUrl(
  role: string | null | undefined,
  conversationId?: string | null,
  maintenanceRequestId?: string | null
) {
  if (role === 'vendor') {
    return maintenanceRequestId
      ? `/vendor/dashboard?request=${encodeURIComponent(maintenanceRequestId)}`
      : '/vendor/dashboard';
  }

  if (role === 'tenant') {
    return maintenanceRequestId
      ? `/portal/tenant?section=maintenance&request=${encodeURIComponent(maintenanceRequestId)}`
      : '/portal/tenant?section=notifications';
  }

  return conversationId
    ? `/app/communication?conversation=${encodeURIComponent(conversationId)}`
    : '/app/communication';
}

export function buildRentActionUrl(role: string | null | undefined, paymentId?: string | null) {
  if (role === 'tenant') {
    return paymentId
      ? `/portal/tenant?section=payments&payment=${encodeURIComponent(paymentId)}`
      : '/portal/tenant?section=payments';
  }

  return paymentId ? `/app/rent?payment=${encodeURIComponent(paymentId)}` : '/app/rent';
}

export function buildShowingActionUrl(showingId?: string | null) {
  return showingId ? `/app/showings?showing=${encodeURIComponent(showingId)}` : '/app/showings';
}

export function buildTenantActionUrl(tenantUserId?: string | null) {
  return tenantUserId ? `/app/tenants?tenant=${encodeURIComponent(tenantUserId)}` : '/app/tenants';
}
