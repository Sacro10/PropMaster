/**
 * Showings API
 * Data access layer for property showings
 */

import { supabase } from '../supabaseClient';
import {
  fetchJsonWithRetry,
  getAccessToken,
  getCurrentAccountId,
  handleSupabaseError,
  getPaginationRange,
  calculatePaginationMeta,
  type PaginationParams,
} from './client';
import type { ShowingWithDetails, PaginatedResponse } from './types';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Get upcoming showings
 */
export async function getUpcomingShowings(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('No active session');

    const url = `${API_BASE}/api/showings?status=scheduled,confirmed&limit=50`;
    const response = await fetchJsonWithRetry<{ showings?: any[]; total?: number }>(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }, {
      cacheKey: `${url}|${accessToken}`,
      cacheTtlMs: 10000,
      retries: 1,
    });

    if (!response.ok) {
      // Check if response is HTML (error page) instead of JSON
      if (response.contentType && response.contentType.includes('text/html')) {
        throw new Error('Showings API unavailable');
      }
      throw new Error(`Failed to fetch showings: ${response.statusText}`);
    }

    const result = response.data || {};
    
    // Transform to expected format
    const showings: ShowingWithDetails[] = (result.showings || []).map((showing: any) => ({
      id: showing.id,
      showing_date: showing.showingDate || showing.scheduledDate,
      showing_type: showing.showingType || 'agent_assisted',
      visitor_name: showing.visitorName || showing.prospectName,
      visitor_email: showing.visitorEmail || showing.prospectEmail,
      visitor_phone: showing.visitorPhone || showing.prospectPhone,
      status: showing.status,
      access_code: showing.accessCode,
      access_code_expires_at: showing.accessCodeExpiresAt,
      reminder_sent_at: showing.reminderSentAt,
      notes: showing.notes,
      unit: showing.unit,
      property: showing.property,
    }));

    return {
      data: showings,
      total: result.total || showings.length,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    };
  } catch (error) {
    console.error('[Showings API] Error fetching showings:', error);
    throw error;
  }
}

/**
 * Get available properties for showings
 */
export async function getAvailableProperties() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('No active session');

    const url = `${API_BASE}/api/showings/available-units`;
    const response = await fetchJsonWithRetry<any[]>(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }, {
      cacheKey: `${url}|${accessToken}`,
      cacheTtlMs: 10000,
      retries: 1,
    });

    if (!response.ok) {
      if (response.contentType && response.contentType.includes('text/html')) {
        console.error('[Showings API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error(`Failed to fetch available units: ${response.statusText}`);
    }

    const units = response.data || [];

    // Transform to match expected format
    return units.map((unit: any) => ({
      id: unit.id,
      name: `${unit.property.name} #${unit.unit_number}`,
      rent: `$${unit.rent_amount}/mo`,
      beds: unit.bedrooms,
      baths: unit.bathrooms,
      sqft: unit.sqft || 'N/A',
      available: unit.available_date || 'Now',
      views: 0, // Mock for now
      scheduled: 0, // Mock for now
    }));
  } catch (error) {
    console.error('[Showings API] Error fetching available properties:', error);
    return [];
  }
}

/**
 * Get showing statistics
 */
export async function getShowingStats() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const url = `${API_BASE}/api/showings/stats`;
    const response = await fetchJsonWithRetry<{
      scheduled_today: number;
      total_this_week: number;
      avg_response_time: string;
      conversion_rate: string;
    }>(url, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    }, {
      cacheKey: `${url}|${session.access_token}`,
      cacheTtlMs: 15000,
      retries: 1,
    });

    if (!response.ok) {
      if (response.contentType && response.contentType.includes('text/html')) {
        console.error('[Showings API] Received HTML instead of JSON - API may not be running');
        return {
          scheduled_today: 0,
          total_this_week: 0,
          avg_response_time: '0.0',
          conversion_rate: '0',
        };
      }
      throw new Error(`Failed to fetch showing stats: ${response.statusText}`);
    }

    return response.data || {
      scheduled_today: 0,
      total_this_week: 0,
      avg_response_time: '0.0',
      conversion_rate: '0',
    };
  } catch (error) {
    console.error('[Showings API] Error fetching stats:', error);
    return {
      scheduled_today: 0,
      total_this_week: 0,
      avg_response_time: '0.0',
      conversion_rate: '0',
    };
  }
}

/**
 * Create a new showing
 */
export async function createShowing(data: {
  unit_id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  showing_date: string;
  showing_type: 'self_guided' | 'agent_assisted' | 'virtual';
  access_code?: string;
  notes?: string;
}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/showings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        unitId: data.unit_id,
        showingDate: new Date(data.showing_date).toISOString(),
        showingType: data.showing_type,
        visitorName: data.visitor_name,
        visitorEmail: data.visitor_email,
        visitorPhone: data.visitor_phone,
        accessCode: data.access_code?.trim() || undefined,
        notes: data.notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create showing');
    }

    return await response.json();
  } catch (error) {
    console.error('[Showings API] Error creating showing:', error);
    throw error;
  }
}

/**
 * Update showing status
 */
export async function updateShowingStatus(showingId: string, status: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/showings/${showingId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update showing status');
    }

    return await response.json();
  } catch (error) {
    console.error('[Showings API] Error updating showing:', error);
    throw error;
  }
}

/**
 * Send showing reminder
 */
export async function sendShowingReminder(showingId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/showings/${showingId}/send-reminder`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      const err = new Error(error.error || 'Failed to send reminder') as Error & { code?: string };
      err.code = error.code;
      throw err;
    }

    return await response.json();
  } catch (error) {
    console.error('[Showings API] Error sending reminder:', error);
    throw error;
  }
}

/**
 * Mark reminder as sent (client-composed email)
 */
export async function markShowingReminderSent(showingId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/showings/${showingId}/reminder-sent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to mark reminder as sent');
    }

    return await response.json();
  } catch (error) {
    console.error('[Showings API] Error marking reminder sent:', error);
    throw error;
  }
}

/**
 * Delete a showing
 */
export async function deleteShowing(showingId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/showings/${showingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Showings API unavailable');
      }
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to delete showing');
    }
  } catch (error) {
    console.error('[Showings API] Error deleting showing:', error);
    throw error;
  }
}

/**
 * Regenerate access code
 */
export async function regenerateAccessCode(showingId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/showings/${showingId}/regenerate-code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to regenerate access code');
    }

    return await response.json();
  } catch (error) {
    console.error('[Showings API] Error regenerating access code:', error);
    throw error;
  }
}
