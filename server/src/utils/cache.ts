/**
 * Simple in-memory cache for analytics data
 * Production: Use Redis for distributed caching
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
  key: string;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clean expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      if (entry) {
        this.cache.delete(key);
      }
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTTL;
    const entry: CacheEntry<T> = {
      data,
      expires: Date.now() + ttl,
      key
    };
    this.cache.set(key, entry);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Generate cache key for analytics
  generateAnalyticsKey(
    userId: string,
    endpoint: string,
    params: Record<string, any> = {}
  ): string {
    const paramStr = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return `analytics:${userId}:${endpoint}:${paramStr}`;
  }
}

export const cache = new MemoryCache();
export { MemoryCache };