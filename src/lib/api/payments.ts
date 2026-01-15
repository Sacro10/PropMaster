/**
 * Frontend API: Payments & Disbursements
 * Handles rent collection, payment tracking, and owner disbursements
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId } from './client';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface Payment {
  id: string;
  lease_id: string;
  tenant_id: string;
  amount: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  status: 'pending' | 'paid' | 'late' | 'disbursed';
  notes: string | null;
  created_at: string;
  tenant?: {
    id: string;
    name: string;
    email: string;
  };
  unit?: {
    id: string;
    unit_number: string;
    property_id: string;
  };
  property?: {
    id: string;
    name: string;
    address: string;
  };
}

export interface CollectionStats {
  total_collected: number;
  total_due: number;
  collection_rate: number;
  overdue_count: number;
  overdue_amount: number;
  auto_pay_count: number;
  manual_pay_count: number;
}

export interface OwnerEntity {
  id: string;
  account_id: string;
  name: string;
  email: string;
  phone: string | null;
  entity_type: 'individual' | 'llc' | 'partnership' | 'corporation';
  tax_id: string | null;
  bank_account_last4: string | null;
  payment_method: 'ach' | 'check' | 'wire';
  created_at: string;
}

export interface Disbursement {
  id: string;
  owner_id: string;
  property_id: string | null;
  period_start: string;
  period_end: string;
  gross_rent: number;
  management_fee: number;
  maintenance_costs: number;
  net_amount: number;
  payment_method: 'ach' | 'check' | 'wire';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_by: string | null;
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  owner?: OwnerEntity;
}

export interface DisbursementCalculation {
  gross_rent: number;
  management_fee: number;
  maintenance_costs: number;
  other_expenses: number;
  net_amount: number;
  payments: Payment[];
}

/**
 * Get recent payments
 */
export async function getRecentPayments(limit = 50): Promise<Payment[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(`${API_BASE}/api/payments/recent?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Payments API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error('Failed to fetch payments');
    }
    const result = await response.json();
    
    // Transform backend data to frontend format
    return (result.data || []).map((p: any) => ({
      id: p.id,
      lease_id: p.leaseId,
      tenant_id: p.tenantUserId,
      amount: p.amount,
      payment_date: p.paidAt,
      due_date: p.dueDate,
      payment_method: p.paymentMethod,
      payment_status: p.status,
      status: p.status,
      tenant_name: p.tenant?.name || 'Unknown',
      notes: p.notes,
      created_at: p.createdAt,
      tenant: {
        id: p.tenantUserId,
        name: p.tenant?.name || 'Unknown',
        email: p.tenant?.email || '',
      },
      unit: {
        id: p.unitId || '',
        unit_number: p.unit?.unitNumber || '',
        property_id: p.unit?.propertyId || '',
      },
      property: {
        id: p.unit?.propertyId || '',
        name: p.property?.name || 'Unknown',
        address: p.property?.address || '',
      },
    }));
  } catch (error) {
    console.error('[Payments API] Error fetching recent payments:', error);
    return [];
  }
}

/**
 * Get overdue payments
 */
export async function getOverduePayments(): Promise<Payment[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(`${API_BASE}/api/payments/overdue`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Payments API] Received HTML instead of JSON - API may not be running');
        return [];
      }
      throw new Error('Failed to fetch overdue payments');
    }
    const result = await response.json();
    
    // Transform backend data to frontend format
    return (result.data || result || []).map((p: any) => ({
      id: p.id || p.payment_id,
      lease_id: p.leaseId || p.lease_id,
      tenant_id: p.tenantUserId || p.tenant_user_id,
      amount: p.amount,
      payment_date: p.paidAt || p.paid_at,
      due_date: p.dueDate || p.due_date,
      payment_method: p.paymentMethod || 'manual',
      status: 'late',
      payment_status: 'late',
      tenant_name: p.tenantName || p.tenant_name || 'Unknown',
      notes: p.notes,
      created_at: p.createdAt || p.created_at,
      tenant: {
        id: p.tenantUserId || p.tenant_user_id || '',
        name: p.tenantName || p.tenant_name || 'Unknown',
        email: p.tenantEmail || p.tenant_email || '',
      },
      unit: {
        id: p.unitId || p.unit_id || '',
        unit_number: p.unitNumber || p.unit_number || '',
        property_id: '',
      },
      property: {
        id: '',
        name: p.propertyName || p.property_name || 'Unknown',
        address: '',
      },
    }));
  } catch (error) {
    console.error('[Payments API] Error fetching overdue payments:', error);
    return [];
  }
}

/**
 * Get pending/overdue payments (alias for UI compatibility)
 */
export async function getPendingPayments() {
  try {
    const payments = await getOverduePayments();
    
    // Transform to UI format
    return payments.map((payment: Payment) => {
      const dueDate = new Date(payment.due_date);
      const today = new Date();
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: payment.id,
        tenant: payment.tenant?.name || 'Unknown Tenant',
        tenantEmail: payment.tenant?.email || '',
        property: payment.property?.name || 'Unknown Property',
        unit: payment.unit?.unit_number || '',
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
 * Get collection statistics
 */
export async function getCollectionStats() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(`${API_BASE}/api/payments/stats?live=true`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[Payments API] Received HTML instead of JSON - API may not be running');
        return {
          collected_this_month: 0,
          collection_rate: '0.0',
          auto_pay_enrolled: '0',
          avg_collection_time: '0.0',
          overdue_count: 0,
        };
      }
      throw new Error('Failed to fetch stats');
    }
    const stats = await response.json();
    
    // Transform to UI format - handle both numeric and string values
    return {
      collected_this_month: Number(stats.collectedThisMonth || 0),
      collection_rate: Number(stats.collectionRate || 0).toFixed(1),
      auto_pay_enrolled: Number(stats.autoPayEnrolled || 0).toFixed(0),
      avg_collection_time: Number(stats.avgCollectionTime || 0).toFixed(1),
      overdue_count: Number(stats.overdueCount || 0),
    };
  } catch (error) {
    console.error('[Payments API] Error fetching collection stats:', error);
    return {
      collected_this_month: 0,
      collection_rate: '0.0',
      auto_pay_enrolled: '0',
      avg_collection_time: '0.0',
      overdue_count: 0,
    };
  }
}

/**
 * Send payment reminder
 */
export async function sendPaymentReminder(paymentId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/payments/${paymentId}/send-reminder`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) throw new Error('Failed to send reminder');
}

