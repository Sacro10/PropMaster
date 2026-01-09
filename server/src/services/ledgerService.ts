/**
 * Ledger Service
 * Handles double-entry bookkeeping for financial tracking
 */

import { supabaseAdmin as supabase } from '../supabase';

export interface LedgerEntry {
  id: string;
  accountId: string;
  entryType: 'debit' | 'credit';
  accountName: string;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
  disbursementId: string | null;
  description: string;
  entryDate: string;
  createdAt: string;
}

export interface CreateLedgerEntryData {
  entryType: 'debit' | 'credit';
  accountName: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  disbursementId?: string;
  description: string;
  entryDate?: string;
}

/**
 * Create a ledger entry
 */
export async function createLedgerEntry(
  accountId: string,
  data: CreateLedgerEntryData
): Promise<LedgerEntry> {
  const { data: entry, error } = await supabase
    .from('ledger_entries')
    .insert({
      account_id: accountId,
      entry_type: data.entryType,
      account_name: data.accountName,
      amount: data.amount,
      reference_type: data.referenceType,
      reference_id: data.referenceId,
      disbursement_id: data.disbursementId,
      description: data.description,
      entry_date: data.entryDate || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: entry.id,
    accountId: entry.account_id,
    entryType: entry.entry_type,
    accountName: entry.account_name,
    amount: Number(entry.amount),
    referenceType: entry.reference_type,
    referenceId: entry.reference_id,
    disbursementId: entry.disbursement_id,
    description: entry.description,
    entryDate: entry.entry_date,
    createdAt: entry.created_at,
  };
}

/**
 * Create paired ledger entries (double-entry)
 */
export async function createPairedLedgerEntries(
  accountId: string,
  debitEntry: CreateLedgerEntryData,
  creditEntry: CreateLedgerEntryData
): Promise<{ debit: LedgerEntry; credit: LedgerEntry }> {
  const [debit, credit] = await Promise.all([
    createLedgerEntry(accountId, debitEntry),
    createLedgerEntry(accountId, creditEntry),
  ]);

  return { debit, credit };
}

/**
 * Get ledger entries for account
 */
export async function getLedgerEntries(
  accountId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    accountName?: string;
    referenceType?: string;
    limit?: number;
  }
): Promise<LedgerEntry[]> {
  let query = supabase
    .from('ledger_entries')
    .select('*')
    .eq('account_id', accountId);

  if (filters?.startDate) {
    query = query.gte('entry_date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('entry_date', filters.endDate);
  }

  if (filters?.accountName) {
    query = query.eq('account_name', filters.accountName);
  }

  if (filters?.referenceType) {
    query = query.eq('reference_type', filters.referenceType);
  }

  query = query.order('entry_date', { ascending: false }).limit(filters?.limit || 100);

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((e: any) => ({
    id: e.id,
    accountId: e.account_id,
    entryType: e.entry_type,
    accountName: e.account_name,
    amount: Number(e.amount),
    referenceType: e.reference_type,
    referenceId: e.reference_id,
    disbursementId: e.disbursement_id,
    description: e.description,
    entryDate: e.entry_date,
    createdAt: e.created_at,
  }));
}

/**
 * Calculate account balance
 */
export async function calculateAccountBalance(
  accountId: string,
  accountName: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  let query = supabase
    .from('ledger_entries')
    .select('entry_type, amount')
    .eq('account_id', accountId)
    .eq('account_name', accountName);

  if (startDate) {
    query = query.gte('entry_date', startDate);
  }

  if (endDate) {
    query = query.lte('entry_date', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  let balance = 0;
  for (const entry of data || []) {
    if (entry.entry_type === 'debit') {
      balance -= Number(entry.amount);
    } else {
      balance += Number(entry.amount);
    }
  }

  return balance;
}

/**
 * Get income statement (NOI calculation)
 */
export async function getIncomeStatement(
  accountId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalIncome: number;
  totalExpenses: number;
  netOperatingIncome: number;
  breakdown: {
    income: Record<string, number>;
    expenses: Record<string, number>;
  };
}> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('entry_type, account_name, amount')
    .eq('account_id', accountId)
    .gte('entry_date', startDate)
    .lte('entry_date', endDate);

  if (error) throw error;

  const income: Record<string, number> = {};
  const expenses: Record<string, number> = {};
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const entry of data || []) {
    const amount = Number(entry.amount);

    // Income accounts (credits increase income)
    if (entry.account_name.includes('income') || entry.account_name.includes('revenue')) {
      if (entry.entry_type === 'credit') {
        income[entry.account_name] = (income[entry.account_name] || 0) + amount;
        totalIncome += amount;
      }
    }
    // Expense accounts (debits increase expenses)
    else if (
      entry.account_name.includes('expense') ||
      entry.account_name.includes('fee') ||
      entry.account_name.includes('maintenance')
    ) {
      if (entry.entry_type === 'debit') {
        expenses[entry.account_name] = (expenses[entry.account_name] || 0) + amount;
        totalExpenses += amount;
      }
    }
  }

  return {
    totalIncome,
    totalExpenses,
    netOperatingIncome: totalIncome - totalExpenses,
    breakdown: { income, expenses },
  };
}
