/**
 * React hook for fetching dashboard data
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDashboardMetrics,
  getRecentActivity,
  getSystemMetrics,
  getUpcomingTasks,
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
 * Hook to fetch all dashboard data
 */
export function useDashboardData(): UseDashboardDataResult {
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

      // Fetch all dashboard data in parallel
      const [metricsData, activityData, systemData, tasksData] = await Promise.all([
        getDashboardMetrics(),
        getRecentActivity(10),
        getSystemMetrics(),
        getUpcomingTasks(),
      ]);

      setMetrics(metricsData);
      setRecentActivity(activityData);
      setSystemMetrics(systemData);
      setUpcomingTasks(tasksData);
    } catch (err) {
      console.error('[useDashboardData] Error fetching dashboard data:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
