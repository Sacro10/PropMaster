/**
 * Payment Service
 * Handles rent collection, payment processing, and payment tracking
 */

import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { createLedgerEntry } from './ledgerService';
import { sendResendEmail } from './emailService';
import {
  buildRentActionUrl,
  createNotifications,
  getAccountRoleMap,
  getAccountUsersByRoles,
} from './notificationService';

export interface Payment {
  id: string;
  accountId: string;
  leaseId: string | null;
  tenantUserId: string;
  unitId: string | null;
  amount: number;
  paymentType: 'rent' | 'deposit' | 'pet_deposit' | 'late_fee' | 'parking' | 'utility' | 'other';
  dueDate: string;
  paidAt: string | null;
  status: 'pending' | 'processing' | 'paid' | 'late' | 'failed' | 'refunded' | 'cancelled';
  paymentMethod: 'manual' | 'stripe' | 'ach' | 'check' | 'cash' | 'money_order';
  stripePaymentIntentId: string | null;
  checkNumber: string | null;
  transactionId: string | null;
  lateFeeAssessed: number;
  lateFeeWaived: boolean;
  autoPayEnabled: boolean;
  disbursed: boolean;
  disbursementId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentWithDetails extends Payment {
  tenant: { name: string; email: string; phone: string | null };
  unit: { unitNumber: string; propertyId: string };
  property: { name: string; address: string };
}

export interface OverduePayment {
  id: string;
  leaseId: string;
  tenantUserId: string;
  unitId: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
}

export interface CollectionStats {
  collectedThisMonth: number;
  collectionRate: number;
  autoPayEnrolled: number;
  avgCollectionTime: number;
  overdueCount: number;
}

interface PaymentNotificationContext {
  id: string;
  account_id: string;
  tenant_user_id: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  payment_type: string;
  tenant: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  unit: {
    unit_number: string | null;
    properties: {
      name: string | null;
    } | null;
  } | null;
}

function formatRentReminderDate(dueDate: string) {
  return new Date(`${dueDate}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPaymentLocationLabel(payment: PaymentNotificationContext) {
  const propertyName = payment.unit?.properties?.name || 'Property';
  const unitLabel = payment.unit?.unit_number ? ` #${payment.unit.unit_number}` : '';
  return `${propertyName}${unitLabel}`;
}

async function getPaymentNotificationContext(
  accountId: string,
  paymentId: string
): Promise<PaymentNotificationContext | null> {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      id,
      account_id,
      tenant_user_id,
      amount,
      due_date,
      paid_at,
      status,
      payment_type,
      unit:units(unit_number, properties(name))
    `)
    .eq('id', paymentId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const { data: tenantProfile } = await supabase
    .from('tenant_profiles')
    .select('full_name, email, phone')
    .eq('account_id', accountId)
    .eq('user_id', data.tenant_user_id)
    .maybeSingle();

  return {
    ...(data as any),
    tenant: tenantProfile || null,
  } as PaymentNotificationContext;
}

export async function notifyPaymentPaid(params: {
  accountId: string;
  paymentId: string;
  actorUserId?: string | null;
}): Promise<void> {
  const payment = await getPaymentNotificationContext(params.accountId, params.paymentId);
  if (!payment) {
    return;
  }

  const ownerRecipients = await getAccountUsersByRoles(
    params.accountId,
    ['owner', 'manager', 'admin'],
    {
      excludeUserIds: params.actorUserId ? [params.actorUserId] : [],
    }
  );

  const recipientIds = Array.from(
    new Set(
      [
        ...ownerRecipients,
        payment.tenant_user_id && payment.tenant_user_id !== params.actorUserId
          ? payment.tenant_user_id
          : null,
      ].filter(Boolean)
    )
  ) as string[];

  if (recipientIds.length === 0) {
    return;
  }

  const roleMap = await getAccountRoleMap(params.accountId, recipientIds);
  const propertyLabel = getPaymentLocationLabel(payment);
  const tenantName = payment.tenant?.full_name || 'Tenant';
  const message = [
    `Rent payment received for ${propertyLabel}.`,
    `Tenant: ${tenantName}`,
    `Amount: $${Number(payment.amount).toFixed(2)}`,
    `Paid: ${payment.paid_at ? formatRentReminderDate(payment.paid_at.split('T')[0]) : 'Today'}`,
  ].join('\n');

  await createNotifications(
    recipientIds.map((recipientId) => ({
      accountId: params.accountId,
      userId: recipientId,
      type: 'payment_received',
      title: recipientId === payment.tenant_user_id ? 'Your rent payment was received' : 'Rent payment received',
      message,
      actionUrl: buildRentActionUrl(roleMap.get(recipientId), payment.id),
      relatedEntityType: 'payment',
      relatedEntityId: payment.id,
      payload: {
        paymentId: payment.id,
        status: payment.status,
      },
    }))
  );
}

async function sendRentReminderNotification(params: {
  accountId: string;
  paymentId: string;
  stage: 'manual' | 'ten_day' | 'due_today' | 'overdue';
  actorUserId?: string | null;
}) {
  const payment = await getPaymentNotificationContext(params.accountId, params.paymentId);
  if (!payment || !payment.tenant_user_id) {
    return;
  }

  const dueDateText = formatRentReminderDate(payment.due_date);
  const propertyLabel = getPaymentLocationLabel(payment);
  const tenantName = payment.tenant?.full_name || 'Tenant';

  const stageCopy = {
    manual: {
      eventType: 'payment_reminder_sent',
      title: 'Rent payment reminder',
      subject: `Rent payment reminder for ${propertyLabel}`,
      body: `Hi ${tenantName},\n\nThis is a reminder that your rent payment for ${propertyLabel} is due on ${dueDateText}.\n\nAmount due: $${Number(payment.amount).toFixed(2)}.`,
    },
    ten_day: {
      eventType: 'rent_reminder_10_day_sent',
      title: 'Rent due in 10 days',
      subject: `Rent due soon for ${propertyLabel}`,
      body: `Hi ${tenantName},\n\nYour rent for ${propertyLabel} is due in 10 days on ${dueDateText}.\n\nAmount due: $${Number(payment.amount).toFixed(2)}.`,
    },
    due_today: {
      eventType: 'rent_reminder_due_day_sent',
      title: 'Rent due today',
      subject: `Rent due today for ${propertyLabel}`,
      body: `Hi ${tenantName},\n\nYour rent for ${propertyLabel} is due today, ${dueDateText}.\n\nAmount due: $${Number(payment.amount).toFixed(2)}.`,
    },
    overdue: {
      eventType: 'rent_reminder_overdue_sent',
      title: 'Rent is overdue',
      subject: `Rent overdue for ${propertyLabel}`,
      body: `Hi ${tenantName},\n\nYour rent for ${propertyLabel} was due on ${dueDateText} and is now overdue.\n\nAmount due: $${Number(payment.amount).toFixed(2)}.`,
    },
  }[params.stage];

  try {
    if (payment.tenant?.email) {
      await sendResendEmail({
        to: payment.tenant.email,
        subject: stageCopy.subject,
        text: stageCopy.body,
      });
    }
  } catch (error) {
    console.warn('[Payment] Failed to send rent reminder email:', error);
  }

  await createNotifications([
    {
      accountId: params.accountId,
      userId: payment.tenant_user_id,
      type: 'payment_due',
      title: stageCopy.title,
      message: [
        `${propertyLabel}`,
        `Amount: $${Number(payment.amount).toFixed(2)}`,
        `Due: ${dueDateText}`,
      ].join('\n'),
      actionUrl: buildRentActionUrl('tenant', payment.id),
      relatedEntityType: 'payment',
      relatedEntityId: payment.id,
      payload: {
        paymentId: payment.id,
        reminderStage: params.stage,
      },
      sentViaEmail: Boolean(payment.tenant?.email),
    },
  ]);

  await logActivityEvent(
    params.accountId,
    params.actorUserId || payment.tenant_user_id,
    stageCopy.eventType,
    `${stageCopy.title}: ${tenantName}`,
    {
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        amount: payment.amount,
        dueDate: payment.due_date,
        reminderStage: params.stage,
      },
    }
  );
}

/**
 * Get recent payments
 */
export async function getRecentPayments(
  accountId: string,
  limit: number = 50
): Promise<PaymentWithDetails[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      unit:units(unit_number, property_id, properties(name, address1, city, state))
    `)
    .eq('account_id', accountId)
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const tenantIds = Array.from(new Set((data || []).map((p: any) => p.tenant_user_id).filter(Boolean)));
  const { data: tenantProfiles } = tenantIds.length > 0
    ? await supabase
        .from('tenant_profiles')
        .select('user_id, full_name, email, phone')
        .eq('account_id', accountId)
        .in('user_id', tenantIds)
    : { data: [] as any[] };

  const tenantMap = new Map(
    (tenantProfiles || []).map((t: any) => [t.user_id, t])
  );

  return (data || []).map((p: any) => ({
    id: p.id,
    accountId: p.account_id,
    leaseId: p.lease_id,
    tenantUserId: p.tenant_user_id,
    unitId: p.unit_id,
    amount: Number(p.amount),
    paymentType: p.payment_type,
    dueDate: p.due_date,
    paidAt: p.paid_at,
    status: p.status,
    paymentMethod: p.payment_method,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    checkNumber: p.check_number,
    transactionId: p.transaction_id,
    lateFeeAssessed: Number(p.late_fee_assessed || 0),
    lateFeeWaived: p.late_fee_waived || false,
    autoPayEnabled: p.auto_pay_enabled || false,
    disbursed: p.disbursed || false,
    disbursementId: p.disbursement_id,
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    tenant: {
      name: tenantMap.get(p.tenant_user_id)?.full_name || 'Unknown',
      email: tenantMap.get(p.tenant_user_id)?.email || '',
      phone: tenantMap.get(p.tenant_user_id)?.phone,
    },
    unit: {
      unitNumber: p.unit?.unit_number || '',
      propertyId: p.unit?.property_id || '',
    },
    property: {
      name: p.unit?.properties?.name || 'Unknown',
      address: p.unit?.properties?.address1 || '',
    },
  }));
}

/**
 * Get overdue/pending payments
 */
export async function getOverduePayments(accountId: string): Promise<OverduePayment[]> {
  const { data, error } = await supabase.rpc('get_overdue_payments', {
    p_account_id: accountId,
  });

  if (error) throw error;

  const tenantIds = Array.from(new Set((data || []).map((p: any) => p.tenant_user_id).filter(Boolean)));
  const { data: tenantProfiles } = tenantIds.length > 0
    ? await supabase
        .from('tenant_profiles')
        .select('user_id, email')
        .eq('account_id', accountId)
        .in('user_id', tenantIds)
    : { data: [] as any[] };

  const tenantEmailMap = new Map(
    (tenantProfiles || []).map((t: any) => [t.user_id, t.email])
  );

  return (data || []).map((p: any) => ({
    id: p.payment_id,
    leaseId: p.lease_id,
    tenantUserId: p.tenant_user_id,
    unitId: p.unit_id,
    amount: Number(p.amount),
    dueDate: p.due_date,
    daysOverdue: p.days_overdue,
    tenantName: p.tenant_name,
    tenantEmail: tenantEmailMap.get(p.tenant_user_id) || '',
    propertyName: p.property_name,
    unitNumber: p.unit_number,
  }));
}

/**
 * Get collection statistics
 */
export async function getCollectionStatistics(
  accountId: string,
  options?: { forceLive?: boolean }
): Promise<CollectionStats> {
  if (!options?.forceLive) {
    // Try view first for performance unless we need live values.
    const { data: viewData, error: viewError } = await supabase
      .from('collection_stats_by_account')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!viewError && viewData) {
      return {
        collectedThisMonth: Number(viewData.collected_this_month || 0),
        collectionRate: Number(viewData.collection_rate || 0),
        autoPayEnrolled: Number(viewData.auto_pay_enrollment_rate || 0),
        avgCollectionTime: Number(viewData.avg_collection_days || 0),
        overdueCount: Number(viewData.overdue_count || 0),
      };
    }
  }

