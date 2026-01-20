/**
 * Expense API
 * Create expense records
 */

import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateExpensePayload {
  amount: number;
  expenseDate: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  propertyId?: string;
  unitId?: string;
  vendorProfileId?: string;
  maintenanceRequestId?: string;
  paymentMethod?: string;
}

export async function createExpense(payload: CreateExpensePayload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }

  const response = await fetch(`${API_BASE}/api/expenses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      throw new Error('API not running');
    }
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Failed to create expense');
  }

  return response.json();
}
