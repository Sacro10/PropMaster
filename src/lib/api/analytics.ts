/**
 * Analytics API
 * Data access layer for dashboard analytics and reporting
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId } from './client';
import type {
  AnalyticsMetrics,
  RevenueData,
  OccupancyData,
  PropertyPerformance,
  ExpenseBreakdown,
  AnalyticsInsight,
} from './types';

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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Analytics API] Received HTML instead of JSON - API may not be running');
        return {
          total_revenue: 0,
          revenue_change: 0,
          occupancy_rate: 0,
          occupancy_change: 0,
          avg_rent_per_unit: 0,
          rent_change: 0,
          noi_margin: 0,
          noi_change: 0,
        };
      }
      throw new Error('Failed to fetch analytics metrics');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch analytics metrics:', error);
    return {
      total_revenue: 0,
      revenue_change: 0,
      occupancy_rate: 0,
      occupancy_change: 0,
      avg_rent_per_unit: 0,
      rent_change: 0,
      noi_margin: 0,
      noi_change: 0,
    };
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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Analytics API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error('Failed to fetch revenue trend');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch revenue trend:', error);
    return [];
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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Analytics API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error('Failed to fetch occupancy trend');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch occupancy trend:', error);
    return [];
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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Analytics API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error('Failed to fetch property performance');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch property performance:', error);
    return [];
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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Analytics API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error('Failed to fetch expense breakdown');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch expense breakdown:', error);
    return [];
  }
}

/**
 * Get AI-generated analytics insights
 */
export async function getAnalyticsInsights(timeframe: TimeframeOption = '30d'): Promise<AnalyticsInsight> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_BASE}/api/analytics/insights?range=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch analytics insights');
    }

    return await response.json();
  } catch (error) {
    console.error('[Analytics API] Failed to fetch analytics insights:', error);
    return { summary: '', provider: null };
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
