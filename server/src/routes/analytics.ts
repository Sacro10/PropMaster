import express, { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimiters } from '../middleware/rateLimiter';
import { cache } from '../utils/cache';
import { AiDisabledError, generateText, getAiStatus } from '../services/aiClient';

// Extend Request interface to include user property
interface AnalyticsRequest extends AuthRequest {}

const router = express.Router();

// Apply rate limiting to all analytics routes
router.use(rateLimiters.analytics);
router.use(authenticate);

interface TimeframeQuery {
  range: '7d' | '7m' | '30d' | '90d' | '1y' | 'all';
}

interface MetricQuery extends TimeframeQuery {
  metric: 'revenue' | 'occupancy';
}

/**
 * Convert timeframe to date range
 */
function getDateRange(timeframe: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (timeframe) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '7m':
      start.setMonth(start.getMonth() - 6);
      start.setDate(1);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(2000, 0, 1); // Very early date
      break;
    default:
      start.setDate(start.getDate() - 30); // Default to 30 days
  }

  return { start, end };
}

/**
 * Get account ID from authenticated user
 */
async function getUserAccountId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error('Account not found');
  }

  return data.account_id;
}

const paymentStatusValues = ['paid', 'completed'];
const dateOnlyFields = new Set(['payment_date', 'expense_date', 'due_date']);

function getDateFilterValue(dateField: string, date: Date) {
  return dateOnlyFields.has(dateField) || dateField.endsWith('_date')
    ? date.toISOString().split('T')[0]
    : date.toISOString();
}

function isMissingFieldError(error: any, field: string) {
  const message = String(error?.message || '');
  return message.includes(`column "${field}"`) || message.includes('does not exist');
}

async function fetchPaymentsInRange({
  accountId,
  start,
  end,
  select,
  statusValues = paymentStatusValues,
  dateFields = ['payment_date', 'paid_at', 'created_at'],
}: {
  accountId: string;
  start: Date;
  end: Date;
  select: string;
  statusValues?: string[];
  dateFields?: string[];
}) {
  let lastError: any = null;

  for (const dateField of dateFields) {
    const { data, error } = await supabase
      .from('payments')
      .select(select)
      .eq('account_id', accountId)
      .in('status', statusValues)
      .gte(dateField, getDateFilterValue(dateField, start))
      .lte(dateField, getDateFilterValue(dateField, end));

    if (!error) {
      return { data: data || [], dateField };
    }

    lastError = error;
    if (isMissingFieldError(error, dateField)) {
      continue;
    }

    return { data: [], dateField: null, error };
  }

  return { data: [], dateField: null, error: lastError };
}

async function fetchMaintenanceCostsInRange({
  accountId,
  start,
  end,
  dateFields = ['completed_at', 'updated_at', 'created_at'],
}: {
  accountId: string;
  start: Date;
  end: Date;
  dateFields?: string[];
}) {
  let lastError: any = null;

  for (const dateField of dateFields) {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .select('category, actual_cost, estimated_cost')
      .eq('account_id', accountId)
      .or('actual_cost.not.is.null,estimated_cost.not.is.null')
      .gte(dateField, getDateFilterValue(dateField, start))
      .lte(dateField, getDateFilterValue(dateField, end));

    if (!error) {
      return { data: data || [], dateField };
    }

    lastError = error;
    if (isMissingFieldError(error, dateField)) {
      continue;
    }

    return { data: [], dateField: null, error };
  }

  return { data: [], dateField: null, error: lastError };
}

async function fetchExpensesInRange({
  accountId,
  start,
  end,
  dateFields = ['expense_date', 'created_at'],
}: {
  accountId: string;
  start: Date;
  end: Date;
  dateFields?: string[];
}) {
  let lastError: any = null;

  for (const dateField of dateFields) {
    const { data, error } = await supabase
      .from('expenses')
      .select('amount, expense_categories(name)')
      .eq('account_id', accountId)
      .gte(dateField, getDateFilterValue(dateField, start))
      .lte(dateField, getDateFilterValue(dateField, end));

    if (!error) {
      return { data: data || [], dateField };
    }

    lastError = error;
    if (isMissingFieldError(error, dateField)) {
      continue;
    }

    return { data: [], dateField: null, error };
  }

  return { data: [], dateField: null, error: lastError };
}

