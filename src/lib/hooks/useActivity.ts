/**
 * React hook for activity events
 */

import { useState, useEffect, useCallback } from 'react';
import { getActivityEvents, type ActivityEventsParams, type ActivityEvent } from '../api/activity';

export function useActivityEvents(params: ActivityEventsParams = {}) {
  const [data, setData] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getActivityEvents(params);
      setData(result.events || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('[useActivityEvents] Error fetching activity events:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [params.eventType, params.entityType, params.userId, params.startDate, params.endDate, params.limit, params.offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, total, refetch: fetchData };
}
