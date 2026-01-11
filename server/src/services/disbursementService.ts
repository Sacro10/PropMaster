/**
 * Disbursement Service
 * Handles owner disbursements and payout processing
 */

import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { createLedgerEntry } from './ledgerService';

export interface OwnerEntity {
  id: string;
  accountId: string;
  name: string;
  email: string | null;
  phone: string | null;
  entityType: 'individual' | 'llc' | 'trust' | 'corporation';
  disbursementMethod: 'ach' | 'wire' | 'check' | 'manual';
  disbursementSchedule: 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'on_demand';
  disbursementDay: number;
  managementFeePercentage: number;
  managementFeeFlat: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface Disbursement {
  id: string;
  accountId: string;
  ownerId: string | null;
  propertyId: string | null;
  amount: number;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  disbursedAt: string | null;
  paymentMethod: string;
  totalRentCollected: number;
  totalExpenses: number;
  managementFee: number;
  netAmount: number;
  breakdown: any;
  notes: string | null;
  createdAt: string;
}

export interface DisbursementWithDetails extends Disbursement {
  owner: { name: string; email: string | null };
  property: { name: string } | null;
  paymentCount: number;
}

/**
 * Get owner entities
 */
export async function getOwnerEntities(accountId: string): Promise<OwnerEntity[]> {
  const { data, error } = await supabase
    .from('owner_entities')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  return (data || []).map((o: any) => ({
    id: o.id,
    accountId: o.account_id,
    name: o.name,
    email: o.email,
    phone: o.phone,
    entityType: o.entity_type,
    disbursementMethod: o.disbursement_method,
    disbursementSchedule: o.disbursement_schedule,
    disbursementDay: o.disbursement_day,
    managementFeePercentage: Number(o.management_fee_percentage),
    managementFeeFlat: o.management_fee_flat ? Number(o.management_fee_flat) : null,
    isActive: o.is_active,
    createdAt: o.created_at,
  }));
}

/**
 * Get pending disbursements
 */
export async function getPendingDisbursements(
  accountId: string
): Promise<DisbursementWithDetails[]> {
  const { data, error } = await supabase
    .from('owner_disbursements')
    .select(`
      *,
      owner:owner_entities(name, email),
      property:properties(name)
    `)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .order('period_end', { ascending: true });

  if (error) throw error;

  return (data || []).map((d: any) => ({
    id: d.id,
    accountId: d.account_id,
    ownerId: d.owner_id,
    propertyId: d.property_id,
    amount: Number(d.amount),
    periodStart: d.period_start,
    periodEnd: d.period_end,
    status: d.status,
    disbursedAt: d.disbursed_at,
    paymentMethod: d.payment_method,
    totalRentCollected: Number(d.total_rent_collected),
    totalExpenses: Number(d.total_expenses),
    managementFee: Number(d.management_fee),
    netAmount: Number(d.net_amount),
    breakdown: d.breakdown,
    notes: d.notes,
    createdAt: d.created_at,
    owner: {
      name: d.owner?.name || 'Unknown',
      email: d.owner?.email,
    },
    property: d.property ? { name: d.property.name } : null,
    paymentCount: d.breakdown?.payment_count || 0,
  }));
}

/**
 * Calculate disbursement for period
 */
export async function calculateDisbursement(
  accountId: string,
  ownerId: string,
  periodStart: string,
  periodEnd: string
): Promise<{
  totalRentCollected: number;
  totalExpenses: number;
  managementFee: number;
  netAmount: number;
  breakdown: any;
}> {
  // Get owner details
  const { data: owner, error: ownerError } = await supabase
    .from('owner_entities')
    .select('*, property_owners!inner(property_id)')
    .eq('id', ownerId)
    .eq('account_id', accountId)
    .single();

  if (ownerError || !owner) {
    throw new Error('Owner not found');
  }

  const propertyIds = owner.property_owners.map((po: any) => po.property_id);

  // Get total rent collected for owner's properties
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('amount, unit_id, units!inner(property_id)')
    .eq('account_id', accountId)
    .eq('payment_type', 'rent')
    .eq('status', 'paid')
    .gte('paid_at', periodStart)
    .lte('paid_at', periodEnd)
    .in('units.property_id', propertyIds);

  if (paymentsError) throw paymentsError;

  const totalRentCollected = (payments || []).reduce(
    (sum: number, p: any) => sum + Number(p.amount),
    0
  );

  // Get total expenses for owner's properties
  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('amount')
    .eq('account_id', accountId)
    .gte('expense_date', periodStart)
    .lte('expense_date', periodEnd)
    .in('property_id', propertyIds);

  if (expensesError) throw expensesError;

  const totalExpenses = (expenses || []).reduce((sum: number, e: any) => sum + Number(e.amount), 0);

  // Calculate management fee
  let managementFee = 0;
  if (owner.management_fee_flat) {
    managementFee = Number(owner.management_fee_flat);
  } else if (owner.management_fee_percentage) {
    managementFee = totalRentCollected * (Number(owner.management_fee_percentage) / 100);
  }

  const netAmount = totalRentCollected - totalExpenses - managementFee;

  return {
    totalRentCollected,
    totalExpenses,
    managementFee,
    netAmount,
    breakdown: {
      property_count: propertyIds.length,
      payment_count: payments?.length || 0,
      expense_count: expenses?.length || 0,
    },
  };
}

/**
 * Create disbursement
 */
export async function createDisbursement(
  accountId: string,
  userId: string,
  data: {
    ownerId: string;
    propertyId?: string;
    periodStart: string;
    periodEnd: string;
    paymentMethod?: string;
  }
): Promise<Disbursement> {
  // Calculate amounts
  const calculation = await calculateDisbursement(
    accountId,
    data.ownerId,
    data.periodStart,
    data.periodEnd
  );

  const { data: disbursement, error } = await supabase
    .from('owner_disbursements')
    .insert({
      account_id: accountId,
      owner_id: data.ownerId,
      property_id: data.propertyId,
      amount: calculation.netAmount,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      status: 'pending',
      payment_method: data.paymentMethod || 'manual',
      total_rent_collected: calculation.totalRentCollected,
      total_expenses: calculation.totalExpenses,
      management_fee: calculation.managementFee,
      net_amount: calculation.netAmount,
      breakdown: calculation.breakdown,
    })
    .select()
    .single();

  if (error) throw error;

  await logActivityEvent(
    accountId,
    userId,
    'disbursement_created',
    `Disbursement created: $${calculation.netAmount}`,
    {
      entityType: 'disbursement',
      entityId: disbursement.id,
    }
  );

  return {
    id: disbursement.id,
    accountId: disbursement.account_id,
    ownerId: disbursement.owner_id,
    propertyId: disbursement.property_id,
    amount: Number(disbursement.amount),
    periodStart: disbursement.period_start,
    periodEnd: disbursement.period_end,
    status: disbursement.status,
    disbursedAt: disbursement.disbursed_at,
    paymentMethod: disbursement.payment_method,
    totalRentCollected: Number(disbursement.total_rent_collected),
    totalExpenses: Number(disbursement.total_expenses),
    managementFee: Number(disbursement.management_fee),
    netAmount: Number(disbursement.net_amount),
    breakdown: disbursement.breakdown,
    notes: disbursement.notes,
    createdAt: disbursement.created_at,
  };
}

/**
 * Process disbursement (with idempotency)
 */
export async function processDisbursement(
  accountId: string,
  userId: string,
  disbursementId: string,
  idempotencyKey?: string
): Promise<Disbursement> {
  // Use database function for atomic processing with idempotency
  const { data, error } = await supabase.rpc('process_disbursement', {
    p_disbursement_id: disbursementId,
    p_idempotency_key: idempotencyKey || `${disbursementId}-${Date.now()}`,
    p_processed_by: userId,
  });

  if (error) {
    const message = String(error.message || '');
    const missingRpc = message.includes('process_disbursement') || message.includes('does not exist');
    if (missingRpc) {
      const { data: updated, error: updateError } = await supabase
        .from('owner_disbursements')
        .update({
          status: 'completed',
          disbursed_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .eq('id', disbursementId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      await logActivityEvent(
        accountId,
        userId,
        'disbursement_processed',
        `Disbursement processed: $${updated.net_amount}`,
        {
          entityType: 'disbursement',
          entityId: updated.id,
          metadata: {
            amount: updated.net_amount,
            period_start: updated.period_start,
            period_end: updated.period_end,
          },
        }
      );

      return {
        id: updated.id,
        accountId: updated.account_id,
        ownerId: updated.owner_id,
        propertyId: updated.property_id,
        amount: Number(updated.amount),
        periodStart: updated.period_start,
        periodEnd: updated.period_end,
        status: updated.status,
        disbursedAt: updated.disbursed_at,
        paymentMethod: updated.payment_method,
        totalRentCollected: Number(updated.total_rent_collected),
        totalExpenses: Number(updated.total_expenses),
        managementFee: Number(updated.management_fee),
        netAmount: Number(updated.net_amount),
        breakdown: updated.breakdown,
        notes: updated.notes,
        createdAt: updated.created_at,
      };
    }

    if (error.message.includes('Duplicate disbursement')) {
      // Idempotency check failed - return existing disbursement
      const { data: existing } = await supabase
        .from('owner_disbursements')
        .select('*')
        .eq('id', disbursementId)
        .single();

      if (existing) {
        return {
          id: existing.id,
          accountId: existing.account_id,
          ownerId: existing.owner_id,
          propertyId: existing.property_id,
          amount: Number(existing.amount),
          periodStart: existing.period_start,
          periodEnd: existing.period_end,
          status: existing.status,
          disbursedAt: existing.disbursed_at,
          paymentMethod: existing.payment_method,
          totalRentCollected: Number(existing.total_rent_collected),
          totalExpenses: Number(existing.total_expenses),
          managementFee: Number(existing.management_fee),
          netAmount: Number(existing.net_amount),
          breakdown: existing.breakdown,
          notes: existing.notes,
          createdAt: existing.created_at,
        };
      }
    }
    throw error;
  }

  // Fetch updated disbursement
  const { data: disbursement, error: fetchError } = await supabase
    .from('owner_disbursements')
    .select('*')
    .eq('id', disbursementId)
    .single();

  if (fetchError) throw fetchError;

  await logActivityEvent(
    accountId,
    userId,
    'disbursement_processed',
    `Disbursement processed: $${disbursement.net_amount}`,
    {
      entityType: 'disbursement',
      entityId: disbursement.id,
      metadata: {
        amount: disbursement.net_amount,
        period_start: disbursement.period_start,
        period_end: disbursement.period_end,
        payment_count: disbursement.breakdown?.payment_count,
      },
    }
  );

  return {
    id: disbursement.id,
    accountId: disbursement.account_id,
    ownerId: disbursement.owner_id,
    propertyId: disbursement.property_id,
    amount: Number(disbursement.amount),
    periodStart: disbursement.period_start,
    periodEnd: disbursement.period_end,
    status: disbursement.status,
    disbursedAt: disbursement.disbursed_at,
    paymentMethod: disbursement.payment_method,
    totalRentCollected: Number(disbursement.total_rent_collected),
    totalExpenses: Number(disbursement.total_expenses),
    managementFee: Number(disbursement.management_fee),
    netAmount: Number(disbursement.net_amount),
    breakdown: disbursement.breakdown,
    notes: disbursement.notes,
    createdAt: disbursement.created_at,
  };
}