async function fetchOccupiedUnitCount(accountId: string, date: Date) {
  const dateIso = date.toISOString();
  const { data, error } = await supabase
    .from('leases')
    .select('unit_id')
    .eq('account_id', accountId)
    .lte('lease_start', dateIso)
    .or(`lease_end.is.null,lease_end.gte.${dateIso}`);

  if (error) {
    throw error;
  }

  const uniqueUnitIds = new Set((data || []).map((lease: any) => lease.unit_id));
  return uniqueUnitIds.size;
}

function buildMonthlyRevenueSeries(payments: any[], dateField: string, start: Date, end: Date) {
  const totals = new Map<string, number>();

  payments.forEach((payment) => {
    const rawDate = payment?.[dateField];
    if (!rawDate) {
      return;
    }
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const key = monthStart.toISOString().split('T')[0];
    totals.set(key, (totals.get(key) || 0) + Number(payment.amount || 0));
  });

  const series = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endMonth) {
    const key = current.toISOString().split('T')[0];
    series.push({
      month: key,
      value: Number((totals.get(key) || 0).toFixed(2)),
      label: current.toLocaleDateString('en-US', { month: 'short' }),
    });
    current.setMonth(current.getMonth() + 1);
  }

  return series;
}

async function buildSummaryMetrics(accountId: string, range: TimeframeQuery['range']) {
  const { start, end } = getDateRange(range);

  // Calculate comparison period (same length as current period)
  const periodLength = end.getTime() - start.getTime();
  const comparisonEnd = new Date(start);
  const comparisonStart = new Date(start.getTime() - periodLength);

  const [
    currentPayments,
    comparisonPayments,
    unitsData,
    activeLeases,
    currentOccupiedUnits,
    comparisonOccupiedUnits,
    currentExpenses,
  ] = await Promise.all([
    fetchPaymentsInRange({
      accountId,
      start,
      end,
      select: 'amount',
    }),
    fetchPaymentsInRange({
      accountId,
      start: comparisonStart,
      end: comparisonEnd,
      select: 'amount',
    }),
    supabase
      .from('units')
      .select('status')
      .eq('account_id', accountId),
    supabase
      .from('leases')
      .select('rent')
      .eq('account_id', accountId)
      .eq('status', 'active'),
    fetchOccupiedUnitCount(accountId, end),
    fetchOccupiedUnitCount(accountId, comparisonEnd),
    fetchMaintenanceCostsInRange({
      accountId,
      start,
      end,
    }),
  ]);

  if (currentPayments.error || comparisonPayments.error || unitsData.error || activeLeases.error || currentExpenses.error) {
    throw new Error('Failed to fetch analytics data');
  }

  // Calculate metrics
  const currentRevenue =
    currentPayments.data?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
  const comparisonRevenue =
    comparisonPayments.data?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
  const revenueChange =
    comparisonRevenue > 0 ? ((currentRevenue - comparisonRevenue) / comparisonRevenue) * 100 : 0;

  const totalUnits = unitsData.data?.length || 0;
  const occupancyRate = totalUnits > 0 ? (currentOccupiedUnits / totalUnits) * 100 : 0;
  const comparisonOccupancyRate = totalUnits > 0 ? (comparisonOccupiedUnits / totalUnits) * 100 : 0;
  const occupancyChange = occupancyRate - comparisonOccupancyRate;

  const avgRent =
    activeLeases.data?.length > 0
      ? activeLeases.data.reduce((sum: number, l: any) => sum + Number(l.rent), 0) /
        activeLeases.data.length
      : 0;

  const currentExpenseTotal =
    currentExpenses.data?.reduce((sum: number, e: any) => {
      const value = e.actual_cost ?? e.estimated_cost ?? 0;
      return sum + Number(value);
    }, 0) || 0;
  const noiMargin = currentRevenue > 0 ? ((currentRevenue - currentExpenseTotal) / currentRevenue) * 100 : 0;

  return {
    summary: {
      totalRevenue: {
        value: currentRevenue,
        change: revenueChange,
        trend: revenueChange >= 0 ? 'up' : 'down',
      },
      occupancyRate: {
        value: occupancyRate,
        change: occupancyChange,
        trend: occupancyChange >= 0.5 ? 'up' : occupancyChange <= -0.5 ? 'down' : 'neutral',
      },
      avgRentPerUnit: {
        value: avgRent,
        change: 0,
        trend: 'neutral',
      },
      noiMargin: {
        value: noiMargin,
        change: 0,
        trend: noiMargin >= 20 ? 'up' : noiMargin >= 10 ? 'neutral' : 'down',
      },
    },
    context: {
      timeframe: range,
      currentRevenue,
      comparisonRevenue,
      occupancyRate,
      avgRent,
      noiMargin,
      currentExpenseTotal,
    },
  };
}

