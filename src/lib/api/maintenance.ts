/**
 * Maintenance API
 * Data access layer for maintenance management
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { MaintenanceRequestWithDetails, HVACFilterSubscription, PaginatedResponse } from './types';

/**
 * Get maintenance requests with full details
 */
export async function getMaintenanceRequests(params: PaginationParams & { status?: string } = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    let query = supabase
      .from('maintenance_requests')
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
          status
        ),
        properties (
          id,
          name,
          address1,
          address2,
          city,
          state,
          zip
        ),
        maintenance_assignments (
          id,
          request_id,
          vendor_profile_id,
          status,
          assigned_at,
          accepted_at,
          completed_at,
          vendor_profiles (
            id,
            business_name,
            phone,
            email,
            avg_rating,
            total_jobs_completed
          )
        )
      `, { count: 'exact' })
      .eq('account_id', accountId);

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error, count } = await query
      .order('requested_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch maintenance requests');
    }

    // Transform the data
    const requests: MaintenanceRequestWithDetails[] = (data || []).map((req: any) => {
      const unit = req.units || {};
      const property = req.properties || {};
      const assignment = req.maintenance_assignments?.[0] || null;

      return {
        ...req,
        unit,
        property,
        assignment: assignment ? {
          id: assignment.id,
          request_id: assignment.request_id,
          vendor_profile_id: assignment.vendor_profile_id,
          status: assignment.status,
          assigned_at: assignment.assigned_at,
          accepted_at: assignment.accepted_at,
          completed_at: assignment.completed_at,
          vendor: assignment.vendor_profiles || null,
        } : null,
        tenant_name: null, // TODO: Join with tenant if needed
      };
    });

    const result: PaginatedResponse<MaintenanceRequestWithDetails> = {
      data: requests,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Maintenance API] Error fetching requests:', error);
    throw error;
  }
}

/**
 * Get maintenance statistics
 */
export async function getMaintenanceStats() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get counts for different statuses
    const [activeResult, avgResponseResult, completionResult] = await Promise.all([
      supabase
        .from('maintenance_requests')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['submitted', 'reviewed', 'assigned', 'scheduled', 'in_progress']),

      supabase
        .from('maintenance_requests')
        .select('requested_at, reviewed_at')
        .eq('account_id', accountId)
        .not('reviewed_at', 'is', null)
        .order('requested_at', { ascending: false })
        .limit(100),

      supabase
        .from('maintenance_requests')
        .select('id, status', { count: 'exact' })
        .eq('account_id', accountId)
        .eq('status', 'completed')
    ]);

    // Calculate average response time
    let avgResponseHours = 2.3;
    if (avgResponseResult.data && avgResponseResult.data.length > 0) {
      const responseTimes = avgResponseResult.data
        .map((req: any) => {
          const requested = new Date(req.requested_at);
          const reviewed = new Date(req.reviewed_at);
          return (reviewed.getTime() - requested.getTime()) / (1000 * 60 * 60);
        });
      avgResponseHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    const totalRequests = (activeResult.count || 0) + (completionResult.count || 0);
    const completionRate = totalRequests > 0
      ? ((completionResult.count || 0) / totalRequests) * 100
      : 94;

    return {
      active_requests: activeResult.count || 0,
      avg_response_time: avgResponseHours.toFixed(1),
      completion_rate: completionRate.toFixed(0),
      emergency_support: '24/7',
    };
  } catch (error) {
    console.error('[Maintenance API] Error fetching stats:', error);
    return {
      active_requests: 0,
      avg_response_time: '0',
      completion_rate: '0',
      emergency_support: '24/7',
    };
  }
}

/**
 * Create a new maintenance request
 */
export async function createMaintenanceRequest(request: {
  unit_id: string;
  property_id: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'emergency';
}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No user found');
    }

    const { data, error } = await supabase
      .from('maintenance_requests')
      .insert({
        account_id: accountId,
        created_by_user_id: user.id,
        ...request,
      })
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'create maintenance request');
    }

    return data;
  } catch (error) {
    console.error('[Maintenance API] Error creating request:', error);
    throw error;
  }
}

/**
 * Update maintenance request status
 */
export async function updateMaintenanceRequestStatus(requestId: string, status: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const updates: any = { status };

    // Set timestamps based on status
    if (status === 'reviewed') {
      updates.reviewed_at = new Date().toISOString();
    } else if (status === 'in_progress') {
      updates.started_at = new Date().toISOString();
    } else if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    } else if (status === 'closed') {
      updates.closed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('maintenance_requests')
      .update(updates)
      .eq('id', requestId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'update maintenance request');
    }

    return data;
  } catch (error) {
    console.error('[Maintenance API] Error updating request:', error);
    throw error;
  }
}

/**
 * Get HVAC filter subscriptions
 */
export async function getHVACFilterSubscriptions() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('hvac_filter_subscriptions')
      .select(`
        *,
        units (
          id,
          unit_number,
          property_id,
          properties (
            id,
            name
          )
        )
      `)
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('next_delivery_date', { ascending: true });

    if (error) {
      throw handleSupabaseError(error, 'fetch HVAC subscriptions');
    }

    // Group by property
    const groupedByProperty: Record<string, any> = {};

    (data || []).forEach((sub: any) => {
      const propertyName = sub.units?.properties?.name || 'Unknown Property';

      if (!groupedByProperty[propertyName]) {
        groupedByProperty[propertyName] = {
          property: propertyName,
          units: 0,
          nextDelivery: sub.next_delivery_date,
          filters: 0,
          status: 'scheduled',
        };
      }

      groupedByProperty[propertyName].units += 1;
      groupedByProperty[propertyName].filters += 1;

      // Use earliest delivery date
      if (new Date(sub.next_delivery_date) < new Date(groupedByProperty[propertyName].nextDelivery)) {
        groupedByProperty[propertyName].nextDelivery = sub.next_delivery_date;
      }
    });

    return Object.values(groupedByProperty);
  } catch (error) {
    console.error('[Maintenance API] Error fetching HVAC subscriptions:', error);
    return [];
  }
}

/**
 * Get total scheduled filters count
 */
export async function getTotalScheduledFilters() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { count, error } = await supabase
      .from('hvac_filter_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (error) {
      throw handleSupabaseError(error, 'fetch scheduled filters count');
    }

    return count || 0;
  } catch (error) {
    console.error('[Maintenance API] Error fetching filters count:', error);
    return 0;
  }
}
