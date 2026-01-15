/**
 * Activity API
 * Data access layer for activity events
 */

import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ActivityEvent {
  id: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: Record<string, any>;
  userId: string | null;
  userEmail?: string;
  userName?: string;
  timestamp: string;
}

export interface ActivityEventsResponse {
  events: ActivityEvent[];
  total: number;
}

export interface ActivityEventsParams {
  eventType?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get activity events via backend API
 */
export async function getActivityEvents(params: ActivityEventsParams = {}): Promise<ActivityEventsResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }

  const searchParams = new URLSearchParams();
  if (params.eventType) searchParams.set('eventType', params.eventType);
  if (params.entityType) searchParams.set('entityType', params.entityType);
  if (params.userId) searchParams.set('userId', params.userId);
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

  const url = `${API_BASE}/api/activity${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || 'Failed to fetch activity events');
    }
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to fetch activity events');
  }

  return await response.json();
}