/**
 * GET /api/analytics/summary
 * Returns KPI summary metrics for the given timeframe
 */
router.get('/summary', async (req: AnalyticsRequest, res: Response) => {
  try {
    const { range = '30d' } = req.query as Partial<TimeframeQuery>;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check cache first
    const cacheKey = cache.generateAnalyticsKey(userId, 'summary', { range });
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const accountId = await getUserAccountId(userId);
    const { summary } = await buildSummaryMetrics(accountId, range);
    const result = summary;

    // Cache the result for 3 minutes
    cache.set(cacheKey, result, 3 * 60 * 1000);
    
    res.json(result);

  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

/**
 * GET /api/analytics/insights
 * Returns AI-generated insights for the given timeframe
 */
router.get('/insights', async (req: AnalyticsRequest, res: Response) => {
  try {
    const { range = '30d' } = req.query as Partial<TimeframeQuery>;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const accountId = await getUserAccountId(userId);
    const { summary, context } = await buildSummaryMetrics(accountId, range);
    const aiStatus = getAiStatus();

    try {
      const insight = await generateText(
        'Write 2-3 sentences of concise analytics insights for a property manager. Focus on revenue, occupancy, and NOI trends. Avoid numbers if the change is neutral.',
        { summary, context }
      );

      res.json({ summary: insight, provider: aiStatus.provider });
    } catch (error) {
      if (!(error instanceof AiDisabledError)) {
        console.warn('[Analytics] AI insights failed:', error);
      }
      res.json({ summary: '', provider: aiStatus.provider });
    }
  } catch (error) {
    console.error('Analytics insights error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics insights' });
  }
});

/**
 * GET /api/analytics/timeseries
 * Returns time series data for revenue or occupancy metrics
 */
router.get('/timeseries', async (req: AnalyticsRequest, res: Response) => {
  try {
    const { metric, range = '30d' } = req.query as Partial<MetricQuery>;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!metric || !['revenue', 'occupancy'].includes(metric)) {
      return res.status(400).json({ error: 'Valid metric parameter required (revenue|occupancy)' });
    }

    const accountId = await getUserAccountId(userId);
    const { start, end } = getDateRange(range);

    if (metric === 'revenue') {
      // Get revenue data grouped by month
      const { data, error } = await supabase
        .rpc('get_monthly_revenue', {
          account_uuid: accountId,
          start_date: start.toISOString(),
          end_date: end.toISOString()
        });

      if (!error && data && data.length > 0) {
        const timeSeriesData = data.map((item: any) => ({
          month: item.month,
          value: Number(item.revenue),
          label: new Date(item.month).toLocaleDateString('en-US', { month: 'short' })
        }));

        return res.json(timeSeriesData);
      }

      if (error) {
        console.warn('Analytics timeseries RPC missing or failed, falling back to raw payments:', error);
      }

      const paymentsResult = await fetchPaymentsInRange({
        accountId,
        start,
        end,
        select: 'amount, payment_date, paid_at, created_at',
      });

      if (paymentsResult.error) {
        throw paymentsResult.error;
      }

      const dateField = paymentsResult.dateField || 'created_at';
      const timeSeriesData = buildMonthlyRevenueSeries(paymentsResult.data, dateField, start, end);

      return res.json(timeSeriesData);

    } else if (metric === 'occupancy') {
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id')
        .eq('account_id', accountId);

      if (unitsError) {
        throw unitsError;
      }

      const totalUnits = units?.length || 0;
      const { data: leases, error: leasesError } = await supabase
        .from('leases')
        .select('unit_id, lease_start, lease_end')
        .eq('account_id', accountId)
        .lte('lease_start', end.toISOString())
        .gte('lease_end', start.toISOString());

      if (leasesError) {
        throw leasesError;
      }

      const months = [];
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      while (current <= endMonth) {
        const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);

        const occupiedUnitIds = new Set(
          (leases || [])
            .filter((lease: any) => {
              const leaseStart = new Date(lease.lease_start);
              const leaseEnd = new Date(lease.lease_end);
              return leaseStart <= monthEnd && leaseEnd >= monthStart;
            })
            .map((lease: any) => lease.unit_id)
        );

        const rate = totalUnits > 0 ? (occupiedUnitIds.size / totalUnits) * 100 : 0;

        months.push({
          month: monthStart.toISOString(),
          value: Number(rate.toFixed(1)),
          label: monthStart.toLocaleDateString('en-US', { month: 'short' })
        });
        current.setMonth(current.getMonth() + 1);
      }

      res.json(months);
    }

  } catch (error) {
    console.error('Analytics timeseries error:', error);
    res.status(500).json({ error: 'Failed to fetch timeseries data' });
  }
});

