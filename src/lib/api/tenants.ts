/**
 * Tenants API
 * Data access layer for tenant management
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { TenantWithLease, RentalApplication, PaginatedResponse } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function splitFullName(fullName?: string | null) {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function getApplicationNameParts(application: any) {
  const applicationData = application?.application_data || application?.applicationData || {};
  const firstName =
    applicationData.firstName ||
    applicationData.first_name ||
    '';
  const lastName =
    applicationData.lastName ||
    applicationData.last_name ||
    '';

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  return splitFullName(application?.full_name || application?.fullName || '');
}

function getApplicationAddress(application: any) {
  const applicationData = application?.application_data || application?.applicationData || {};
  return (
    applicationData.currentAddress ||
    applicationData.current_address ||
    application?.current_address ||
    application?.currentAddress ||
    null
  );
}

function getApplicationEmployer(application: any) {
  const applicationData = application?.application_data || application?.applicationData || {};
  return (
    application?.employer ||
    application?.current_employer ||
    applicationData.currentEmployer ||
    applicationData.current_employer ||
    application?.currentEmployer ||
    null
  );
}

function calculateTenantRiskScore(tenant: any, lease: any): number | null {
  const parts: Array<{ score: number; weight: number }> = [];

  if (tenant?.credit_score !== null && tenant?.credit_score !== undefined) {
    const normalized = clamp(((Number(tenant.credit_score) - 300) / 550) * 100, 0, 100);
    parts.push({ score: Math.round(normalized), weight: 0.4 });
  }

  const rent = lease?.rent ? Number(lease.rent) : (lease?.rent_amount ? Number(lease.rent_amount) : 0);
  if (tenant?.monthly_income !== null && tenant?.monthly_income !== undefined && rent > 0) {
    const ratio = Number(tenant.monthly_income) / rent;
    const ratioScore =
      ratio >= 3 ? 100 :
      ratio >= 2.5 ? 90 :
      ratio >= 2 ? 80 :
      ratio >= 1.5 ? 60 :
      ratio >= 1.2 ? 50 :
      ratio >= 1 ? 40 :
      20;
    parts.push({ score: ratioScore, weight: 0.3 });
  }

  if (tenant?.background_check_status) {
    const status = String(tenant.background_check_status).toLowerCase();
    const backgroundScore =
      status === 'approved' ? 90 :
      status === 'pending' ? 60 :
      status === 'rejected' ? 20 :
      70;
    parts.push({ score: backgroundScore, weight: 0.2 });
  }

  if (tenant?.employment_status) {
    const status = String(tenant.employment_status).toLowerCase();
    const employmentScore =
      status.includes('employed') || status.includes('self') ? 80 :
      status.includes('unemployed') ? 30 :
      status.includes('student') || status.includes('retired') ? 50 :
      60;
    parts.push({ score: employmentScore, weight: 0.1 });
  }

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const weightedScore = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return clamp(Math.round(weightedScore), 0, 100);
}

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
    const unitIds = leasesData.map((lease: any) => lease.unit_id).filter(Boolean);

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

    // Fetch recent applications for fallback tenant data
    const applicationsByUnit = new Map<string, any>();
    if (unitIds.length > 0) {
      const { data: applicationsData, error: applicationsError } = await supabase
        .from('rental_applications')
        .select('*')
        .eq('account_id', accountId)
        .in('unit_id', unitIds)
        .order('created_at', { ascending: false });

      if (applicationsError) {
        console.error('[Tenants API] Error fetching rental applications:', applicationsError);
      } else {
        (applicationsData || []).forEach((app: any) => {
          if (app.unit_id && !applicationsByUnit.has(app.unit_id)) {
            applicationsByUnit.set(app.unit_id, app);
          }
        });
      }
    }

    // Transform the data to match our interface
    const pendingRiskUpdates: Array<Promise<any>> = [];
    const tenants: TenantWithLease[] = leasesData.map((lease: any) => {
      const tenant = profileMap.get(lease.tenant_user_id) || {};
      const fallbackApplication = applicationsByUnit.get(lease.unit_id);
      const fallbackTenant = fallbackApplication ? {
        full_name: fallbackApplication.full_name
          || `${fallbackApplication.first_name || ''} ${fallbackApplication.last_name || ''}`.trim()
          || fallbackApplication.applicant_name,
        email: fallbackApplication.email || fallbackApplication.applicant_email,
        phone: fallbackApplication.phone || fallbackApplication.applicant_phone,
        monthly_income: fallbackApplication.monthly_income,
        credit_score: fallbackApplication.credit_score,
        background_check_status: fallbackApplication.background_check_status,
        employment_status: fallbackApplication.employment_status
          || (fallbackApplication.current_employer ? 'employed' : null),
        ai_risk_score: fallbackApplication.ai_risk_score,
      } : null;
      const mergedTenant = fallbackTenant ? { ...fallbackTenant, ...tenant } : tenant;
      const unit = lease.units || {};
      const property = unit.properties || {};
      
      // Calculate risk score if not already present
      let calculatedRiskScore = mergedTenant.ai_risk_score;
      if (calculatedRiskScore == null) {
        // Prepare lease data with fallback to unit rent
        const leaseWithRent = {
          ...lease,
          rent: lease.rent || unit.rent_amount || 0
        };
        calculatedRiskScore = calculateTenantRiskScore(mergedTenant, leaseWithRent);
        
        // Log if calculation failed to help debug
        if (calculatedRiskScore == null) {
          console.log('[Tenants API] Could not calculate risk score for tenant:', {
            hasCredit: !!mergedTenant.credit_score,
            hasIncome: !!mergedTenant.monthly_income,
            hasBackground: !!mergedTenant.background_check_status,
            hasEmployment: !!mergedTenant.employment_status,
            rent: leaseWithRent.rent
          });
        }
      }

      if (mergedTenant.user_id && mergedTenant.ai_risk_score == null && calculatedRiskScore != null) {
        pendingRiskUpdates.push(
          supabase
            .from('tenant_profiles')
            .update({ ai_risk_score: calculatedRiskScore })
            .eq('account_id', accountId)
            .eq('user_id', mergedTenant.user_id)
        );
      }

      return {
        ...mergedTenant,
        account_id: accountId,
        ai_risk_score: calculatedRiskScore,
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

    if (pendingRiskUpdates.length > 0) {
      await Promise.allSettled(pendingRiskUpdates);
    }

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
      const { firstName, lastName } = getApplicationNameParts(app);

      return {
        ...app,
        firstName,
        lastName,
        moveInDate: app.desired_move_in_date || app.move_in_date || null,
        currentEmployer: getApplicationEmployer(app),
        currentAddress: getApplicationAddress(app),
        monthlyIncome: app.monthly_income ?? null,
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/applications/${applicationId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to approve application');
      }
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to approve application');
    }

    return await response.json();
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/applications/${applicationId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: notes || null }),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to reject application');
      }
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to reject application');
    }

    return await response.json();
  } catch (error) {
    console.error('[Tenants API] Error rejecting application:', error);
    throw error;
  }
}
