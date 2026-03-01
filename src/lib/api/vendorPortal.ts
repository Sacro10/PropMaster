/**
 * Vendor portal API helpers
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, getCurrentUser } from './client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface VendorProfileSummary {
  id: string;
  account_id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  stripe_connected_account_id?: string | null;
}

export interface VendorJob {
  id: string;
  request_id: string;
  vendor_profile_id: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled';
  assigned_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  vendor_notes: string | null;
  completion_notes: string | null;
  before_images: any;
  after_images: any;
  request: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    priority: string | null;
    status: string | null;
    requested_at: string | null;
    scheduled_for: string | null;
    actual_cost: number | null;
    estimated_cost: number | null;
    images: any;
    property: {
      id: string;
      name: string | null;
      address1: string | null;
      address2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    } | null;
    unit: {
      id: string;
      unit_number: string | null;
      bedrooms: number | null;
      bathrooms: number | null;
      sqft: number | null;
    } | null;
  };
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

export async function getVendorProfile(): Promise<VendorProfileSummary | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  let data: any = null;
  let error: any = null;
  const attempts = [
    { includeActive: true, orderByCreatedAt: true },
    { includeActive: true, orderByCreatedAt: false },
    { includeActive: false, orderByCreatedAt: true },
    { includeActive: false, orderByCreatedAt: false },
  ];

  for (const attempt of attempts) {
    let query = supabase
      // @ts-ignore - vendor_profiles table may not exist in generated types
      .from('vendor_profiles')
      .select('*')
      .eq('user_id', user.id);

    if (attempt.includeActive) {
      query = query.eq('is_active', true);
    }

    if (attempt.orderByCreatedAt) {
      query = query.order('created_at', { ascending: false });
    }

    ({ data, error } = await query.limit(1));

    if (!error) {
      break;
    }

    const canRetry =
      (attempt.includeActive && isMissingColumnError(error, 'is_active')) ||
      (attempt.orderByCreatedAt && isMissingColumnError(error, 'created_at'));

    if (!canRetry) {
      break;
    }
  }

  if (error) {
    console.warn('[Vendor Portal] Failed to load vendor profile:', error);
    return null;
  }

  const record = Array.isArray(data) ? data[0] : data;
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    account_id: record.account_id,
    business_name: record.business_name ?? record.company_name ?? record.contact_name ?? null,
    phone: record.phone ?? null,
    email: record.email ?? null,
    stripe_connected_account_id: record.stripe_connected_account_id ?? null,
  } as VendorProfileSummary;
}

function isMissingColumnError(error: any, column: string) {
  const message = String(error?.message || '').toLowerCase();
  const columnLower = column.toLowerCase();
  const code = String(error?.code || '');

  return (
    message.includes(`column "${columnLower}"`) ||
    message.includes(`column '${columnLower}'`) ||
    message.includes('does not exist') ||
    code === '42703' ||
    code === 'PGRST204'
  );
}

export async function updateVendorStripeConnectedAccountId(
  stripeAccountId: string
): Promise<{ stripeConnectedAccountId: string | null }> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('No active session');
  }

  const vendorProfile = await getVendorProfile();
  if (!vendorProfile?.id) {
    throw new Error('Vendor profile not found');
  }

  const accountId = await getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account ID found');
  }

  const trimmed = stripeAccountId.trim();
  if (trimmed && !trimmed.startsWith('acct_')) {
    throw new Error('Stripe account ID must start with acct_.');
  }

  // @ts-ignore - vendor_profiles table may not exist in generated types
  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({
      stripe_connected_account_id: trimmed || null,
    })
    .eq('id', vendorProfile.id)
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .select('stripe_connected_account_id')
    .single();

  if (error) {
    if (isMissingColumnError(error, 'stripe_connected_account_id')) {
      throw new Error('Stripe account column is missing on vendor_profiles. Run the latest database migration.');
    }
    throw error;
  }

  return {
    stripeConnectedAccountId: data?.stripe_connected_account_id || null,
  };
}

export async function createVendorStripeConnectOnboardingLink(): Promise<{
  url: string;
  stripeConnectedAccountId: string;
  mode: 'onboarding' | 'update';
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }

  const response = await fetch(`${API_BASE}/api/maintenance/vendor/stripe-connect/onboarding-link`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (
      response.status === 404 ||
      String(payload?.error || '').toLowerCase() === 'not found'
    ) {
      throw new Error(
        'Stripe onboarding endpoint is unavailable on the backend. Restart/update the API server and try again.'
      );
    }
    throw new Error(payload?.details || payload?.error || 'Failed to create Stripe onboarding link');
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.url || !payload?.stripeConnectedAccountId) {
    throw new Error('Stripe onboarding link response is invalid');
  }

  return {
    url: String(payload.url),
    stripeConnectedAccountId: String(payload.stripeConnectedAccountId),
    mode: payload.mode === 'update' ? 'update' : 'onboarding',
  };
}

async function getOrCreateExpenseCategory(accountId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // @ts-ignore - expense_categories table may not exist in generated types
  const { data: existing, error: existingError } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', trimmed)
    .limit(1);

  if (existingError) throw existingError;
  if (existing && existing.length > 0) {
    return existing[0].id as string;
  }

  // @ts-ignore - expense_categories table may not exist in generated types
  const { data: created, error: createdError } = await supabase
    .from('expense_categories')
    .insert({ account_id: accountId, name: trimmed })
    .select('id')
    .single();

  if (createdError) throw createdError;
  return created?.id || null;
}

export async function upsertVendorExpense(params: {
  amount: number;
  expenseDate: string;
  description?: string | null;
  propertyId?: string | null;
  unitId?: string | null;
  vendorProfileId?: string | null;
  maintenanceRequestId: string;
  categoryName?: string;
}) {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account ID found');
  }

  const categoryId = await getOrCreateExpenseCategory(accountId, params.categoryName || 'Maintenance');

  // @ts-ignore - expenses table may not exist in generated types
  const { data: existing } = await supabase
    .from('expenses')
    .select('id')
    .eq('account_id', accountId)
    .eq('maintenance_request_id', params.maintenanceRequestId)
    .maybeSingle();

  const payload = {
    account_id: accountId,
    amount: params.amount,
    expense_date: params.expenseDate,
    description: params.description || null,
    category_id: categoryId,
    property_id: params.propertyId || null,
    unit_id: params.unitId || null,
    vendor_profile_id: params.vendorProfileId || null,
    maintenance_request_id: params.maintenanceRequestId,
    payment_method: 'manual',
  };

  if (existing?.id) {
    // @ts-ignore - expenses table may not exist in generated types
    const { error } = await supabase
      .from('expenses')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  // @ts-ignore - expenses table may not exist in generated types
  const { error } = await supabase
    .from('expenses')
    .insert(payload);
  if (error) throw error;
}

export async function getVendorJobs(): Promise<VendorJob[]> {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account ID found');
  }

  const vendorProfile = await getVendorProfile();
  if (!vendorProfile) {
    return [];
  }

  // @ts-ignore - maintenance_assignments table may not exist in generated types
  const { data, error } = await supabase
    .from('maintenance_assignments')
    .select(`
      id,
      request_id,
      vendor_profile_id,
      status,
      assigned_at,
      accepted_at,
      started_at,
      completed_at,
      vendor_notes,
      completion_notes,
      before_images,
      after_images,
      maintenance_requests (
        id,
        title,
        description,
        category,
        priority,
        status,
        requested_at,
        scheduled_for,
        actual_cost,
        estimated_cost,
        images,
        properties (
          id,
          name,
          address1,
          address2,
          city,
          state,
          zip
        ),
        units (
          id,
          unit_number,
          bedrooms,
          bathrooms,
          sqft
        )
      )
    `)
    .eq('account_id', accountId)
    .eq('vendor_profile_id', vendorProfile.id)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('[Vendor Portal] Failed to load jobs:', error);
    throw error;
  }

  return (data || []).map((row: any) => {
    const request = normalizeRelation(row.maintenance_requests);
    const property = normalizeRelation(request?.properties);
    const unit = normalizeRelation(request?.units);

    return {
      id: row.id,
      request_id: row.request_id,
      vendor_profile_id: row.vendor_profile_id ?? null,
      status: row.status,
      assigned_at: row.assigned_at,
      accepted_at: row.accepted_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      vendor_notes: row.vendor_notes ?? null,
      completion_notes: row.completion_notes ?? null,
      before_images: row.before_images ?? null,
      after_images: row.after_images ?? null,
      request: {
        id: request?.id || row.request_id,
        title: request?.title || 'Untitled request',
        description: request?.description ?? null,
        category: request?.category ?? null,
        priority: request?.priority ?? null,
        status: request?.status ?? null,
        requested_at: request?.requested_at ?? null,
        scheduled_for: request?.scheduled_for ?? null,
        actual_cost: request?.actual_cost ?? null,
        estimated_cost: request?.estimated_cost ?? null,
        images: request?.images ?? null,
        property: property
          ? {
              id: property.id,
              name: property.name ?? null,
              address1: property.address1 ?? null,
              address2: property.address2 ?? null,
              city: property.city ?? null,
              state: property.state ?? null,
              zip: property.zip ?? null,
            }
          : null,
        unit: unit
          ? {
              id: unit.id,
              unit_number: unit.unit_number ?? null,
              bedrooms: unit.bedrooms ?? null,
              bathrooms: unit.bathrooms ?? null,
              sqft: unit.sqft ?? null,
            }
          : null,
      },
    } as VendorJob;
  });
}

export async function updateVendorJobDetails(params: {
  assignmentId: string;
  requestId: string;
  notes: string | null;
  actualCost: number | null;
}) {
  const { assignmentId, requestId, notes, actualCost } = params;

  // @ts-ignore - maintenance_assignments table may not exist in generated types
  const assignmentUpdate = supabase
    .from('maintenance_assignments')
    .update({ vendor_notes: notes })
    .eq('id', assignmentId)
    .eq('request_id', requestId);

  // @ts-ignore - maintenance_requests table may not exist in generated types
  const requestUpdate = supabase
    .from('maintenance_requests')
    .update({ actual_cost: actualCost })
    .eq('id', requestId);

  const [assignmentResult, requestResult] = await Promise.all([assignmentUpdate, requestUpdate]);

  if (assignmentResult.error) throw assignmentResult.error;
  if (requestResult.error) throw requestResult.error;
}

export async function updateVendorJobPhotos(params: {
  assignmentId: string;
  requestId: string;
  beforeImages?: string[] | null;
  afterImages?: string[] | null;
}) {
  const { assignmentId, requestId, beforeImages, afterImages } = params;

  const updates: Record<string, any> = {};
  if (Array.isArray(beforeImages)) updates.before_images = beforeImages;
  if (Array.isArray(afterImages)) updates.after_images = afterImages;

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }

  const response = await fetch(`${API_BASE}/api/maintenance/assignments/${assignmentId}/photos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      beforeImages: updates.before_images,
      afterImages: updates.after_images,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.details || payload?.error || 'Failed to update work photos');
  }
}

export async function updateVendorJobStatus(params: {
  assignmentId: string;
  requestId: string;
  nextStatus: 'in_progress' | 'completed';
  notes?: string | null;
  actualCost?: number | null;
  propertyId?: string | null;
  unitId?: string | null;
  vendorProfileId?: string | null;
}) {
  const { assignmentId, requestId, nextStatus, notes = null, actualCost, propertyId, unitId, vendorProfileId } = params;
  const timestamp = new Date().toISOString();

  if (nextStatus === 'completed') {
    if (typeof actualCost !== 'number' || !Number.isFinite(actualCost) || actualCost <= 0) {
      throw new Error('A valid completion cost is required.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/maintenance/assignments/${assignmentId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        actualCost,
        notes,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(
        payload?.details ||
          payload?.error ||
          (response.status === 404
            ? 'Completion endpoint missing on backend. Restart/update the API server to enable owner notification + Stripe payout flow.'
            : 'Failed to complete maintenance assignment'),
      );
    }

    const payload = await response.json().catch(() => null);
    if (!payload?.success) {
      throw new Error(payload?.details || payload?.error || 'Failed to complete maintenance assignment');
    }
    return payload;
  }

  const assignmentUpdate: Record<string, any> = {
    status: nextStatus,
  };

  const requestUpdate: Record<string, any> = {};

  if (nextStatus === 'in_progress') {
    assignmentUpdate.started_at = timestamp;
    assignmentUpdate.accepted_at = timestamp;
    requestUpdate.status = 'in_progress';
    requestUpdate.started_at = timestamp;
  }

  // @ts-ignore - maintenance_assignments table may not exist in generated types
  const assignmentResult = await supabase
    .from('maintenance_assignments')
    .update(assignmentUpdate)
    .eq('id', assignmentId)
    .eq('request_id', requestId);

  if (assignmentResult.error) throw assignmentResult.error;

  if (Object.keys(requestUpdate).length > 0) {
    // @ts-ignore - maintenance_requests table may not exist in generated types
    const requestResult = await supabase
      .from('maintenance_requests')
      .update(requestUpdate)
      .eq('id', requestId);

    if (requestResult.error) throw requestResult.error;
  }

}
