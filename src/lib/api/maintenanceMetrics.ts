/**
 * Maintenance Metrics API
 * Data access layer for maintenance KPIs and metrics
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError } from './client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface MaintenanceMetrics {
  active_requests: number;
  avg_response_time_hours: number;
  completion_rate: number;
  emergency_support_status: '24/7' | 'Business Hours';
  recent_emergency_count: number;
}

export interface HVACProgramByProperty {
  property_id: string;
  property_name: string;
  unit_count: number;
  next_delivery: string | null;
  total_filters: number;
  status: string;
}

export interface RoutingMetrics {
  assignment_rate: number;
  avg_acceptance_time_hours: number;
  vendor_utilization_rate: number;
}

export interface EmergencySupportConfig {
  isEnabled: boolean;
  notificationPhone: string | null;
  notificationEmail: string | null;
  notificationChannels: string[];
}

/**
 * Get maintenance KPI metrics
 */
export async function getMaintenanceMetrics(): Promise<MaintenanceMetrics> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch metrics in parallel
    const [activeRequestsData, responseTimeData, completionData, accountData, emergencyData] = await Promise.all([
      // Active requests count
      supabase
        .from('maintenance_requests')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .in('status', ['submitted', 'reviewed', 'assigned', 'scheduled', 'in_progress']),

      // Response time calculation
      supabase
        .from('maintenance_requests')
        .select('requested_at, reviewed_at')
        .eq('account_id', accountId)
        .not('reviewed_at', 'is', null),

      // Completion rate
      supabase
        .from('maintenance_requests')
        .select('status', { count: 'exact' })
        .eq('account_id', accountId)
        .in('status', ['completed', 'cancelled', 'closed']),

      // Account plan for emergency support
      supabase
        .from('accounts')
        .select('plan')
        .eq('id', accountId)
        .single(),

      // Recent emergency requests
      supabase
        .from('maintenance_requests')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .eq('priority', 'emergency')
        .gte('requested_at', last24Hours.toISOString()),
    ]);

    // Calculate active requests
    const activeRequests = activeRequestsData.count || 0;

    // Calculate average response time
    let avgResponseTime = 0;
    if (responseTimeData.data && responseTimeData.data.length > 0) {
      const totalHours = responseTimeData.data.reduce((sum, req) => {
        const requested = new Date(req.requested_at).getTime();
        const reviewed = new Date(req.reviewed_at).getTime();
        const hours = (reviewed - requested) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgResponseTime = totalHours / responseTimeData.data.length;
    }

    // Calculate completion rate
    const completedCount = completionData.count || 0;
    const { count: totalCount } = await supabase
      .from('maintenance_requests')
      .select('id', { count: 'exact' })
      .eq('account_id', accountId);

    const completionRate = totalCount && totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    // Emergency support status
    const emergencySupport = accountData.data?.plan === 'premium' ? '24/7' : 'Business Hours';

    // Recent emergency count
    const recentEmergencyCount = emergencyData.count || 0;

    return {
      active_requests: activeRequests,
      avg_response_time_hours: Math.round(avgResponseTime * 10) / 10,
      completion_rate: Math.round(completionRate * 10) / 10,
      emergency_support_status: emergencySupport,
      recent_emergency_count: recentEmergencyCount,
    };
  } catch (error) {
    console.error('[Maintenance Metrics API] Error fetching metrics:', error);
    throw error;
  }
}

/**
 * Get HVAC filter program grouped by property
 */
