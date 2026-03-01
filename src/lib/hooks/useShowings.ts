/**
 * React hooks for showings management
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getUpcomingShowings,
  getAvailableProperties,
  getShowingStats,
  createShowing,
  updateShowingStatus,
  type ShowingWithDetails,
  type PaginatedResponse,
} from '../api/showings';

export function useUpcomingShowings() {
  const [data, setData] = useState<ShowingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getUpcomingShowings();
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('[useUpcomingShowings] Error fetching showings:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, total, refetch: fetchData };
}

export function useAvailableProperties() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getAvailableProperties();
      setData(result);
    } catch (err) {
      console.error('[useAvailableProperties] Error fetching properties:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useShowingStats() {
  const [data, setData] = useState<{
    scheduled_today: number;
    total_this_week: number;
    avg_response_time: string;
    conversion_rate: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getShowingStats();
      setData(result);
    } catch (err) {
      console.error('[useShowingStats] Error fetching stats:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useCreateShowing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (showingData: {
    unit_id: string;
    visitor_name: string;
    visitor_email: string;
    visitor_phone?: string;
    showing_date: string;
    showing_type: 'self_guided' | 'agent_assisted' | 'virtual';
    access_code?: string;
    notes?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);
      const result = await createShowing(showingData);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useCreateShowing] Error creating showing:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

export function useUpdateShowingStatus() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateStatus = useCallback(async (showingId: string, status: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await updateShowingStatus(showingId, status);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useUpdateShowingStatus] Error updating status:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateStatus, loading, error };
}
