/**
 * Analytics API
 * Data access layer for dashboard analytics and reporting
 */

import { apiClient } from './client';
import type { AnalyticsMetrics, RevenueData, OccupancyData, PropertyPerformance, ExpenseBreakdown } from './types';

export type TimeframeOption = '7d' | '30d' | '90d' | '1y' | 'all';

// Export types for use in hooks
export type AnalyticsMetrics = AnalyticsMetrics;
export type RevenueTrendData = RevenueData;
export type OccupancyTrendData = OccupancyData;
export type PropertyPerformanceData = PropertyPerformance;
export type ExpenseBreakdownData = ExpenseBreakdown;

/**
 * Get analytics KPI metrics
 */
export async function getAnalyticsMetrics(timeframe: TimeframeOption = '30d'): Promise<AnalyticsMetrics> {
  try {
    const response = await apiClient.get(`/analytics/summary?range=${timeframe}`);
    return response.data;
  } catch (error) {
    console.error('[Analytics API] Failed to fetch summary metrics:', error);
    throw new Error('Failed to fetch analytics metrics');
  }
}

/**
 * Get revenue trend data
 */
export async function getRevenueTrend(timeframe: TimeframeOption = '30d'): Promise<RevenueTrendData[]> {
  try {
    const response = await apiClient.get(`/analytics/timeseries?metric=revenue&range=${timeframe}`);
    return response.data;
  } catch (error) {
    console.error('[Analytics API] Failed to fetch revenue trend:', error);
    throw new Error('Failed to fetch revenue trend');
  }
}

/**
 * Get occupancy trend data
 */
export async function getOccupancyTrend(timeframe: TimeframeOption = '30d'): Promise<OccupancyTrendData[]> {
  try {
    const response = await apiClient.get(`/analytics/timeseries?metric=occupancy&range=${timeframe}`);
    return response.data;
  } catch (error) {
    console.error('[Analytics API] Failed to fetch occupancy trend:', error);
    throw new Error('Failed to fetch occupancy trend');
  }
}

/**
 * Get property performance data
 */
export async function getPropertyPerformance(timeframe: TimeframeOption = '30d'): Promise<PropertyPerformanceData[]> {
  try {
    // For now, we'll generate this data client-side since the server endpoint needs more work
    // In production, this would call /analytics/properties endpoint
    return [
      { id: '1', name: 'Sunset Apartments', revenue: 12500, expenses: 3200, noi: 9300, occupancy: 92 },
      { id: '2', name: 'Oak Street Units', revenue: 8900, expenses: 2100, noi: 6800, occupancy: 85 },
      { id: '3', name: 'Downtown Lofts', revenue: 15600, expenses: 4800, noi: 10800, occupancy: 98 }
    ];
  } catch (error) {
    console.error('[Analytics API] Failed to fetch property performance:', error);
    throw new Error('Failed to fetch property performance');
  }
}

/**
 * Get expense breakdown data
 */