/**
 * GET /api/analytics/properties
 * Returns property performance metrics for the given timeframe
 */
router.get('/properties', async (req: AnalyticsRequest, res: Response) => {
  try {
    const { range = '30d' } = req.query as Partial<TimeframeQuery>;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const accountId = await getUserAccountId(userId);
    const { start, end } = getDateRange(range);

    const { data: properties, error: propertiesError } = await supabase
      .from('properties')
      .select('id, name, total_units')
      .eq('account_id', accountId);

    if (propertiesError) {
      throw propertiesError;
    }

    if (!properties || properties.length === 0) {
      return res.json([]);
    }

    const propertyIds = properties.map((p) => p.id);
    const { data: units } = await supabase
      .from('units')
      .select('property_id, status')
      .eq('account_id', accountId)
      .in('property_id', propertyIds);

    const unitStats = (units || []).reduce((acc: Record<string, { total: number; occupied: number }>, unit: any) => {
      const current = acc[unit.property_id] || { total: 0, occupied: 0 };
      current.total += 1;
      if (unit.status === 'occupied') {
        current.occupied += 1;
      }
      acc[unit.property_id] = current;
      return acc;
    }, {});

    const paymentsResult = await fetchPaymentsInRange({
      accountId,
      start,
      end,
      select: 'amount, unit_id, units!inner(property_id)',
    });

    if (paymentsResult.error) {
      throw paymentsResult.error;
    }

    const payments = paymentsResult.data;

    const revenueByProperty = (payments || []).reduce((acc: Record<string, number>, payment: any) => {
      const propertyId = payment.units?.property_id;
      if (!propertyId) {
        return acc;
      }
      acc[propertyId] = (acc[propertyId] || 0) + Number(payment.amount || 0);
      return acc;
    }, {});

    const result = properties.map((property) => {
      const unitsStat = unitStats[property.id] || { total: 0, occupied: 0 };
      const totalUnits = Number(property.total_units ?? unitsStat.total ?? 0);
      const occupiedUnits = Number(unitsStat.occupied ?? 0);
      const occupancy = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      return {
        property_id: property.id,
        name: property.name,
        revenue: revenueByProperty[property.id] || 0,
        occupancy,
        units: totalUnits,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Analytics properties error:', error);
    res.status(500).json({ error: 'Failed to fetch property performance' });
  }
});

/**
 * GET /api/analytics/expenses/breakdown
 * Returns expense breakdown by category for the given timeframe
 */
router.get('/expenses/breakdown', async (req: AnalyticsRequest, res: Response) => {
  try {
    const { range = '30d' } = req.query as Partial<TimeframeQuery>;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const accountId = await getUserAccountId(userId);
    const { start, end } = getDateRange(range);

    let categoryTotals: Record<string, number> = {};

    const expenseResult = await fetchExpensesInRange({ accountId, start, end });
    if (!expenseResult.error && expenseResult.data.length > 0) {
      categoryTotals = expenseResult.data.reduce((acc: Record<string, number>, item: any) => {
        const category = item.expense_categories?.name || 'Other';
        acc[category] = (acc[category] || 0) + Number(item.amount || 0);
        return acc;
      }, {});
    } else {
      if (expenseResult.error) {
        const message = String(expenseResult.error.message || '');
        if (!message.includes('does not exist')) {
          throw expenseResult.error;
        }
      }

      const maintenanceResult = await fetchMaintenanceCostsInRange({ accountId, start, end });

      if (maintenanceResult.error) {
        throw maintenanceResult.error;
      }

      categoryTotals = maintenanceResult.data.reduce((acc: Record<string, number>, item: any) => {
        const category = item.category || 'Other';
        const value = item.actual_cost ?? item.estimated_cost ?? 0;
        acc[category] = (acc[category] || 0) + Number(value);
        return acc;
      }, {});
    }

    // Format for donut chart
    const expenseBreakdown = Object.entries(categoryTotals).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Number(value),
      percentage: 0 // Will be calculated on frontend
    }));

    // Calculate percentages
    const total = expenseBreakdown.reduce((sum, item) => sum + item.value, 0);
    expenseBreakdown.forEach(item => {
      item.percentage = total > 0 ? (item.value / total) * 100 : 0;
    });

    res.json(expenseBreakdown);

  } catch (error) {
    console.error('Analytics expenses breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch expense breakdown' });
  }
});

