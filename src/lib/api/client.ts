/**
 * Base API client utilities
 * Handles common patterns for Supabase queries with RLS
 */

import { supabase } from '../supabaseClient';

/**
 * Get the current user's account ID from account_members
 * This is required for all queries to ensure proper account scoping
 */
export async function getCurrentAccountId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('account_members')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('[API Client] Error fetching account ID:', error);
      return null;
    }

    return data?.account_id || null;
  } catch (error) {
    console.error('[API Client] Exception fetching account ID:', error);
    return null;
  }
}

/**
 * Get the current user
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[API Client] Error fetching user:', error);
    return null;
  }

  return user;
}

/**
 * Get the current user's role in the account
 */
export async function getCurrentUserRole(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('account_members')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('[API Client] Error fetching user role:', error);
      return null;
    }

    return data?.role || null;
  } catch (error) {
    console.error('[API Client] Exception fetching user role:', error);
    return null;
  }
}

/**
 * Handle Supabase errors consistently
 */
export function handleSupabaseError(error: any, operation: string): Error {
  console.error(`[API Client] ${operation} failed:`, error);

  if (error.message) {
    return new Error(error.message);
  }

  return new Error(`Failed to ${operation}`);
}

/**
 * Pagination helper
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export function getPaginationRange(params: PaginationParams = {}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { from, to, page, pageSize };
}

/**
 * Calculate pagination metadata
 */
export function calculatePaginationMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    hasMore: total > page * pageSize,
  };
}
