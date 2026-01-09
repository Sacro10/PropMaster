/**
 * Payment Service
 * Handles rent collection, payment processing, and payment tracking
 */

import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { createLedgerEntry } from './ledgerService';

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
      tenant:user_profiles!tenant_user_id(full_name, email, phone),
      unit:units(unit_number, property_id, properties(name, address1, city, state))
    `)
    .eq('account_id', accountId)
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

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
      name: p.tenant?.full_name || 'Unknown',
      email: p.tenant?.email || '',
      phone: p.tenant?.phone,
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

  return (data || []).map((p: any) => ({
    id: p.payment_id,
    leaseId: p.lease_id,
    tenantUserId: p.tenant_user_id,
    unitId: p.unit_id,
    amount: Number(p.amount),
    dueDate: p.due_date,
    daysOverdue: p.days_overdue,
    tenantName: p.tenant_name,
    propertyName: p.property_name,
    unitNumber: p.unit_number,
  }));
}

/**
 * Get collection statistics
 */
export async function getCollectionStatistics(accountId: string): Promise<CollectionStats> {
  // Try view first
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
  // Get payment details
  const { data: payment, error } = await supabase
    .from('payments')
    .select(`
      *,
      tenant:user_profiles!tenant_user_id(full_name, email, phone),
      unit:units(unit_number, properties(name))
    `)
    .eq('id', paymentId)
    .eq('account_id', accountId)
    .single();

  if (error || !payment) {
    throw new Error('Payment not found');
  }

  // TODO: Implement actual email/SMS sending
  // For now, just log the activity

  await logActivityEvent(
    accountId,
    userId,
    'payment_reminder_sent',
    `Payment reminder sent to ${payment.tenant.full_name}`,
    {
      entityType: 'payment',
      entityId: paymentId,
      metadata: {
        tenant_name: payment.tenant.full_name,
        tenant_email: payment.tenant.email,
        amount: payment.amount,
        due_date: payment.due_date,
        days_overdue: Math.floor(
          (Date.now() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24)
        ),
      },
    }
  );

  console.log('[Payment] Reminder stub:', {
    to: payment.tenant.email,
    phone: payment.tenant.phone,
    amount: payment.amount,
    due_date: payment.due_date,
    property: payment.unit.properties.name,
    unit: payment.unit.unit_number,
  });
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