/**
 * GET /api/analytics/export
 * Exports analytics data as CSV for the given timeframe
 */
router.get('/export', async (req: AnalyticsRequest, res: Response) => {
  try {
    const { range = '30d', format = 'csv' } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const accountId = await getUserAccountId(userId);
    const { start, end } = getDateRange(range as string);

    // Fetch comprehensive data for export
    const [payments, maintenance, units, leases] = await Promise.all([
      supabase
        .from('payments')
        .select('*')
        .eq('account_id', accountId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString()),

      supabase
        .from('maintenance_requests')
        .select('*')
        .eq('account_id', accountId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString()),

      supabase
        .from('units')
        .select('*')
        .eq('account_id', accountId),

      supabase
        .from('leases')
        .select('*')
        .eq('account_id', accountId)
    ]);

    if (format === 'csv') {
      // Generate CSV content
      let csvContent = 'Type,Date,Amount,Category,Description\n';
      
      // Add payment data
      payments.data?.forEach((payment: any) => {
        csvContent += `Payment,${payment.created_at},${payment.amount},${payment.payment_type},"${payment.notes || ''}"}\n`;
      });

      // Add maintenance data
      maintenance.data?.forEach((request: any) => {
        csvContent += `Maintenance,${request.created_at},${request.actual_cost || 0},${request.category},"${request.title}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics_${range}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);

    } else {
      // Return JSON for other formats
      res.json({
        timeframe: range,
        exported_at: new Date().toISOString(),
        data: {
          payments: payments.data,
          maintenance: maintenance.data,
          units: units.data,
          leases: leases.data
        }
      });
    }

  } catch (error) {
    console.error('Analytics export error:', error);
    res.status(500).json({ error: 'Failed to export analytics data' });
  }
});

export default router;
