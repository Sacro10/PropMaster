import { supabaseAdmin as supabase } from '../supabase';

function formatPropertyAddress(property: any) {
  if (!property) return '';
  const parts = [property.address1, property.address2].filter(Boolean);
  const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(' ');
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(', ');
}

export interface Tenant {
  id: string;
  userId: string | null;
  unitId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  leaseStart: string;
  leaseEnd: string;
  rentAmount: number;
  depositAmount: number | null;
  createdAt: string;
  unit?: {
    unitNumber: string;
    property: {
      name: string;
      address: string;
    };
  };
}

export interface CreateTenantData {
  unitId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  leaseStart: string;
  leaseEnd: string;
  rentAmount: number;
  depositAmount?: number;
}

export interface UpdateTenantData {
  phone?: string;
  status?: string;
  leaseEnd?: string;
  rentAmount?: number;
}

/**
 * Get all tenants for an account with optional filtering and search
 */
export async function getTenants(
  accountId: string,
  filters?: {
    status?: string;
    unitId?: string;
    propertyId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ tenants: Tenant[]; total: number }> {
  const { status, unitId, propertyId, search, limit = 50, offset = 0 } = filters || {};

  let query = supabase
    .from('tenants')
    .select(
      `
      *,
      unit:units!inner(
        unit_number,
        property:properties!inner(name, address1, address2, city, state, zip)
      )
    `,
      { count: 'exact' }
    )
    .eq('account_id', accountId);

  if (status) {
    query = query.eq('status', status);
  }
  if (unitId) {
    query = query.eq('unit_id', unitId);
  }
  if (propertyId) {
    query = query.eq('unit.property_id', propertyId);
  }

  // Add search functionality
  if (search && search.trim().length > 0) {
    const searchTerm = `%${search.trim()}%`;
    query = query.or(
      `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`
    );
  }

  query = query.order('created_at', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const tenants: Tenant[] =
    data?.map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      unitId: t.unit_id,
      firstName: t.first_name,
      lastName: t.last_name,
      email: t.email,
      phone: t.phone,
      status: t.status,
      leaseStart: t.lease_start,
      leaseEnd: t.lease_end,
      rentAmount: Number(t.rent_amount),
      depositAmount: t.deposit_amount ? Number(t.deposit_amount) : null,
      createdAt: t.created_at,
      unit: t.unit
        ? {
            unitNumber: t.unit.unit_number,
            property: {
              name: t.unit.property.name,
              address: formatPropertyAddress(t.unit.property),
            },
          }
        : undefined,
    })) || [];

  return { tenants, total: count || 0 };
}

/**
 * Get a single tenant by ID
 */
export async function getTenantById(
  accountId: string,
  tenantId: string
): Promise<Tenant | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select(
      `
      *,
      unit:units!inner(
        unit_number,
        property:properties!inner(name, address1, address2, city, state, zip)
      )
    `
    )
    .eq('account_id', accountId)
    .eq('id', tenantId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return {
    id: data.id,
    userId: data.user_id,
    unitId: data.unit_id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    status: data.status,
    leaseStart: data.lease_start,
    leaseEnd: data.lease_end,
    rentAmount: Number(data.rent_amount),
    depositAmount: data.deposit_amount ? Number(data.deposit_amount) : null,
    createdAt: data.created_at,
    unit: data.unit
      ? {
        unitNumber: data.unit.unit_number,
        property: {
          name: data.unit.property.name,
          address: formatPropertyAddress(data.unit.property),
        },
      }
    : undefined,
  };
}

/**
 * Create a new tenant
 */
export async function createTenant(
  accountId: string,
  tenantData: CreateTenantData
): Promise<Tenant> {
  // Verify the unit belongs to this account
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('id, property_id')
    .eq('id', tenantData.unitId)
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

  const { data, error } = await supabase
    .from('tenants')
    .insert({
      account_id: accountId,
      unit_id: tenantData.unitId,
      first_name: tenantData.firstName,
      last_name: tenantData.lastName,
      email: tenantData.email,
      phone: tenantData.phone,
      status: 'active',
      lease_start: tenantData.leaseStart,
      lease_end: tenantData.leaseEnd,
      rent_amount: tenantData.rentAmount,
      deposit_amount: tenantData.depositAmount,
    })
    .select(
      `
      *,
      unit:units!inner(
        unit_number,
        property:properties!inner(name, address1, address2, city, state, zip)
      )
    `
    )
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    unitId: data.unit_id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    status: data.status,
    leaseStart: data.lease_start,
    leaseEnd: data.lease_end,
    rentAmount: Number(data.rent_amount),
    depositAmount: data.deposit_amount ? Number(data.deposit_amount) : null,
    createdAt: data.created_at,
    unit: data.unit
      ? {
        unitNumber: data.unit.unit_number,
        property: {
          name: data.unit.property.name,
          address: formatPropertyAddress(data.unit.property),
        },
      }
    : undefined,
  };
}

/**
 * Update a tenant
 */
export async function updateTenant(
  accountId: string,
  tenantId: string,
  updates: UpdateTenantData
): Promise<Tenant> {
  // Verify tenant belongs to account
  const existing = await getTenantById(accountId, tenantId);
  if (!existing) {
    throw new Error('Tenant not found');
  }

  const updateData: any = {};
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.status) updateData.status = updates.status;
  if (updates.leaseEnd) updateData.lease_end = updates.leaseEnd;
  if (updates.rentAmount) updateData.rent_amount = updates.rentAmount;

  const { data, error } = await supabase
    .from('tenants')
    .update(updateData)
    .eq('id', tenantId)
    .eq('account_id', accountId)
    .select(
      `
      *,
      unit:units!inner(
        unit_number,
        property:properties!inner(name, address1, address2, city, state, zip)
      )
    `
    )
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    unitId: data.unit_id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    status: data.status,
    leaseStart: data.lease_start,
    leaseEnd: data.lease_end,
    rentAmount: Number(data.rent_amount),
    depositAmount: data.deposit_amount ? Number(data.deposit_amount) : null,
    createdAt: data.created_at,
    unit: data.unit
      ? {
        unitNumber: data.unit.unit_number,
        property: {
          name: data.unit.property.name,
          address: formatPropertyAddress(data.unit.property),
        },
      }
    : undefined,
  };
}

/**
 * Delete a tenant lease and optionally the tenant profile if no other leases exist
 */
export async function deleteTenantLease(
  accountId: string,
  leaseId: string,
  tenantUserId?: string | null
): Promise<void> {
  const { data: lease, error: leaseError } = await supabase
    .from('leases')
    .select('id, tenant_user_id')
    .eq('account_id', accountId)
    .eq('id', leaseId)
    .single();

  if (leaseError) {
    if (leaseError.code === 'PGRST116') {
      throw new Error('Tenant lease not found');
    }
    throw leaseError;
  }

  const userId = tenantUserId || lease?.tenant_user_id;

  const { error: deleteError } = await supabase
    .from('leases')
    .delete()
    .eq('account_id', accountId)
    .eq('id', leaseId);

  if (deleteError) throw deleteError;

  if (!userId) return;

  const { count: otherLeaseCount, error: otherLeaseError } = await supabase
    .from('leases')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('tenant_user_id', userId);

  if (otherLeaseError) throw otherLeaseError;

  if ((otherLeaseCount || 0) === 0) {
    const { error: profileDeleteError } = await supabase
      .from('tenant_profiles')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (profileDeleteError) throw profileDeleteError;
  }
}
