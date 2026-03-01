import express, { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimiters } from '../middleware/rateLimiter';
import { requirePlanAccess, requireFeatureAccess } from '../middleware/planAccess';
import { cache } from '../utils/cache';
import { stripe } from '../stripe';
import { AiDisabledError, generateText, getAiStatus } from '../services/aiClient';

// Extend Request interface to include user property
interface AnalyticsRequest extends AuthRequest {}

const router = express.Router();

router.use(authenticate);
// Apply rate limiting to all analytics routes after auth for per-account keys
router.use(rateLimiters.analytics);
router.use(requirePlanAccess('pro'));

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
    .select('account_id, joined_at, created_at, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    throw new Error('Account not found');
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    throw new Error('Account not found');
  }

  const sorted = [...rows].sort((a: any, b: any) => {
    const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
    const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return sorted[0].account_id;
}

async function resolveAnalyticsAccountId(req: AnalyticsRequest): Promise<string> {
  if (req.user?.accountId) {
    return req.user.accountId;
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Authentication required');
  }

  return getUserAccountId(userId);
}

const paymentStatusValues = ['paid', 'completed'];
const dateOnlyFields = new Set(['payment_date', 'expense_date', 'due_date']);

function getDateFilterValue(dateField: string, date: Date) {
  return dateOnlyFields.has(dateField) || dateField.endsWith('_date')
    ? date.toISOString().split('T')[0]
    : date.toISOString();
}

function isMissingFieldError(error: any, field: string) {
  const message = String(error?.message || '').toLowerCase();
  const fieldLower = field.toLowerCase();

  if (
    message.includes(`column "${fieldLower}"`) ||
    message.includes(`column '${fieldLower}'`) ||
    message.includes(`'${fieldLower}' column`) ||
    message.includes(`"${fieldLower}" column`) ||
    message.includes(`.${fieldLower}`) ||
    message.includes('does not exist')
  ) {
    return true;
  }

  const code = String(error?.code || '');
  return code === '42703' || code === 'PGRST204';
}

function addColumnToSelect(select: string, column: string) {
  if (select.includes('*')) {
    return select;
  }

  const selectedColumns = select
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const alreadySelected = selectedColumns.some((value) => value === column || value.startsWith(`${column}:`));
  if (alreadySelected) {
    return select;
  }

  return `${select}, ${column}`;
}

async function fetchPaymentsInRange({
  accountId,
  start,
  end,
  select,
  statusValues = paymentStatusValues,
  statusFields = ['status', 'payment_status'],
  dateFields = ['payment_date', 'paid_at', 'due_date', 'created_at'],
  selectDateField = false,
}: {
  accountId: string;
  start: Date;
  end: Date;
  select: string;
  statusValues?: string[];
  statusFields?: string[];
  dateFields?: string[];
  selectDateField?: boolean;
}) {
  let lastError: any = null;

  for (const statusField of [...statusFields, null]) {
    let shouldTryNextStatusField = false;

    for (const dateField of dateFields) {
      const querySelect = selectDateField ? addColumnToSelect(select, dateField) : select;

      let query = supabase
        .from('payments')
        .select(querySelect)
        .eq('account_id', accountId)
        .gte(dateField, getDateFilterValue(dateField, start))
        .lte(dateField, getDateFilterValue(dateField, end));

      if (statusField) {
        query = query.in(statusField, statusValues);
      }

      const { data, error } = await query;

      if (!error) {
        return { data: data || [], dateField };
      }

      lastError = error;
      if (isMissingFieldError(error, dateField)) {
        continue;
      }

      if (statusField && isMissingFieldError(error, statusField)) {
        shouldTryNextStatusField = true;
        break;
      }

      return { data: [], dateField: null, error };
    }

    if (!shouldTryNextStatusField) {
      break;
    }
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

async function reconcileStripeProcessingPayments(accountId: string): Promise<number> {
  try {
    const { data: pendingPayments, error: pendingError } = await supabase
      .from('payments')
      .select('id, created_at, amount, tenant_user_id')
      .eq('account_id', accountId)
      .eq('payment_method', 'stripe')
      .eq('status', 'processing')
      .order('created_at', { ascending: false })
      .limit(75);

    if (pendingError) {
      console.warn('[Analytics] Failed to load pending Stripe payments:', pendingError);
      return 0;
    }

    const pendingRows = Array.isArray(pendingPayments) ? pendingPayments : [];
    if (pendingRows.length === 0) {
      return 0;
    }

    const pendingIds = new Set(pendingRows.map((row: any) => row.id).filter(Boolean));
    const earliestCreatedAt = pendingRows[pendingRows.length - 1]?.created_at
      ? new Date(pendingRows[pendingRows.length - 1].created_at).getTime()
      : Date.now();
    const createdGte = Math.max(0, Math.floor((earliestCreatedAt - (24 * 60 * 60 * 1000)) / 1000));

    const resolveFallbackPendingPaymentId = ({
      tenantUserId,
      amountCents,
      eventCreatedSeconds,
    }: {
      tenantUserId?: string | null;
      amountCents?: number | null;
      eventCreatedSeconds?: number | null;
    }): string | null => {
      if (!tenantUserId || !Number.isFinite(amountCents || NaN) || !Number.isFinite(eventCreatedSeconds || NaN)) {
        return null;
      }

      const eventMs = Number(eventCreatedSeconds) * 1000;
      const maxWindowMs = 6 * 60 * 60 * 1000; // 6 hours
      let bestMatchId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const row of pendingRows as any[]) {
        if (!row?.id || matchedByPaymentId.has(row.id)) continue;
        if (row.tenant_user_id !== tenantUserId) continue;

        const rowAmountCents = Math.round(Number(row.amount || 0) * 100);
        if (rowAmountCents !== Math.round(Number(amountCents))) continue;

        const rowCreatedMs = new Date(row.created_at || 0).getTime();
        if (!Number.isFinite(rowCreatedMs)) continue;

        const distance = Math.abs(rowCreatedMs - eventMs);
        if (distance > maxWindowMs) continue;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatchId = row.id;
        }
      }

      return bestMatchId;
    };

    const matchedByPaymentId = new Map<string, {
      paidAt: string;
      transactionId?: string | null;
      paymentIntentId?: string | null;
      chargeId?: string | null;
    }>();

    const registerMatch = (paymentId: string, payload: {
      paidAt: string;
      transactionId?: string | null;
      paymentIntentId?: string | null;
      chargeId?: string | null;
    }) => {
      if (!pendingIds.has(paymentId)) {
        return;
      }

      const existing = matchedByPaymentId.get(paymentId);
      if (!existing) {
        matchedByPaymentId.set(paymentId, payload);
        return;
      }

      const existingTs = new Date(existing.paidAt).getTime();
      const nextTs = new Date(payload.paidAt).getTime();
      if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs > existingTs)) {
        matchedByPaymentId.set(paymentId, {
          ...existing,
          ...payload,
        });
      }
    };

    const collectEvents = async (eventType: string) => {
      let hasMore = true;
      let startingAfter: string | undefined;
      let pages = 0;

      while (hasMore && pages < 10) {
        const events = await stripe.events.list({
          type: eventType,
          limit: 100,
          created: { gte: createdGte },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const evt of events.data) {
          if (evt.type === 'checkout.session.completed') {
            const session = evt.data.object as any;
            if (session?.mode !== 'payment' && session?.metadata?.payment_type !== 'rent') {
              continue;
            }
            if (session?.payment_status !== 'paid') {
              continue;
            }

            const metadataAccountId = session?.metadata?.account_id;
            const metadataPaymentId = session?.metadata?.payment_id;
            const metadataTenantId = session?.metadata?.tenant_user_id || null;
            if (metadataAccountId && metadataAccountId !== accountId) {
              continue;
            }

            const paymentIntentId =
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id || null;

            const paymentId =
              (metadataPaymentId && pendingIds.has(metadataPaymentId) ? metadataPaymentId : null) ||
              resolveFallbackPendingPaymentId({
                tenantUserId: metadataTenantId,
                amountCents:
                  typeof session.amount_total === 'number' ? session.amount_total : null,
                eventCreatedSeconds: evt.created || null,
              });

            if (!paymentId) {
              continue;
            }

            registerMatch(paymentId, {
              paidAt: new Date((evt.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
              transactionId: session.id || null,
              paymentIntentId,
            });
          }

          if (evt.type === 'payment_intent.succeeded') {
            const paymentIntent = evt.data.object as any;
            const paymentId = paymentIntent?.metadata?.payment_id;
            const metadataAccountId = paymentIntent?.metadata?.account_id;
            if (!paymentId || (metadataAccountId && metadataAccountId !== accountId)) {
              continue;
            }

            const chargeId =
              typeof paymentIntent.latest_charge === 'string'
                ? paymentIntent.latest_charge
                : paymentIntent.latest_charge?.id || null;

            registerMatch(paymentId, {
              paidAt: new Date((evt.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
              paymentIntentId: paymentIntent.id || null,
              chargeId,
            });
          }
        }

        hasMore = events.has_more;
        startingAfter = events.data[events.data.length - 1]?.id;
        pages += 1;
      }
    };

    await collectEvents('checkout.session.completed');
    await collectEvents('payment_intent.succeeded');

    let updatedCount = 0;
    for (const pending of pendingRows) {
      const matched = matchedByPaymentId.get(pending.id);
      if (!matched) {
        continue;
      }

      const updatePayload: Record<string, any> = {
        status: 'paid',
        paid_at: matched.paidAt,
        payment_method: 'stripe',
        updated_at: new Date().toISOString(),
      };

      if (matched.transactionId) updatePayload.transaction_id = matched.transactionId;
      if (matched.paymentIntentId) updatePayload.stripe_payment_intent_id = matched.paymentIntentId;
      if (matched.chargeId) updatePayload.stripe_charge_id = matched.chargeId;

      const { error: updateError } = await supabase
        .from('payments')
        .update(updatePayload)
        .eq('account_id', accountId)
        .eq('id', pending.id)
        .eq('status', 'processing');

      if (updateError) {
        console.warn('[Analytics] Failed to reconcile Stripe payment row:', {
          paymentId: pending.id,
          error: updateError,
        });
        continue;
      }

      updatedCount += 1;
    }

    if (updatedCount > 0) {
      console.log(`[Analytics] Reconciled ${updatedCount} Stripe payment(s) for account ${accountId}`);
      cache.clear();
    }

    return updatedCount;
  } catch (error) {
    console.warn('[Analytics] Stripe reconciliation skipped:', error);
    return 0;
  }
}

async function fetchOccupiedUnitCount(accountId: string, date: Date) {
  const dateValue = date.toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('leases')
    .select('unit_id')
    .eq('account_id', accountId)
    .lte('lease_start', dateValue)
    .or(`lease_end.is.null,lease_end.gte.${dateValue}`);

  if (error) {
    throw error;
  }

  const uniqueUnitIds = new Set((data || []).map((lease: any) => lease.unit_id));
  if (uniqueUnitIds.size > 0) {
    return uniqueUnitIds.size;
  }

  // Fallback: if no active leases are found, use unit status.
  // Some accounts currently manage occupancy directly on units.status.
  // Make this date-aware so historical occupancy does not appear flat across all months.
  const cutoffMs = date.getTime();
  const { data: units, error: unitsError } = await supabase
    .from('units')
    .select('status, updated_at')
    .eq('account_id', accountId);

  if (unitsError) {
    throw unitsError;
  }

  return (units || []).filter((unit: any) => {
    if (unit.status !== 'occupied') {
      return false;
    }
    const updatedAtMs = unit.updated_at ? new Date(unit.updated_at).getTime() : Number.NaN;
    if (!Number.isFinite(updatedAtMs)) {
      return true;
    }
    return updatedAtMs <= cutoffMs;
  }).length;
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
    currentOccupiedUnits,
    comparisonOccupiedUnits,
    currentExpenses,
    leaseStartData,
    renewalData,
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
      .select('status, rent_amount')
      .eq('account_id', accountId),
    fetchOccupiedUnitCount(accountId, end),
    fetchOccupiedUnitCount(accountId, comparisonEnd),
    fetchMaintenanceCostsInRange({
      accountId,
      start,
      end,
    }),
    supabase
      .from('leases')
      .select('created_at, lease_start')
      .eq('account_id', accountId)
      .gte('lease_start', start.toISOString().split('T')[0])
      .lte('lease_start', end.toISOString().split('T')[0]),
    supabase
      .from('leases')
      .select('renewal_status')
      .eq('account_id', accountId)
      .gte('lease_end', start.toISOString().split('T')[0])
      .lte('lease_end', end.toISOString().split('T')[0]),
  ]);

  if (
    currentPayments.error ||
    comparisonPayments.error ||
    unitsData.error ||
    currentExpenses.error ||
    leaseStartData.error ||
    renewalData.error
  ) {
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

  const totalUnitRent =
    unitsData.data?.reduce((sum: number, unit: any) => sum + Number(unit.rent_amount ?? 0), 0) || 0;
  const avgRent = totalUnits > 0 ? totalUnitRent / totalUnits : 0;

  const currentExpenseTotal =
    currentExpenses.data?.reduce((sum: number, e: any) => {
      const value = e.actual_cost ?? e.estimated_cost ?? 0;
      return sum + Number(value);
    }, 0) || 0;
  const noiMargin = currentRevenue > 0 ? ((currentRevenue - currentExpenseTotal) / currentRevenue) * 100 : 0;

  const leaseStarts = leaseStartData.data || [];
  const daysToLeaseValues = leaseStarts
    .map((lease: any) => {
      const createdAt = lease.created_at ? new Date(lease.created_at) : null;
      const leaseStart = lease.lease_start ? new Date(lease.lease_start) : null;
      if (!createdAt || !leaseStart || Number.isNaN(createdAt.getTime()) || Number.isNaN(leaseStart.getTime())) {
        return null;
      }
      const diffDays = (leaseStart.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, diffDays);
    })
    .filter((value: number | null): value is number => value !== null);
  const daysToLease =
    daysToLeaseValues.length > 0
      ? Number((daysToLeaseValues.reduce((sum, value) => sum + value, 0) / daysToLeaseValues.length).toFixed(1))
      : 0;

  const renewalRows = (renewalData.data || []).filter((row: any) => row.renewal_status);
  const renewalTotal = renewalRows.length;
  const renewalAccepted = renewalRows.filter((row: any) => row.renewal_status === 'accepted').length;
  const renewalRate = renewalTotal > 0 ? Number(((renewalAccepted / renewalTotal) * 100).toFixed(1)) : 0;

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
      daysToLease: {
        value: daysToLease,
        change: 0,
        trend: 'neutral',
      },
      renewalRate: {
        value: renewalRate,
        change: 0,
        trend: renewalRate >= 70 ? 'up' : renewalRate >= 50 ? 'neutral' : 'down',
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
      daysToLease,
      renewalRate,
    },
  };
}

function buildFallbackInsight(context: {
  timeframe: string;
  currentRevenue: number;
  comparisonRevenue: number;
  occupancyRate: number;
  noiMargin: number;
  daysToLease: number;
  renewalRate: number;
}): string {
  const revenueTrend =
    context.currentRevenue > context.comparisonRevenue
      ? 'Revenue is trending up versus the previous period.'
      : context.currentRevenue < context.comparisonRevenue
        ? 'Revenue is softer than the previous period.'
        : 'Revenue is stable versus the previous period.';

  const occupancyLine =
    context.occupancyRate >= 95
      ? 'Occupancy is very strong, so prioritize renewal execution and rent optimization.'
      : context.occupancyRate >= 90
        ? 'Occupancy is healthy, with room to improve renewal consistency.'
        : 'Occupancy is below target, so focus on lead volume and faster turn times.';

  const operatingLine =
    context.noiMargin >= 30
      ? 'NOI margin is strong; protect it by controlling maintenance spend.'
      : context.noiMargin >= 15
        ? 'NOI margin is moderate and can improve with tighter expense controls.'
        : 'NOI margin is under pressure and needs expense and vacancy intervention.';

  const leasingLine =
    context.daysToLease > 0
      ? `Average days to lease is ${context.daysToLease.toFixed(1)}, and renewal rate is ${context.renewalRate.toFixed(1)}%.`
      : `Renewal rate is ${context.renewalRate.toFixed(1)}%; continue monitoring cycle-time data for new leases.`;

  return `${revenueTrend} ${occupancyLine} ${operatingLine} ${leasingLine}`;
}

function describeAiFailure(error: unknown): string {
  if (error instanceof AiDisabledError) {
    if (error.missingEnvVars?.length) {
      return `AI disabled. Missing: ${error.missingEnvVars.join(', ')}`;
    }
    return 'AI disabled.';
  }

  if (error instanceof Error) {
    return error.message
      .replace(/sk-[A-Za-z0-9-_]+/g, '[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [redacted]');
  }

  return 'AI request failed.';
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

    const accountId = await resolveAnalyticsAccountId(req);
    const reconciled = await reconcileStripeProcessingPayments(accountId);

    // Check cache first
    const cacheKey = cache.generateAnalyticsKey(userId, 'summary', { range, accountId });
    const cachedData = reconciled === 0 ? cache.get(cacheKey) : null;
    if (cachedData && reconciled === 0) {
      return res.json(cachedData);
    }

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

    const accountId = await resolveAnalyticsAccountId(req);
    const { summary, context } = await buildSummaryMetrics(accountId, range);
    const aiStatus = getAiStatus();
    const fallbackInsight = buildFallbackInsight(context);

    try {
      const insight = await generateText(
        'Write 2-3 sentences of concise analytics insights for a property manager. Focus on revenue, occupancy, and NOI trends. Avoid numbers if the change is neutral.',
        { summary, context }
      );

      res.json({
        summary: insight || fallbackInsight,
        provider: aiStatus.provider || (insight ? 'openai' : 'template'),
        error: null,
        source: insight ? 'ai' : 'template',
        enabled: aiStatus.enabled,
      });
    } catch (error) {
      const failure = describeAiFailure(error);
      if (!(error instanceof AiDisabledError)) {
        console.warn('[Analytics] AI insights failed:', failure);
      }
      res.json({
        summary: fallbackInsight,
        provider: aiStatus.provider || 'template',
        error: failure,
        source: 'template',
        enabled: aiStatus.enabled,
      });
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

    const accountId = await resolveAnalyticsAccountId(req);
    await reconcileStripeProcessingPayments(accountId);
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
        // Normalize RPC output into a continuous monthly series so zero-revenue
        // months still appear on the chart.
        const normalizedPayments = (data || []).map((item: any) => ({
          amount: Number(item.revenue || 0),
          paid_at: item.month,
        }));
        const timeSeriesData = buildMonthlyRevenueSeries(
          normalizedPayments,
          'paid_at',
          start,
          end
        );

        return res.json(timeSeriesData);
      }

      if (error) {
        console.warn('Analytics timeseries RPC missing or failed, falling back to raw payments:', error);
      }

      const paymentsResult = await fetchPaymentsInRange({
        accountId,
        start,
        end,
        select: 'amount',
        selectDateField: true,
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
      const rangeStartDate = start.toISOString().split('T')[0];
      const rangeEndDate = end.toISOString().split('T')[0];
      const { data: leases, error: leasesError } = await supabase
        .from('leases')
        .select('unit_id, lease_start, lease_end')
        .eq('account_id', accountId)
        .lte('lease_start', rangeEndDate)
        .or(`lease_end.is.null,lease_end.gte.${rangeStartDate}`);

      if (leasesError) {
        throw leasesError;
      }

      const months = [];
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      // Fallback: if no lease timeline is available, use current unit status
      // and derive a date-aware approximation using units.updated_at.
      if (!leases || leases.length === 0) {
        const { data: unitStatuses, error: unitStatusesError } = await supabase
          .from('units')
          .select('status, updated_at')
          .eq('account_id', accountId);

        if (unitStatusesError) {
          throw unitStatusesError;
        }

        while (current <= endMonth) {
          const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
          const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
          const cutoffMs = monthEnd.getTime();
          const occupiedCount = (unitStatuses || []).filter((unit: any) => {
            if (unit.status !== 'occupied') {
              return false;
            }
            const updatedAtMs = unit.updated_at ? new Date(unit.updated_at).getTime() : Number.NaN;
            if (!Number.isFinite(updatedAtMs)) {
              return true;
            }
            return updatedAtMs <= cutoffMs;
          }).length;
          const fallbackRate = totalUnits > 0 ? (occupiedCount / totalUnits) * 100 : 0;

          months.push({
            month: monthStart.toISOString(),
            value: Number(fallbackRate.toFixed(1)),
            label: monthStart.toLocaleDateString('en-US', { month: 'short' })
          });
          current.setMonth(current.getMonth() + 1);
        }

        return res.json(months);
      }

      while (current <= endMonth) {
        const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);

        const occupiedUnitIds = new Set(
          (leases || [])
            .filter((lease: any) => {
              const leaseStart = new Date(lease.lease_start);
              const leaseEnd = lease.lease_end ? new Date(lease.lease_end) : new Date('9999-12-31T23:59:59.999Z');
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

    const accountId = await resolveAnalyticsAccountId(req);
    await reconcileStripeProcessingPayments(accountId);
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

    const accountId = await resolveAnalyticsAccountId(req);
    await reconcileStripeProcessingPayments(accountId);
    const { start, end } = getDateRange(range);

    const maintenanceResult = await fetchMaintenanceCostsInRange({ accountId, start, end });
    if (maintenanceResult.error) {
      throw maintenanceResult.error;
    }

    let categoryTotals: Record<string, number> = maintenanceResult.data.reduce(
      (acc: Record<string, number>, item: any) => {
        const category = item.category || 'Other';
        const value = item.actual_cost ?? item.estimated_cost ?? 0;
        acc[category] = (acc[category] || 0) + Number(value);
        return acc;
      },
      {},
    );

    // Include rent collected from payment activity as requested.
    const rentPaymentsResult = await fetchPaymentsInRange({
      accountId,
      start,
      end,
      select: '*',
    });

    if (rentPaymentsResult.error) {
      throw rentPaymentsResult.error;
    }

    const rentCollected = (rentPaymentsResult.data || []).reduce((sum: number, payment: any) => {
      const paymentType = String(payment.payment_type || payment.type || '').toLowerCase();
      const paymentMethod = String(payment.payment_method || '').toLowerCase();
      const description = String(payment.description || '').toLowerCase();

      const isRentPayment =
        paymentType === 'rent' ||
        (paymentType.length === 0 &&
          (paymentMethod === 'stripe' || paymentMethod === 'card' || description.includes('rent')));

      if (!isRentPayment) {
        return sum;
      }

      return sum + Number(payment.amount || 0);
    }, 0);

    if (rentCollected > 0) {
      categoryTotals.Rent = (categoryTotals.Rent || 0) + rentCollected;
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
router.get('/export', requireFeatureAccess('advanced_exports'), async (req: AnalyticsRequest, res: Response) => {
  try {
    const { range = '30d', format = 'csv' } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const accountId = await resolveAnalyticsAccountId(req);
    await reconcileStripeProcessingPayments(accountId);
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