  // Fallback to manual calculation
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    collectedResult,
    totalDueResult,
    autoPayResult,
    avgTimeResult,
    overdueResult,
  ] = await Promise.all([
    // Collected this month
    supabase
      .from('payments')
      .select('amount')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth.toISOString()),

    // Total due this month
    supabase
      .from('payments')
      .select('amount')
      .eq('account_id', accountId)
      .eq('payment_type', 'rent')
      .gte('due_date', startOfMonth.toISOString().split('T')[0]),

    // Auto-pay stats
    supabase
      .from('leases')
      .select('auto_pay_enabled')
      .eq('account_id', accountId)
      .eq('status', 'active'),

    // Avg collection time
    supabase
      .from('payments')
      .select('due_date, paid_at')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .gte('paid_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),

    // Overdue count
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .in('status', ['pending', 'late'])
      .lt('due_date', today.toISOString().split('T')[0]),
  ]);

  const collectedThisMonth = collectedResult.data?.reduce(
    (sum: number, p: any) => sum + Number(p.amount),
    0
  ) || 0;

  const totalDue = totalDueResult.data?.reduce(
    (sum: number, p: any) => sum + Number(p.amount),
    0
  ) || 0;

  const collectionRate = totalDue > 0 ? (collectedThisMonth / totalDue) * 100 : 100;

  const totalLeases = autoPayResult.data?.length || 1;
  const autoPayCount = autoPayResult.data?.filter((l: any) => l.auto_pay_enabled).length || 0;
  const autoPayEnrolled = (autoPayCount / totalLeases) * 100;

  const avgCollectionTime =
    avgTimeResult.data && avgTimeResult.data.length > 0
      ? avgTimeResult.data.reduce((sum: number, p: any) => {
          const dueDate = new Date(p.due_date);
          const paidAt = new Date(p.paid_at);
          const days = Math.floor(
            (paidAt.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / avgTimeResult.data.length
      : 0;

  return {
    collectedThisMonth,
    collectionRate: Math.round(collectionRate * 10) / 10,
    autoPayEnrolled: Math.round(autoPayEnrolled * 10) / 10,
    avgCollectionTime: Math.round(avgCollectionTime * 10) / 10,
    overdueCount: overdueResult.count || 0,
  };
}

/**
 * Send payment reminder
 */
export async function sendPaymentReminder(
  accountId: string,
  userId: string,
  paymentId: string
): Promise<void> {
  const payment = await getPaymentNotificationContext(accountId, paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }

  await sendRentReminderNotification({
    accountId,
    paymentId,
    actorUserId: userId,
    stage: 'manual',
  });
}

export async function processAutomatedRentReminders(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, account_id, due_date, status, payment_type')
    .eq('payment_type', 'rent')
    .in('status', ['pending', 'late'])
    .lte('due_date', new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  if (error) {
    throw error;
  }

  for (const payment of payments || []) {
    const dueDate = new Date(`${payment.due_date}T12:00:00Z`);
    const dayDiff = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const stage =
      dayDiff === 10
        ? 'ten_day'
        : dayDiff === 0
          ? 'due_today'
          : dayDiff < 0
            ? 'overdue'
            : null;

    if (!stage) {
      continue;
    }

    const eventType =
      stage === 'ten_day'
        ? 'rent_reminder_10_day_sent'
        : stage === 'due_today'
          ? 'rent_reminder_due_day_sent'
          : 'rent_reminder_overdue_sent';

    let activityQuery = supabase
      .from('activity_events')
      .select('id')
      .eq('account_id', payment.account_id)
      .eq('entity_type', 'payment')
      .eq('entity_id', payment.id)
      .eq('event_type', eventType);

    if (stage === 'overdue') {
      activityQuery = activityQuery.gte('created_at', todayIso);
    }

    const { data: existingLogs, error: existingLogsError } = await activityQuery.limit(1);

    if (existingLogsError) {
      console.warn('[Payment] Failed to check prior reminder logs:', existingLogsError);
      continue;
    }

    if ((existingLogs || []).length > 0) {
      continue;
    }

    await sendRentReminderNotification({
      accountId: payment.account_id,
      paymentId: payment.id,
      stage,
    });
  }
}

/**
 * Record payment (creates payment and ledger entry)
 */
export async function recordPayment(
  accountId: string,
  userId: string,
  data: {
    leaseId: string;
    tenantUserId: string;
    unitId: string;
    amount: number;
    paymentType: string;
    dueDate: string;
    paidAt?: string;
    paymentMethod?: string;
    checkNumber?: string;
    notes?: string;
  }
): Promise<Payment> {
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      account_id: accountId,
      lease_id: data.leaseId,
      tenant_user_id: data.tenantUserId,
      unit_id: data.unitId,
      amount: data.amount,
      payment_type: data.paymentType,
      due_date: data.dueDate,
      paid_at: data.paidAt || new Date().toISOString(),
      status: data.paidAt ? 'paid' : 'pending',
      payment_method: data.paymentMethod || 'manual',
      check_number: data.checkNumber,
      notes: data.notes,
    })
    .select()
    .single();

  if (error) throw error;

  // Create ledger entry for income if paid
  if (data.paidAt) {
    await createLedgerEntry(accountId, {
      entryType: 'credit',
      accountName: 'rent_income',
      amount: data.amount,
      referenceType: 'payment',
      referenceId: payment.id,
      description: `Rent payment received - ${data.paymentType}`,
      entryDate: data.paidAt.split('T')[0],
    });
  }

  await logActivityEvent(accountId, userId, 'payment_recorded', `Payment recorded: $${data.amount}`, {
    entityType: 'payment',
    entityId: payment.id,
  });

  if (payment.status === 'paid') {
    try {
      await notifyPaymentPaid({
        accountId,
        paymentId: payment.id,
        actorUserId: userId,
      });
    } catch (notificationError) {
      console.warn('[Payment] Failed to create payment received notifications:', notificationError);
    }
  }

  return {
    id: payment.id,
    accountId: payment.account_id,
    leaseId: payment.lease_id,
    tenantUserId: payment.tenant_user_id,
    unitId: payment.unit_id,
    amount: Number(payment.amount),
    paymentType: payment.payment_type,
    dueDate: payment.due_date,
    paidAt: payment.paid_at,
    status: payment.status,
    paymentMethod: payment.payment_method,
    stripePaymentIntentId: payment.stripe_payment_intent_id,
    checkNumber: payment.check_number,
    transactionId: payment.transaction_id,
    lateFeeAssessed: Number(payment.late_fee_assessed || 0),
    lateFeeWaived: payment.late_fee_waived || false,
    autoPayEnabled: payment.auto_pay_enabled || false,
    disbursed: payment.disbursed || false,
    disbursementId: payment.disbursement_id,
    notes: payment.notes,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
  };
}