/**
 * Record a payment
 */
export async function recordPayment(data: {
  leaseId: string;
  tenantId: string;
  amount: number;
  paymentDate: string;
  dueDate: string;
  paymentMethod: string;
  notes?: string;
}): Promise<Payment> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lease_id: data.leaseId,
      tenant_id: data.tenantId,
      amount: data.amount,
      payment_date: data.paymentDate,
      due_date: data.dueDate,
      payment_method: data.paymentMethod,
      notes: data.notes,
    }),
  });

  if (!response.ok) throw new Error('Failed to record payment');
  return await response.json();
}

/**
 * Get owner entities
 */
export async function getOwnerEntities(): Promise<OwnerEntity[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/disbursements/owners`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) throw new Error('Failed to fetch owners');
  return await response.json();
}

/**
 * Get owner disbursements
 */
export async function getOwnerDisbursements(): Promise<Disbursement[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(`${API_BASE}/api/disbursements/pending`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) throw new Error('Failed to fetch disbursements');
    const result = await response.json();
    
    // Transform backend data to frontend format
    return (result.data || []).map((d: any) => ({
      id: d.id,
      owner_id: d.ownerId,
      owner_name: d.owner?.name || 'Unknown Owner',
      property_id: d.propertyId,
      property_count: d.breakdown?.property_count || 0,
      period_start: d.periodStart,
      period_end: d.periodEnd,
      gross_rent: d.totalRentCollected,
      management_fee: d.managementFee,
      maintenance_costs: d.totalExpenses,
      net_amount: d.netAmount,
      amount: d.netAmount,
      payment_method: d.paymentMethod,
      status: d.status,
      processed_by: d.processedBy,
      processed_at: d.disbursedAt,
      scheduled_date: d.periodEnd, // Use period end as scheduled date
      notes: d.notes,
      created_at: d.createdAt,
      owner: d.owner,
    }));
  } catch (error) {
    console.error('[Payments API] Error fetching disbursements:', error);
    return [];
  }
}

/**
 * Get pending disbursements (alias)
 */
export async function getPendingDisbursements(): Promise<Disbursement[]> {
  return getOwnerDisbursements();
}

/**
 * Calculate disbursement for period
 */
export async function calculateDisbursement(
  ownerId: string,
  periodStart: string,
  periodEnd: string
): Promise<DisbursementCalculation> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/disbursements/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ownerId, periodStart, periodEnd }),
  });

  if (!response.ok) throw new Error('Failed to calculate disbursement');
  return await response.json();
}

/**
 * Create a disbursement
 */
export async function createDisbursement(data: {
  ownerId: string;
  propertyId?: string;
  periodStart: string;
  periodEnd: string;
  paymentMethod: 'ach' | 'check' | 'wire';
}): Promise<Disbursement> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/disbursements`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ownerId: data.ownerId,
      propertyId: data.propertyId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      paymentMethod: data.paymentMethod,
    }),
  });

  if (!response.ok) throw new Error('Failed to create disbursement');
  return await response.json();
}

/**
 * Process a disbursement
 */
export async function processDisbursement(
  disbursementId: string,
  idempotencyKey?: string
): Promise<Disbursement> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };

  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }

  const response = await fetch(`${API_BASE}/api/disbursements/${disbursementId}/process`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ idempotencyKey }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || 'Failed to process disbursement');
  }
  return await response.json();
}