export async function getHVACProgramByProperty(): Promise<HVACProgramByProperty[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get all subscriptions with their units and properties
    const { data, error } = await supabase
      .from('hvac_filter_subscriptions')
      .select(`
        id,
        unit_id,
        quantity,
        next_delivery_date,
        status,
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
      .eq('status', 'active');

    if (error) {
      throw handleSupabaseError(error, 'fetch HVAC program');
    }

    // Group by property
    const propertyMap = new Map<string, HVACProgramByProperty>();

    (data || []).forEach((sub: any) => {
      const property = sub.units?.properties;
      if (!property) return;

      const propertyId = property.id;
      if (!propertyMap.has(propertyId)) {
        propertyMap.set(propertyId, {
          property_id: propertyId,
          property_name: property.name,
          unit_count: 0,
          next_delivery: null,
          total_filters: 0,
          status: 'scheduled',
        });
      }

      const propertyData = propertyMap.get(propertyId)!;
      propertyData.unit_count += 1;
      propertyData.total_filters += sub.quantity || 1;

      // Set earliest next delivery date
      if (sub.next_delivery_date) {
        if (!propertyData.next_delivery || sub.next_delivery_date < propertyData.next_delivery) {
          propertyData.next_delivery = sub.next_delivery_date;
        }
      }
    });

    return Array.from(propertyMap.values());
  } catch (error) {
    console.error('[Maintenance Metrics API] Error fetching HVAC program:', error);
    return [];
  }
}

/**
 * Get routing metrics for smart assignment
 */
export async function getRoutingMetrics(): Promise<RoutingMetrics> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const [requestsData, assignmentsData] = await Promise.all([
      // Total requests submitted
      supabase
        .from('maintenance_requests')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId),

      // Assignment data
      supabase
        .from('maintenance_assignments')
        .select('status, assigned_at, accepted_at')
        .eq('account_id', accountId),
    ]);

    const totalRequests = requestsData.count || 0;
    const assignments = assignmentsData.data || [];

    // Assignment rate
    const assignmentRate = totalRequests > 0 ? (assignments.length / totalRequests) * 100 : 0;

    // Average acceptance time
    let avgAcceptanceTime = 0;
    const acceptedAssignments = assignments.filter(a => a.accepted_at && a.assigned_at);
    if (acceptedAssignments.length > 0) {
      const totalHours = acceptedAssignments.reduce((sum, a) => {
        const assigned = new Date(a.assigned_at).getTime();
        const accepted = new Date(a.accepted_at!).getTime();
        const hours = (accepted - assigned) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgAcceptanceTime = totalHours / acceptedAssignments.length;
    }

    // Vendor utilization (assignments that were accepted)
    const acceptedCount = assignments.filter(a => a.status === 'accepted' || a.status === 'in_progress' || a.status === 'completed').length;
    const vendorUtilization = assignments.length > 0 ? (acceptedCount / assignments.length) * 100 : 0;

    return {
      assignment_rate: Math.round(assignmentRate * 10) / 10,
      avg_acceptance_time_hours: Math.round(avgAcceptanceTime * 10) / 10,
      vendor_utilization_rate: Math.round(vendorUtilization * 10) / 10,
    };
  } catch (error) {
    console.error('[Maintenance Metrics API] Error fetching routing metrics:', error);
    return {
      assignment_rate: 0,
      avg_acceptance_time_hours: 0,
      vendor_utilization_rate: 0,
    };
  }
}

/**
 * Assign a vendor to a maintenance request
 */
export async function assignMaintenanceRequest(requestId: string, vendorProfileId: string): Promise<void> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Use backend endpoint for assignment logic
    const response = await fetch(`${API_BASE}/api/maintenance/${requestId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vendorProfileId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to assign vendor');
    }
  } catch (error) {
    console.error('[Maintenance Metrics API] Error assigning vendor:', error);
    throw error;
  }
}

/**
 * Get available vendors for a maintenance request
 */
export async function getAvailableVendors(requestId: string): Promise<Array<{
  id: string;
  businessName: string;
  rating: number;
  jobsCompleted: number;
  hourlyRate: number;
}>> {
  try {
    const response = await fetch(`${API_BASE}/api/maintenance/${requestId}/vendors`);

    if (response.ok) {
      const vendors = await response.json();
      if (Array.isArray(vendors) && vendors.length > 0) {
        return vendors;
      }
    }
  } catch (error) {
    console.warn('[Maintenance Metrics API] API vendor fetch failed, falling back to direct query:', error);
  }

  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('vendor_profiles')
      .select('id, business_name, avg_rating, total_jobs_completed, is_active')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (error) {
      throw handleSupabaseError(error, 'fetch available vendors');
    }

    return (data || []).map((vendor: any) => ({
      id: vendor.id,
      businessName: vendor.business_name || 'Vendor',
      rating: vendor.avg_rating ?? 0,
      jobsCompleted: vendor.total_jobs_completed ?? 0,
      hourlyRate: 85,
    }));
  } catch (error) {
    console.error('[Maintenance Metrics API] Error fetching vendors:', error);
    return [];
  }
}

/**
 * Create emergency maintenance request
 */
export async function createEmergencyRequest(data: {
  title: string;
  description: string;
  category: string;
  unitId: string;
  notificationChannels?: string[];
}): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/api/maintenance/emergency`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create emergency request');
    }

    return await response.json();
  } catch (error) {
    console.error('[Maintenance Metrics API] Error creating emergency request:', error);
    throw error;
  }
}

export async function getEmergencySupportConfig(): Promise<EmergencySupportConfig> {
  const response = await fetch(`${API_BASE}/api/maintenance/emergency-config`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch emergency config');
  }

  return await response.json();
}

export async function updateEmergencySupportConfig(data: EmergencySupportConfig): Promise<EmergencySupportConfig> {
  const response = await fetch(`${API_BASE}/api/maintenance/emergency-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update emergency config');
  }

  return await response.json();
}

export async function sendEmergencyTest(data: {
  title?: string;
  description?: string;
  category?: string;
  unitId?: string;
  propertyId?: string;
  notificationChannels?: string[];
}): Promise<{ notifications: Array<{ channel: string; sent: boolean; status?: number; error?: string }> }> {
  const response = await fetch(`${API_BASE}/api/maintenance/emergency-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send emergency test');
  }

  return await response.json();
}

/**
 * Generate HVAC delivery batch
 */
export async function generateHVACBatch(): Promise<any> {
  try {
    const response = await fetch('/api/hvac/batches/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate HVAC batch');
    }

    return await response.json();
  } catch (error) {
    console.error('[Maintenance Metrics API] Error generating HVAC batch:', error);
    throw error;
  }
}

/**
 * Mark HVAC delivery as delivered
 */
export async function markHVACDelivered(deliveryId: string, trackingNumber?: string): Promise<void> {
  try {
    const response = await fetch(`/api/hvac/deliveries/${deliveryId}/delivered`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trackingNumber }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to mark delivery as delivered');
    }
  } catch (error) {
    console.error('[Maintenance Metrics API] Error marking delivery delivered:', error);
    throw error;
  }
}
