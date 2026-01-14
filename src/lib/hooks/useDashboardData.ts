/**
 * React hook for fetching dashboard data
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDashboardMetrics,
  getDashboardSummary,
  type DashboardMetrics,
  type RecentActivity,
  type SystemMetrics,
  type UpcomingTask,
} from '../api/dashboard';

export interface UseDashboardDataResult {
  metrics: DashboardMetrics | null;
  recentActivity: RecentActivity[];
  systemMetrics: SystemMetrics | null;
  upcomingTasks: UpcomingTask[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all dashboard data with auto-refresh
 * @param autoRefreshInterval - Optional interval in milliseconds for auto-refresh (default: 60000ms = 1 minute)
 */
export function useDashboardData(autoRefreshInterval: number = 60000): UseDashboardDataResult {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch metrics + summary once to avoid duplicate summary API calls
      const [metricsData, summary] = await Promise.all([
        getDashboardMetrics(),
        getDashboardSummary(),
      ]);

      setMetrics(metricsData);
      setRecentActivity(summary.recentActivity);
      setSystemMetrics({
        support_status: summary.systemStatus.supportAvailable ? '24/7' : 'Business Hours',
        avg_lease_time_days: summary.systemStatus.avgLeaseTime,
        eviction_rate: summary.systemStatus.evictionRate,
        occupancy_trend: summary.systemStatus.occupancyTrend,
      });
      setUpcomingTasks(summary.upcomingTasks);
    } catch (err) {
      console.error('[useDashboardData] Error fetching dashboard data:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      const intervalId = setInterval(() => {
        fetchData();
      }, autoRefreshInterval);

      return () => clearInterval(intervalId);
    }
  }, [autoRefreshInterval, fetchData]);

  return {
    metrics,
    recentActivity,
    systemMetrics,
    upcomingTasks,
    loading,
    error,
    refetch: fetchData,
  };
}
