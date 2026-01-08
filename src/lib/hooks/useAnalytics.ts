/**
 * React hooks for analytics data
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAnalyticsMetrics,
  getRevenueTrend,
  getOccupancyTrend,
  getPropertyPerformance,
  getExpenseBreakdown,
  exportAnalyticsData,
  type AnalyticsMetrics,
  type RevenueTrendData,
  type OccupancyTrendData,
  type PropertyPerformanceData,
  type ExpenseBreakdownData,
} from '../api/analytics';

export type TimeframeOption = '7d' | '30d' | '90d' | '1y' | 'all';

export function useAnalyticsMetrics(timeframe: TimeframeOption = '30d') {
  const [data, setData] = useState<AnalyticsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getAnalyticsMetrics(timeframe);
      setData(result);
    } catch (err) {
      console.error('[useAnalyticsMetrics] Error fetching metrics:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useRevenueTrend(timeframe: TimeframeOption = '30d') {
  const [data, setData] = useState<RevenueTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getRevenueTrend(timeframe);
      setData(result);
    } catch (err) {
      console.error('[useRevenueTrend] Error fetching revenue trend:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useOccupancyTrend(timeframe: TimeframeOption = '30d') {
  const [data, setData] = useState<OccupancyTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getOccupancyTrend(timeframe);
      setData(result);
    } catch (err) {
      console.error('[useOccupancyTrend] Error fetching occupancy trend:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function usePropertyPerformance(timeframe: TimeframeOption = '30d') {
  const [data, setData] = useState<PropertyPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPropertyPerformance(timeframe);
      setData(result);
    } catch (err) {
      console.error('[usePropertyPerformance] Error fetching property performance:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useExpenseBreakdown(timeframe: TimeframeOption = '30d') {
  const [data, setData] = useState<ExpenseBreakdownData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getExpenseBreakdown(timeframe);
      setData(result);
    } catch (err) {
      console.error('[useExpenseBreakdown] Error fetching expense breakdown:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useExportAnalytics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportData = useCallback(async (format: 'csv' | 'pdf', timeframe: TimeframeOption = '30d') => {
    try {
      setLoading(true);
      setError(null);
      const result = await exportAnalyticsData(format, timeframe);

      // Create download link
      const blob = new Blob([result.data], { type: result.mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true };
    } catch (err) {
      console.error('[useExportAnalytics] Error exporting data:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportData, loading, error };
}
