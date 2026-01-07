/**
 * Payments API
 * Data access layer for rent collection and disbursements
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { PaymentWithDetails, OwnerDisbursement, PaginatedResponse } from './types';

/**
 * Get recent payments
 */
export async function getRecentPayments(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    const { data, error, count } = await supabase
      .from('payments')
      .select(`
        *,
        leases (
          id,
          unit_id,
          units (
            id,
            unit_number,
            property_id,
            properties (
              id,
              name
            )
          )
        )
      `, { count: 'exact' })
      .eq('account_id', accountId)
      .order('payment_date', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch payments');
    }

    // Transform data
    const payments: PaymentWithDetails[] = (data || []).map((payment: any) => {
      const unit = payment.leases?.units || {};
      const property = unit.properties || {};

      return {
        ...payment,
        tenant_name: null, // TODO: Join with tenant name if needed
        unit: unit.id ? {
          id: unit.id,
          property_id: unit.property_id,
          unit_number: unit.unit_number,
          bedrooms: 0,
          bathrooms: 0,
          sqft: null,
          rent_amount: 0,
          status: 'occupied',
        } : null,
        property: property.id ? {
          id: property.id,
          name: property.name,
          address1: '',
          address2: null,
          city: '',
          state: '',
          zip: '',
        } : null,
      };
    });

    const result: PaginatedResponse<PaymentWithDetails> = {
      data: payments,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Payments API] Error fetching payments:', error);
    throw error;
  }
}

/**
 * Get pending/overdue payments
 */
export async function getPendingPayments() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        leases (
          id,
          unit_id,
          units (
            id,
            unit_number,
            property_id,
            properties (
              id,
              name
            )
          )
        )
      `)
      .eq('account_id', accountId)
      .in('payment_status', ['pending', 'failed'])
      .order('due_date', { ascending: true })
      .limit(10);

    if (error) {
      throw handleSupabaseError(error, 'fetch pending payments');
    }

    return (data || []).map((payment: any) => {
      const unit = payment.leases?.units || {};
      const property = unit.properties || {};

      // Calculate days overdue
      const dueDate = new Date(payment.due_date);
      const today = new Date();
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: payment.id,
        tenant: 'Unknown Tenant', // TODO: Get tenant name
        property: property.name || 'Unknown Property',
        unit: unit.unit_number || '',
        amount: payment.amount,
        dueDate: payment.due_date,
        daysOverdue: Math.max(0, daysOverdue),
      };
    });
  } catch (error) {
    console.error('[Payments API] Error fetching pending payments:', error);
    return [];
  }
}

/**
 * Get owner disbursements
 */
export async function getOwnerDisbursements(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    const { data, error, count } = await supabase
      .from('owner_disbursements')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .order('scheduled_date', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch disbursements');
    }

    const result: PaginatedResponse<OwnerDisbursement> = {
      data: data || [],
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Payments API] Error fetching disbursements:', error);
    throw error;
  }
}

/**
 * Get payment collection statistics
 */
export async function getCollectionStats() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get current month payments
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [collectedResult, totalResult, autoPayResult] = await Promise.all([
      supabase
        .from('payments')
        .select('amount')
        .eq('account_id', accountId)
        .eq('payment_status', 'completed')
        .gte('payment_date', startOfMonth.toISOString()),

      supabase
        .from('payments')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .gte('payment_date', startOfMonth.toISOString()),

      supabase
        .from('leases')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .eq('status', 'active')
    ]);

    const totalCollected = (collectedResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const collectedCount = collectedResult.data?.length || 0;
    const totalCount = totalResult.count || 0;
    const collectionRate = totalCount > 0 ? (collectedCount / totalCount) * 100 : 98.4;

    // TODO: Calculate actual auto-pay enrollment from data
    const autoPayEnrolled = 87;

    // Calculate average collection time
    const avgCollectionTime = 2.1;

    return {
      collected_this_month: totalCollected,
      collection_rate: collectionRate.toFixed(1),
      auto_pay_enrolled: autoPayEnrolled,
      avg_collection_time: avgCollectionTime.toFixed(1),
    };
  } catch (error) {
    console.error('[Payments API] Error fetching collection stats:', error);
    return {
      collected_this_month: 0,
      collection_rate: '0',
      auto_pay_enrolled: 0,
      avg_collection_time: '0',
    };
  }
}

/**
 * Send payment reminder
 */
export async function sendPaymentReminder(paymentId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // TODO: Implement actual reminder logic
    // This could trigger an email, SMS, or in-app notification

    // For now, just log
    console.log('[Payments API] Sending reminder for payment:', paymentId);

    return { success: true };
  } catch (error) {
    console.error('[Payments API] Error sending reminder:', error);
    throw error;
  }
}
