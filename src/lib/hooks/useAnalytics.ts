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
  getAnalyticsInsights,
  type TimeframeOption as ApiTimeframeOption,
} from '../api/analytics';
import type {
  AnalyticsMetrics,
  RevenueData,
  OccupancyData,
  PropertyPerformance as PropertyPerformanceData,
  ExpenseBreakdown as ExpenseBreakdownData,
  AnalyticsInsight,
} from '../api/types';

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
  const [data, setData] = useState<RevenueData[]>([]);
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
  const [data, setData] = useState<OccupancyData[]>([]);
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

  const exportData = useCallback(async (format: 'csv' | 'json' = 'csv', timeframe: TimeframeOption = '30d') => {
    try {
      setLoading(true);
      setError(null);
      const result = await exportAnalyticsData(format, timeframe);

      if (format === 'csv' && result instanceof Blob) {
        // Create download link for CSV
        const url = window.URL.createObjectURL(result);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_${timeframe}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else if (format === 'json') {
        // For JSON, create downloadable file
        const jsonStr = JSON.stringify(result, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_${timeframe}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }

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

export function useAnalyticsInsights(timeframe: TimeframeOption = '30d') {
  const [data, setData] = useState<AnalyticsInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getAnalyticsInsights(timeframe);
      setData(result);
    } catch (err) {
      console.error('[useAnalyticsInsights] Error fetching insights:', err);
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
