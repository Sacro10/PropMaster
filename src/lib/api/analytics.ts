/**
 * Analytics API
 * Data access layer for dashboard analytics and reporting
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId } from './client';
import type { AnalyticsMetrics, RevenueData, OccupancyData, PropertyPerformance, ExpenseBreakdown } from './types';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type TimeframeOption = '7d' | '30d' | '90d' | '1y' | 'all';

/**
 * Get analytics KPI metrics
 */
export async function getAnalyticsMetrics(timeframe: TimeframeOption = '30d'): Promise<AnalyticsMetrics> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/summary?range=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch analytics metrics');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch analytics metrics:', error);
    throw new Error('Failed to fetch analytics metrics');
  }
}

/**
 * Get revenue trend data
 */
export async function getRevenueTrend(timeframe: TimeframeOption = '30d'): Promise<RevenueData[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/timeseries?metric=revenue&range=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch revenue trend');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch revenue trend:', error);
    throw new Error('Failed to fetch revenue trend');
  }
}

/**
 * Get occupancy trend data
 */
export async function getOccupancyTrend(timeframe: TimeframeOption = '30d'): Promise<OccupancyData[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/timeseries?metric=occupancy&range=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch occupancy trend');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch occupancy trend:', error);
    throw new Error('Failed to fetch occupancy trend');
  }
}

/**
 * Get property performance data
 */
export async function getPropertyPerformance(timeframe: TimeframeOption = '30d'): Promise<PropertyPerformance[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/properties?range=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch property performance');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch property performance:', error);
    throw new Error('Failed to fetch property performance');
  }
}

/**
 * Get expense breakdown data
 */
export async function getExpenseBreakdown(timeframe: TimeframeOption = '30d'): Promise<ExpenseBreakdown[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/expenses/breakdown?range=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch expense breakdown');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch expense breakdown:', error);
    throw new Error('Failed to fetch expense breakdown');
  }
}

/**
 * Export analytics data
 */
export async function exportAnalyticsData(format: 'csv' | 'json' = 'csv', timeframe: TimeframeOption = '30d'): Promise<Blob | object> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/export?range=${timeframe}&format=${format}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to export data');
    }

    if (format === 'csv') {
      return await response.blob();
    } else {
      return await response.json();
    }
  } catch (error) {
    console.error('[Analytics API] Failed to export data:', error);
    throw new Error('Failed to export analytics data');
  }
}
