/**
 * Base API client utilities
 * Handles common patterns for Supabase queries with RLS
 */

import { supabase } from '../supabaseClient';
import { resolvePortalRoleIntent, roleMatchesPortalIntent } from '../portalRole';
import type { Session } from '@supabase/supabase-js';

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
const ACCOUNT_CACHE_KEY = 'pm:last_account_membership';
const ACCOUNT_CACHE_TTL_MS = 5 * 60 * 1000;

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, skewSeconds = 60): boolean {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp - nowSeconds <= skewSeconds;
}

function mergeHeadersWithAuth(headers: HeadersInit | undefined, token: string): Headers {
  const merged = new Headers(headers || {});
  merged.set('Authorization', `Bearer ${token}`);
  if (!merged.has('Content-Type')) {
    merged.set('Content-Type', 'application/json');
  }
  return merged;
}

function readCachedAccountId(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; accountId?: string; ts?: number };
    if (parsed.userId !== userId) return null;
    if (!parsed.accountId || !parsed.ts) return null;
    if (Date.now() - parsed.ts > ACCOUNT_CACHE_TTL_MS) return null;
    return parsed.accountId;
  } catch {
    return null;
  }
}

function writeCachedAccountId(userId: string, accountId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ACCOUNT_CACHE_KEY,
      JSON.stringify({ userId, accountId, ts: Date.now() })
    );
  } catch {
    // Ignore cache write issues.
  }
}

async function resolveSession(forceRefresh = false): Promise<Session | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session || null;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  if (isTokenExpiringSoon(session.access_token)) {
    const { data } = await supabase.auth.refreshSession();
    return data.session || session;
  }

  return session;
}

export async function getAccessToken(options?: { forceRefresh?: boolean }): Promise<string | null> {
  const session = await resolveSession(Boolean(options?.forceRefresh));
  return session?.access_token || null;
}

export async function fetchWithAuthRetry(
  url: string,
  options: RequestInit = {},
  config?: {
    retryUnauthorized?: boolean;
    signOutOnUnauthorized?: boolean;
  }
): Promise<Response> {
  const retryUnauthorized = config?.retryUnauthorized !== false;
  const signOutOnUnauthorized = config?.signOutOnUnauthorized !== false;

  const token = await getAccessToken();
  if (!token) {
    throw new Error('No active session');
  }

  let response = await fetch(url, {
    ...options,
    headers: mergeHeadersWithAuth(options.headers, token),
  });

  if (response.status === 401 && retryUnauthorized) {
    const refreshedToken = await getAccessToken({ forceRefresh: true });
    if (refreshedToken) {
      response = await fetch(url, {
        ...options,
        headers: mergeHeadersWithAuth(options.headers, refreshedToken),
      });
    }
  }

  if (response.status === 401 && signOutOnUnauthorized) {
    await supabase.auth.signOut().catch(() => undefined);
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
}

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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (!user) {
      return null;
    }

    const cachedAccountId = readCachedAccountId(user.id);

    const { data, error } = await supabase
      .from('account_members')
      .select('account_id, role, joined_at, created_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error) {
      console.error('[API Client] Error fetching account ID:', error);
      return cachedAccountId;
    }

    const records = Array.isArray(data) ? data : data ? [data] : [];
    if (records.length === 0) {
      return null;
    }

    const portalIntent = resolvePortalRoleIntent();
    const metadataRole = user.user_metadata?.role as string | undefined;
    const preferredRecord = portalIntent
      ? records.find((item) => roleMatchesPortalIntent(portalIntent, item.role))
      : metadataRole
        ? records.find((item) => item.role === metadataRole)
        : null;

    const sorted = [...records].sort((a, b) => {
      const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
      const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const resolvedAccountId = (preferredRecord || sorted[0])?.account_id || null;
    if (resolvedAccountId) {
      writeCachedAccountId(user.id, resolvedAccountId);
    }
    return resolvedAccountId || cachedAccountId;
  } catch (error) {
    console.error('[API Client] Exception fetching account ID:', error);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (user) {
        const cachedAccountId = readCachedAccountId(user.id);
        if (cachedAccountId) return cachedAccountId;
      }
    } catch {
      // Ignore nested fetch/cache failures.
    }
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
      .select('role, joined_at, created_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error) {
      console.error('[API Client] Error fetching user role:', error);
      return null;
    }

    const records = Array.isArray(data) ? data : data ? [data] : [];
    if (records.length === 0) {
      return null;
    }

    const portalIntent = resolvePortalRoleIntent();
    const metadataRole = user.user_metadata?.role as string | undefined;
    const preferredRecord = portalIntent
      ? records.find((item) => roleMatchesPortalIntent(portalIntent, item.role))
      : metadataRole
        ? records.find((item) => item.role === metadataRole)
        : null;

    const sorted = [...records].sort((a, b) => {
      const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
      const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    return (preferredRecord || sorted[0])?.role || null;
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
