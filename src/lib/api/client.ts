/**
 * Base API client utilities
 * Handles common patterns for Supabase queries with RLS
 */

import { supabase } from '../supabaseClient';

interface FetchJsonResult<T> {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string | null;
  data: T | null;
  text: string | null;
}

interface FetchJsonOptions {
  retries?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
  cacheKey?: string;
  cacheTtlMs?: number;
}

const responseCache = new Map<string, { expiresAt: number; value: Promise<FetchJsonResult<any>> }>();

function getRetryDelayMs(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) {
    return fallbackMs;
  }

  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDate = new Date(retryAfter);
  const delay = retryDate.getTime() - Date.now();
  return Number.isNaN(delay) ? fallbackMs : Math.max(0, delay);
}

async function parseJsonResponse<T>(response: Response): Promise<FetchJsonResult<T>> {
  const contentType = response.headers.get('content-type');
  const text = await response.text();
  if (contentType && contentType.includes('application/json') && text) {
    try {
      const data = JSON.parse(text) as T;
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType,
        data,
        text,
      };
    } catch (error) {
      console.error('[API Client] Failed to parse JSON response:', error);
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType,
    data: null,
    text: text || null,
  };
}

/**
 * Fetch JSON with retry + lightweight in-memory caching for GET requests.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  options: RequestInit = {},
  config: FetchJsonOptions = {}
): Promise<FetchJsonResult<T>> {
  const {
    retries = 1,
    retryDelayMs = 800,
    retryOnStatuses = [429, 503],
    cacheKey,
    cacheTtlMs = 0,
  } = config;

  const method = (options.method || 'GET').toUpperCase();
  const canCache = method === 'GET' && cacheKey && cacheTtlMs > 0;

  if (canCache) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const requestPromise = (async () => {
    let attempt = 0;
    while (true) {
      const response = await fetch(url, options);

      if (retryOnStatuses.includes(response.status) && attempt < retries) {
        const delay = getRetryDelayMs(response, retryDelayMs);
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return parseJsonResponse<T>(response);
    }
  })();

  if (canCache) {
    responseCache.set(cacheKey, {
      expiresAt: Date.now() + cacheTtlMs,
      value: requestPromise,
    });
  }

  try {
    const result = await requestPromise;
    if (canCache && !result.ok) {
      responseCache.delete(cacheKey);
    }
    return result;
  } catch (error) {
    if (canCache) {
      responseCache.delete(cacheKey);
    }
    throw error;
  }
}

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
