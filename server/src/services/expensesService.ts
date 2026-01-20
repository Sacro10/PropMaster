/**
 * Expense Service
 * Handles creation of expense records
 */

import { supabaseAdmin as supabase } from '../supabase';

export interface CreateExpenseData {
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

async function getOrCreateCategory(accountId: string, categoryName?: string) {
  const trimmed = (categoryName || '').trim();
  if (!trimmed) {
    return null;
  }

  const { data: existing, error: existingError } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', trimmed)
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  if (existing && existing.length > 0) {
    return existing[0].id as string;
  }

  const { data: created, error: createdError } = await supabase
    .from('expense_categories')
    .insert({
      account_id: accountId,
      name: trimmed,
    })
    .select('id')
    .single();

  if (createdError) {
    throw createdError;
  }

  return created.id as string;
}

export async function createExpense(accountId: string, data: CreateExpenseData) {
  const categoryId = data.categoryId || (await getOrCreateCategory(accountId, data.categoryName));

  const payload = {
    account_id: accountId,
    amount: data.amount,
    expense_date: data.expenseDate,
    description: data.description || null,
    category_id: categoryId,
    property_id: data.propertyId || null,
    unit_id: data.unitId || null,
    vendor_profile_id: data.vendorProfileId || null,
    maintenance_request_id: data.maintenanceRequestId || null,
    payment_method: data.paymentMethod || 'manual',
  };

  const { data: created, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return created;
}
