/**
 * Tenants API
 * Data access layer for tenant management
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { TenantWithLease, RentalApplication, PaginatedResponse } from './types';

/**
 * Get all active tenants with their lease and unit information
 */
export async function getTenants(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    // First, get all active leases with unit and property info
    const { data: leasesData, error: leasesError, count } = await supabase
      .from('leases')
      .select(`
        id,
        unit_id,
        lease_start,
        lease_end,
        rent,
        deposit,
        status,
        renewal_status,
        tenant_user_id,
        units (
          id,
          unit_number,
          property_id,
          bedrooms,
          bathrooms,
          sqft,
          rent_amount,
          status,
          properties (
            id,
            name,
            address1,
            address2,
            city,
            state,
            zip
          )
        )
      `, { count: 'exact' })
      .eq('account_id', accountId)
      .in('status', ['active', 'pending'])
      .order('lease_start', { ascending: false })
      .range(from, to);

    if (leasesError) {
      throw handleSupabaseError(leasesError, 'fetch tenants');
    }

    if (!leasesData || leasesData.length === 0) {
      return {
        data: [],
        ...calculatePaginationMeta(0, page, pageSize),
      };
    }

    // Get the tenant user IDs
    const tenantUserIds = leasesData.map((lease: any) => lease.tenant_user_id);

    // Fetch tenant profiles for these users
    const { data: tenantProfiles, error: profilesError } = await supabase
      .from('tenant_profiles')
      .select('*')
      .eq('account_id', accountId)
      .in('user_id', tenantUserIds);

    if (profilesError) {
      throw handleSupabaseError(profilesError, 'fetch tenant profiles');
    }

    // Create a map of user_id to tenant profile
    const profileMap = new Map();
    (tenantProfiles || []).forEach((profile: any) => {
      profileMap.set(profile.user_id, profile);
    });

    // Transform the data to match our interface
    const tenants: TenantWithLease[] = leasesData.map((lease: any) => {
      const tenant = profileMap.get(lease.tenant_user_id) || {};
      const unit = lease.units || {};
      const property = unit.properties || {};

      return {
        ...tenant,
        account_id: accountId,
        lease: {
          id: lease.id,
          unit_id: lease.unit_id,
          lease_start: lease.lease_start,
          lease_end: lease.lease_end,
          rent: lease.rent,
          deposit: lease.deposit,
          status: lease.status,
          renewal_status: lease.renewal_status,
        },
        unit: unit.id ? {
          id: unit.id,
          property_id: unit.property_id,
          unit_number: unit.unit_number,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          sqft: unit.sqft,
          rent_amount: unit.rent_amount,
          status: unit.status,
        } : null,
        property: property.id ? {
          id: property.id,
          name: property.name,
          address1: property.address1,
          address2: property.address2,
          city: property.city,
          state: property.state,
          zip: property.zip,
        } : null,
      };
    });

    const result: PaginatedResponse<TenantWithLease> = {
      data: tenants,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Tenants API] Error fetching tenants:', error);
    throw error;
  }
}

/**
 * Get pending rental applications
 */
export async function getRentalApplications(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    const { data, error, count } = await supabase
      .from('rental_applications')
      .select(`
        *,
        units (
          id,
          unit_number,
          property_id,
          bedrooms,
          bathrooms,
          sqft,
          rent_amount,
          status,
          properties (
            id,
            name,
            address1,
            address2,
            city,
            state,
            zip
          )
        )
      `, { count: 'exact' })
      .eq('account_id', accountId)
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch rental applications');
    }

    // Transform the data
    const applications: RentalApplication[] = (data || []).map((app: any) => {
      const unit = app.units || {};
      const property = unit.properties || {};

      return {
        ...app,
        unit: unit.id ? {
          id: unit.id,
          property_id: unit.property_id,
          unit_number: unit.unit_number,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          sqft: unit.sqft,
          rent_amount: unit.rent_amount,
          status: unit.status,
        } : undefined,
        property: property.id ? {
          id: property.id,
          name: property.name,
          address1: property.address1,
          address2: property.address2,
          city: property.city,
          state: property.state,
          zip: property.zip,
        } : undefined,
      };
    });

    const result: PaginatedResponse<RentalApplication> = {
      data: applications,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Tenants API] Error fetching applications:', error);
    throw error;
  }
}

