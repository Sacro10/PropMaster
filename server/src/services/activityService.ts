import { supabaseAdmin as supabase } from '../supabase';

function isMissingTable(error: any, tableName?: string) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  if (error.code === '42P01') return true;
  if (!tableName) return message.includes('does not exist');
  return message.includes(`"${tableName}"`) && message.includes('does not exist');
}

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

export interface ActivityFilters {
  eventType?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get activity events for an account with optional filtering
 * All events are scoped to the provided accountId
 */
export async function getActivityEvents(
  accountId: string,
  filters: ActivityFilters = {}
): Promise<{ events: ActivityEvent[]; total: number }> {
  const {
    eventType,
    entityType,
    userId,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = filters;

  // Build the query
  let query = supabase
    .from('activity_events')
    .select('*, user:user_id(email, raw_user_meta_data)', { count: 'exact' })
    .eq('account_id', accountId);

  // Apply filters
  if (eventType) {
    query = query.eq('event_type', eventType);
  }
  if (entityType) {
    query = query.eq('entity_type', entityType);
  }
  if (userId) {
    query = query.eq('user_id', userId);
  }
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  // Order by most recent first
  query = query.order('created_at', { ascending: false });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingTable(error, 'activity_events')) {
      return { events: [], total: 0 };
    }
    throw error;
  }

  // Transform the data to include user information
  const events: ActivityEvent[] =
    data?.map((event: any) => ({
      id: event.id,
      eventType: event.event_type,
      entityType: event.entity_type,
      entityId: event.entity_id,
      summary: event.summary,
      metadata: event.metadata || {},
      userId: event.user_id,
      userEmail: event.user?.email,
      userName: event.user?.raw_user_meta_data?.full_name,
      timestamp: event.created_at,
    })) || [];

  return {
    events,
    total: count || 0,
  };
}

/**
 * Log a new activity event
 */
export async function logActivityEvent(
  accountId: string,
  userId: string | null,
  eventType: string,
  summary: string,
  options?: {
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('activity_events')
    .insert({
      account_id: accountId,
      user_id: userId,
      event_type: eventType,
      entity_type: options?.entityType,
      entity_id: options?.entityId,
      summary,
      metadata: options?.metadata || {},
      ip_address: options?.ipAddress,
      user_agent: options?.userAgent,
    })
    .select('id')
    .single();

  if (error) {
    if (isMissingTable(error, 'activity_events')) {
      return '';
    }
    throw error;
  }

  return data.id;
}

/**
 * Get activity event statistics for an account
 */
export async function getActivityStats(
  accountId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByDay: Array<{ date: string; count: number }>;
}> {
  let query = supabase
    .from('activity_events')
    .select('event_type, created_at')
    .eq('account_id', accountId);

  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error, 'activity_events')) {
      return {
        totalEvents: 0,
        eventsByType: {},
        eventsByDay: [],
      };
    }
    throw error;
  }

  const totalEvents = data?.length || 0;

  // Count events by type
  const eventsByType: Record<string, number> = {};
  const eventsByDay: Map<string, number> = new Map();

  data?.forEach((event) => {
    // Count by type
    eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;

    // Count by day
    const date = event.created_at.split('T')[0];
    eventsByDay.set(date, (eventsByDay.get(date) || 0) + 1);
  });

  // Convert map to array for easier consumption
  const eventsByDayArray = Array.from(eventsByDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalEvents,
    eventsByType,
    eventsByDay: eventsByDayArray,
  };
}