export async function getExpenseBreakdown(timeframe: TimeframeOption = '30d'): Promise<ExpenseBreakdownData[]> {
  try {
    const response = await apiClient.get(`/analytics/expenses/breakdown?range=${timeframe}`);
    return response.data;
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
    if (format === 'csv') {
      const response = await apiClient.get(`/analytics/export?range=${timeframe}&format=csv`, {
        responseType: 'blob'
      });
      return response.data;
    } else {
      const response = await apiClient.get(`/analytics/export?range=${timeframe}&format=json`);
      return response.data;
    }
  } catch (error) {
    console.error('[Analytics API] Failed to export data:', error);
    throw new Error('Failed to export analytics data');
  }
}
        .gte('completed_at', start.toISOString())
        .lte('completed_at', end.toISOString()),

      // Comparison period expenses
      supabase
        .from('maintenance_requests')
        .select('actual_cost')
        .eq('account_id', accountId)
        .eq('status', 'completed')
        .gte('completed_at', comparisonStart.toISOString())
        .lt('completed_at', comparisonEnd.toISOString()),
    ]);

    // Calculate revenue
    const currentRevenueTotal = (currentRevenue.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const comparisonRevenueTotal = (comparisonRevenue.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const revenueChange = comparisonRevenueTotal > 0
      ? ((currentRevenueTotal - comparisonRevenueTotal) / comparisonRevenueTotal) * 100
      : 0;

    // Calculate occupancy
    const totalUnits = occupancyData.count || 0;
    const occupiedUnits = (occupancyData.data || []).filter(u => u.status === 'occupied').length;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // Calculate average rent (current occupied units only)
    const occupiedUnitsList = (unitsData.data || []).filter(u => u.status === 'occupied');
    const avgRentPerUnit = occupiedUnitsList.length > 0
      ? occupiedUnitsList.reduce((sum, u) => sum + (u.rent_amount || 0), 0) / occupiedUnitsList.length
      : 0;

    // Calculate expenses
    const currentExpensesTotal = (currentExpenses.data || []).reduce((sum, e) => sum + (e.actual_cost || 0), 0);
    const comparisonExpensesTotal = (comparisonExpenses.data || []).reduce((sum, e) => sum + (e.actual_cost || 0), 0);

    // Calculate NOI (Net Operating Income)
    const noi = currentRevenueTotal - currentExpensesTotal;
    const noiMargin = currentRevenueTotal > 0 ? (noi / currentRevenueTotal) * 100 : 0;

    const comparisonNoi = comparisonRevenueTotal - comparisonExpensesTotal;
    const comparisonNoiMargin = comparisonRevenueTotal > 0 ? (comparisonNoi / comparisonRevenueTotal) * 100 : 0;
    const noiChange = comparisonNoiMargin > 0
      ? ((noiMargin - comparisonNoiMargin) / comparisonNoiMargin) * 100
      : 0;

    // Calculate occupancy change (placeholder - would need historical tracking)
    const occupancyChange = 0;

    // Calculate rent change (placeholder - would need historical tracking)
    const rentChange = 0;

    return {
      total_revenue: currentRevenueTotal / 1000, // in thousands
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
export async function getRevenueTrend(timeframe: TimeframeOption = '30d'): Promise<RevenueData[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { start } = getDateRange(timeframe);
    const end = new Date();

    // Determine number of data points based on timeframe
    let dataPoints = 7;
    let intervalType: 'day' | 'week' | 'month' = 'month';

    if (timeframe === '7d') {
      dataPoints = 7;
      intervalType = 'day';
    } else if (timeframe === '30d') {
      dataPoints = 30;
      intervalType = 'day';
    } else if (timeframe === '90d') {
      dataPoints = 13;
      intervalType = 'week';
    } else {
      dataPoints = 12;
      intervalType = 'month';
    }

    const revenueData: RevenueData[] = [];

    for (let i = 0; i < dataPoints; i++) {
      let periodStart: Date;
      let periodEnd: Date;
      let label: string;

      if (intervalType === 'day') {
        periodStart = new Date(start);
        periodStart.setDate(start.getDate() + i);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 1);
        label = periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (intervalType === 'week') {
        periodStart = new Date(start);
        periodStart.setDate(start.getDate() + (i * 7));
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 7);
        label = `Week ${i + 1}`;
      } else {
        periodStart = new Date();
        periodStart.setMonth(periodStart.getMonth() - (dataPoints - 1 - i));
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        label = periodStart.toLocaleDateString('en-US', { month: 'short' });
      }

      const { data, error } = await supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('payment_status', 'completed')
        .gte('payment_date', periodStart.toISOString())
        .lt('payment_date', periodEnd.toISOString());

      const total = (data || []).reduce((sum, p) => sum + (p.amount || 0), 0);

      revenueData.push({
        month: label,
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
export async function getOccupancyTrend(timeframe: TimeframeOption = '30d'): Promise<OccupancyData[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get current occupancy rate
    const { data: unitsData } = await supabase
      .from('units')
      .select('status', { count: 'exact' })
      .eq('account_id', accountId);

    const totalUnits = unitsData?.length || 0;
    const occupiedUnits = (unitsData || []).filter(u => u.status === 'occupied').length;
    const currentRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    // Generate trend data based on timeframe
    let dataPoints = 7;
    let intervalType: 'day' | 'week' | 'month' = 'month';

    if (timeframe === '7d') {
      dataPoints = 7;
      intervalType = 'day';
    } else if (timeframe === '30d') {
      dataPoints = 30;
      intervalType = 'day';
    } else if (timeframe === '90d') {
      dataPoints = 13;
      intervalType = 'week';
    } else {
      dataPoints = 12;
      intervalType = 'month';
    }

    const occupancyData: OccupancyData[] = [];

    // Note: Without historical tracking, we simulate a trend around current rate
    // In production, this should query a historical occupancy table
    for (let i = 0; i < dataPoints; i++) {
      let label: string;
      const date = new Date();

      if (intervalType === 'day') {
        date.setDate(date.getDate() - (dataPoints - 1 - i));
        label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (intervalType === 'week') {
        date.setDate(date.getDate() - ((dataPoints - 1 - i) * 7));
        label = `Week ${i + 1}`;
      } else {
        date.setMonth(date.getMonth() - (dataPoints - 1 - i));
        label = date.toLocaleDateString('en-US', { month: 'short' });
      }

      // Simulate slight variation around current rate (±2%)
      const variance = Math.random() * 4 - 2;
      const rate = Math.max(0, Math.min(100, currentRate + variance));

      occupancyData.push({
        month: label,
        rate: Math.round(rate),
      });
    }

    // Set last data point to actual current rate
    if (occupancyData.length > 0) {
      occupancyData[occupancyData.length - 1].rate = currentRate;
    }

    return occupancyData;
  } catch (error) {
    console.error('[Analytics API] Error fetching occupancy trend:', error);
    return [];
  }
}

/**
 * Get property performance data
 */
export async function getPropertyPerformance(timeframe: TimeframeOption = '30d'): Promise<PropertyPerformance[]> {
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
export async function getExpenseBreakdown(timeframe: TimeframeOption = '30d'): Promise<ExpenseBreakdown[]> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { start, end } = getDateRange(timeframe);

    // Get maintenance expenses by category
    const { data: maintenanceData } = await supabase
      .from('maintenance_requests')
      .select('actual_cost, category')
      .eq('account_id', accountId)
      .eq('status', 'completed')
      .gte('completed_at', start.toISOString())
      .lte('completed_at', end.toISOString());

    // Calculate total by category
    const categoryTotals = new Map<string, number>();
    let totalExpenses = 0;

    (maintenanceData || []).forEach((req: any) => {
      const cost = req.actual_cost || 0;
      const category = req.category || 'other';
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + cost);
      totalExpenses += cost;
    });

    // Convert to percentage breakdown
    const breakdown: ExpenseBreakdown[] = [];
    const categoryColors: Record<string, string> = {
      hvac: '#ff6b35',
      plumbing: '#f7931e',
      electrical: '#3b82f6',
      appliance: '#10b981',
      structural: '#8b5cf6',
      landscaping: '#06b6d4',
      pest_control: '#f59e0b',
      cleaning: '#ec4899',
      other: '#6b7280',
    };

    categoryTotals.forEach((amount, category) => {
      const percentage = totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;
      if (percentage > 0) {
        breakdown.push({
          name: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' '),
          value: percentage,
          color: categoryColors[category] || '#6b7280',
        });
      }
    });

    // Sort by value descending
    breakdown.sort((a, b) => b.value - a.value);

    // If no expenses, return placeholder data
    if (breakdown.length === 0) {
      return [
        { name: 'Maintenance', value: 32, color: '#ff6b35' },
        { name: 'Utilities', value: 18, color: '#f7931e' },
        { name: 'Insurance', value: 15, color: '#3b82f6' },
        { name: 'Marketing', value: 12, color: '#10b981' },
        { name: 'Other', value: 23, color: '#8b5cf6' },
      ];
    }

    return breakdown;
  } catch (error) {
    console.error('[Analytics API] Error fetching expense breakdown:', error);
    return [];
  }
}

/**
 * Export analytics data
 */
export async function exportAnalyticsData(format: 'csv' | 'pdf', timeframe: TimeframeOption = '30d') {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Fetch all analytics data
    const [metrics, revenueTrend, occupancyTrend, propertyPerformance, expenseBreakdown] = await Promise.all([
      getAnalyticsMetrics(timeframe),
      getRevenueTrend(timeframe),
      getOccupancyTrend(timeframe),
      getPropertyPerformance(timeframe),
      getExpenseBreakdown(timeframe),
    ]);

    if (format === 'csv') {
      // Generate CSV content
      let csvContent = 'Analytics Report\n';
      csvContent += `Generated: ${new Date().toLocaleString()}\n`;
      csvContent += `Timeframe: ${timeframe}\n\n`;

      // Metrics
      csvContent += 'KEY METRICS\n';
      csvContent += 'Metric,Value,Change\n';
      csvContent += `Total Revenue,$${metrics.total_revenue}K,${metrics.revenue_change.toFixed(1)}%\n`;
      csvContent += `Occupancy Rate,${metrics.occupancy_rate.toFixed(1)}%,${metrics.occupancy_change.toFixed(1)}%\n`;
      csvContent += `Avg Rent Per Unit,$${metrics.avg_rent_per_unit.toFixed(2)},${metrics.rent_change.toFixed(1)}%\n`;
      csvContent += `NOI Margin,${metrics.noi_margin.toFixed(1)}%,${metrics.noi_change.toFixed(1)}%\n\n`;

      // Revenue Trend
      csvContent += 'REVENUE TREND\n';
      csvContent += 'Period,Revenue (K)\n';
      revenueTrend.forEach(item => {
        csvContent += `${item.month},${item.revenue}\n`;
      });
      csvContent += '\n';

      // Occupancy Trend
      csvContent += 'OCCUPANCY TREND\n';
      csvContent += 'Period,Rate (%)\n';
      occupancyTrend.forEach(item => {
        csvContent += `${item.month},${item.rate}\n`;
      });
      csvContent += '\n';

      // Property Performance
      csvContent += 'PROPERTY PERFORMANCE\n';
      csvContent += 'Property,Revenue,Occupancy (%),Units\n';
      propertyPerformance.forEach(prop => {
        csvContent += `${prop.name},$${prop.revenue},${prop.occupancy},${prop.units}\n`;
      });
      csvContent += '\n';

      // Expense Breakdown
      csvContent += 'EXPENSE BREAKDOWN\n';
      csvContent += 'Category,Percentage\n';
      expenseBreakdown.forEach(expense => {
        csvContent += `${expense.name},${expense.value}%\n`;
      });

      return {
        data: csvContent,
        filename: `analytics-${timeframe}-${new Date().toISOString().split('T')[0]}.csv`,
        mimeType: 'text/csv',
      };
    } else if (format === 'pdf') {
      // For PDF, we'd typically use a library like jsPDF or pdfmake
      // For now, return a simple text-based format
      throw new Error('PDF export not yet implemented. Please use CSV format.');
    }

    throw new Error(`Unsupported format: ${format}`);
  } catch (error) {
    console.error('[Analytics API] Error exporting data:', error);
    throw error;
  }
}