/**
 * Get tenant screening metrics
 */
export async function getTenantScreeningMetrics() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Use RPC function to get aggregated metrics
    const { data, error } = await supabase.rpc('get_tenant_screening_metrics', {
      p_account_id: accountId
    });

    if (error) {
      // If RPC doesn't exist, calculate manually
      const [applicationsData, tenantsData] = await Promise.all([
        // Get all applications for screening time and acceptance rate
        supabase
          .from('rental_applications')
          .select('created_at, reviewed_at, status')
          .eq('account_id', accountId),

        // Get tenant profiles for AI accuracy and eviction rate
        supabase
          .from('tenant_profiles')
          .select('ai_risk_score, background_check_status, move_out_date, screening_notes')
          .eq('account_id', accountId),
      ]);

      // Calculate average screening time (hours)
      let avgScreeningTime = 0;
      if (applicationsData.data && applicationsData.data.length > 0) {
        const reviewedApps = applicationsData.data.filter(app => app.reviewed_at);
        if (reviewedApps.length > 0) {
          const totalHours = reviewedApps.reduce((sum, app) => {
            const created = new Date(app.created_at).getTime();
            const reviewed = new Date(app.reviewed_at!).getTime();
            const hours = (reviewed - created) / (1000 * 60 * 60);
            return sum + hours;
          }, 0);
          avgScreeningTime = totalHours / reviewedApps.length;
        }
      }

      // Calculate acceptance rate
      let acceptanceRate = 0;
      if (applicationsData.data && applicationsData.data.length > 0) {
        const decidedApps = applicationsData.data.filter(app =>
          app.status === 'approved' || app.status === 'rejected'
        );
        if (decidedApps.length > 0) {
          const approved = decidedApps.filter(app => app.status === 'approved').length;
          acceptanceRate = (approved / decidedApps.length) * 100;
        }
      }

      // Calculate AI accuracy (simplified: % of high-risk scores that passed background check)
      let aiAccuracy = 0;
      if (tenantsData.data && tenantsData.data.length > 0) {
        const tenantsWithScore = tenantsData.data.filter(t =>
          t.ai_risk_score !== null && t.background_check_status
        );
        if (tenantsWithScore.length > 0) {
          const accurate = tenantsWithScore.filter(t =>
            (t.ai_risk_score! >= 70 && t.background_check_status === 'approved') ||
            (t.ai_risk_score! < 70 && t.background_check_status === 'rejected')
          ).length;
          aiAccuracy = (accurate / tenantsWithScore.length) * 100;
        }
      }

      // Calculate eviction rate
      let evictionRate = 0;
      if (tenantsData.data && tenantsData.data.length > 0) {
        const movedOutTenants = tenantsData.data.filter(t => t.move_out_date);
        if (movedOutTenants.length > 0) {
          const evictions = movedOutTenants.filter(t =>
            t.screening_notes?.toLowerCase().includes('eviction')
          ).length;
          evictionRate = (evictions / movedOutTenants.length) * 100;
        }
      }

      return {
        avg_screening_time: Math.round(avgScreeningTime * 10) / 10,
        acceptance_rate: Math.round(acceptanceRate * 10) / 10,
        ai_accuracy: Math.round(aiAccuracy * 10) / 10,
        eviction_rate: Math.round(evictionRate * 10) / 10,
      };
    }

    return data || {
      avg_screening_time: 0,
      acceptance_rate: 0,
      ai_accuracy: 0,
      eviction_rate: 0,
    };
  } catch (error) {
    console.error('[Tenants API] Error fetching screening metrics:', error);
    return {
      avg_screening_time: 0,
      acceptance_rate: 0,
      ai_accuracy: 0,
      eviction_rate: 0,
    };
  }
}

/**
 * Approve a rental application
 */
export async function approveApplication(applicationId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('rental_applications')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'approve application');
    }

    return data;
  } catch (error) {
    console.error('[Tenants API] Error approving application:', error);
    throw error;
  }
}

/**
 * Reject a rental application
 */
export async function rejectApplication(applicationId: string, notes?: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('rental_applications')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', applicationId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'reject application');
    }

    return data;
  } catch (error) {
    console.error('[Tenants API] Error rejecting application:', error);
    throw error;
  }
}
