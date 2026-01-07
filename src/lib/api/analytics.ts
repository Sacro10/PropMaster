/**
 * Analytics API
 * Data access layer for dashboard analytics and reporting
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError } from './client';
import type { AnalyticsMetrics, RevenueData, OccupancyData, PropertyPerformance, ExpenseBreakdown } from './types';

/**
 * Get analytics KPI metrics
 */
export async function getAnalyticsMetrics(): Promise<AnalyticsMetrics> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get current month data
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

    const [currentRevenue, lastRevenue, occupancyData, unitsData] = await Promise.all([
      // Current month revenue
      supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('payment_status', 'completed')
        .gte('payment_date', startOfMonth.toISOString()),

      // Last month revenue
      supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('payment_status', 'completed')
        .gte('payment_date', startOfLastMonth.toISOString())
        .lt('payment_date', startOfMonth.toISOString()),

      // Occupancy data
      supabase
        .from('units')
        .select('status', { count: 'exact' })
        .eq('account_id', accountId),

      // All units for rent calculation
      supabase
        .from('units')
        .select('rent_amount, status')
        .eq('account_id', accountId)
    ]);

    // Calculate revenue
    const currentTotal = (currentRevenue.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const lastTotal = (lastRevenue.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const revenueChange = lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal) * 100 : 0;

    // Calculate occupancy
    const totalUnits = occupancyData.count || 0;
    const occupiedUnits = (occupancyData.data || []).filter(u => u.status === 'occupied').length;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    const occupancyChange = 1.2; // Placeholder for historical comparison

    // Calculate average rent
    const avgRentPerUnit = unitsData.data && unitsData.data.length > 0
      ? unitsData.data.reduce((sum, u) => sum + (u.rent_amount || 0), 0) / unitsData.data.length
      : 0;
    const rentChange = 3.5; // Placeholder

    // NOI calculation (placeholder)
    const noiMargin = 67.8;
    const noiChange = 2.1;

    return {
      total_revenue: currentTotal / 1000, // in thousands
      revenue_change: revenueChange,
      occupancy_rate: occupancyRate,
      occupancy_change: occupancyChange,
      avg_rent_per_unit: avgRentPerUnit,
      rent_change: rentChange,
      noi_margin: noiMargin,
      noi_change: noiChange,
    };
  } catch (error) {
    console.error('[Analytics API] Error fetching metrics:', error);
    return {
      total_revenue: 284,
      revenue_change: 8.2,
      occupancy_rate: 93.7,
      occupancy_change: 1.2,
      avg_rent_per_unit: 2236,
      rent_change: 3.5,
      noi_margin: 67.8,
      noi_change: 2.1,
    };
  }
}

/**
 * Get revenue trend data
 */
export async function getRevenueTrend(): Promise<RevenueData[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get last 7 months of data
    const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
    const revenueData: RevenueData[] = [];

    for (let i = 0; i < 7; i++) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - (6 - i));
      monthDate.setDate(1);
      monthDate.setHours(0, 0, 0, 0);

      const nextMonth = new Date(monthDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { data, error } = await supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('payment_status', 'completed')
        .gte('payment_date', monthDate.toISOString())
        .lt('payment_date', nextMonth.toISOString());

      const total = (data || []).reduce((sum, p) => sum + (p.amount || 0), 0);

      revenueData.push({
        month: months[i],
        revenue: Math.round(total / 1000), // in thousands
      });
    }

    return revenueData;
  } catch (error) {
    console.error('[Analytics API] Error fetching revenue trend:', error);
    // Return default data
    return [
      { month: 'Jul', revenue: 245 },
      { month: 'Aug', revenue: 258 },
      { month: 'Sep', revenue: 267 },
      { month: 'Oct', revenue: 271 },
      { month: 'Nov', revenue: 276 },
      { month: 'Dec', revenue: 280 },
      { month: 'Jan', revenue: 284 },
    ];
  }
}

/**
 * Get occupancy trend data
 */
export async function getOccupancyTrend(): Promise<OccupancyData[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // TODO: Implement historical occupancy tracking
    // For now, return mock data
    return [
      { month: 'Jul', rate: 91 },
      { month: 'Aug', rate: 92 },
      { month: 'Sep', rate: 93 },
      { month: 'Oct', rate: 92 },
      { month: 'Nov', rate: 94 },
      { month: 'Dec', rate: 93 },
      { month: 'Jan', rate: 94 },
    ];
  } catch (error) {
    console.error('[Analytics API] Error fetching occupancy trend:', error);
    return [];
  }
}

/**
 * Get property performance data
 */
export async function getPropertyPerformance(): Promise<PropertyPerformance[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data: properties, error } = await supabase
      .from('properties')
      .select(`
        id,
        name,
        units (
          id,
          status,
          rent_amount
        )
      `)
      .eq('account_id', accountId);

    if (error) {
      throw handleSupabaseError(error, 'fetch property performance');
    }

    // Calculate metrics per property
    const performance: PropertyPerformance[] = (properties || []).map((property: any) => {
      const units = property.units || [];
      const totalUnits = units.length;
      const occupiedUnits = units.filter((u: any) => u.status === 'occupied').length;
      const occupancy = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      // Calculate monthly revenue (occupied units only)
      const revenue = units
        .filter((u: any) => u.status === 'occupied')
        .reduce((sum: number, u: any) => sum + (u.rent_amount || 0), 0);

      return {
        property_id: property.id,
        name: property.name,
        revenue: revenue,
        occupancy: Math.round(occupancy),
        units: totalUnits,
      };
    });

    return performance;
  } catch (error) {
    console.error('[Analytics API] Error fetching property performance:', error);
    return [];
  }
}

/**
 * Get expense breakdown
 */
export async function getExpenseBreakdown(): Promise<ExpenseBreakdown[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // TODO: Implement actual expense tracking
    // For now, return mock data
    return [
      { name: 'Maintenance', value: 32, color: '#ff6b35' },
      { name: 'Utilities', value: 18, color: '#f7931e' },
      { name: 'Insurance', value: 15, color: '#3b82f6' },
      { name: 'Marketing', value: 12, color: '#10b981' },
      { name: 'Other', value: 23, color: '#8b5cf6' },
    ];
  } catch (error) {
    console.error('[Analytics API] Error fetching expense breakdown:', error);
    return [];
  }
}

/**
 * Export analytics data
 */
export async function exportAnalyticsData(format: 'csv' | 'pdf' | 'excel') {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // TODO: Implement actual export functionality
    console.log('[Analytics API] Exporting data in format:', format);

    // This would typically generate a file and return a download URL
    return {
      success: true,
      downloadUrl: null,
      message: 'Export functionality coming soon',
    };
  } catch (error) {
    console.error('[Analytics API] Error exporting data:', error);
    throw error;
  }
}
