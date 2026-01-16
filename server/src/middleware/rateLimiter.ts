import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

const store: RateLimitStore = {};

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetAt < now) {
      delete store[key];
    }
  }
}, 10 * 60 * 1000);

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  message?: string; // Custom error message
}

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    accountId?: string;
  };
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padding = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));

  try {
    const json = Buffer.from(`${payload}${padding}`, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAuthenticatedKey(req: Request): string | null {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.accountId) {
    return `account:${authReq.user.accountId}`;
  }
  if (authReq.user?.id) {
    return `user:${authReq.user.id}`;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const payload = decodeJwtPayload(token);
    const sub = payload?.sub;
    if (typeof sub === 'string' && sub.length > 0) {
      return `user:${sub}`;
    }
  }

  return null;
}

function rateLimitKey(req: Request, prefix: string): string {
  const authKey = getAuthenticatedKey(req);
  if (authKey) {
    return `${prefix}:${authKey}`;
  }
  return `${prefix}:${req.ip || 'unknown'}`;
}

/**
 * Rate limiting middleware
 * Production: Use Redis-based rate limiter (e.g., express-rate-limit with Redis)
 * Development: In-memory rate limiter (this implementation)
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator = (req) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    message = 'Too many requests, please try again later',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Initialize or get existing record
    if (!store[key] || store[key].resetAt < now) {
      store[key] = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    // Increment count
    store[key].count++;

    const record = store[key];
    const remaining = Math.max(0, max - record.count);
    const resetInSeconds = Math.ceil((record.resetAt - now) / 1000);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetInSeconds.toString());

    if (record.count > max) {
      return res.status(429).json({
        error: message,
        retryAfter: resetInSeconds,
      });
    }

    // If response is successful and skipSuccessfulRequests is true, decrement count
    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400 && store[key]) {
          store[key].count = Math.max(0, store[key].count - 1);
        }
      });
    }

    next();
  };
}

// Predefined rate limiters
export const rateLimiters = {
  // Stripe webhooks - be permissive but prevent abuse
  webhook: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    keyGenerator: (req) => `webhook:${req.ip}`,
    message: 'Too many webhook requests',
  }),

  // Checkout sessions - prevent rapid subscription attempts
  checkout: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 checkout sessions per 15 min
    keyGenerator: (req) => `checkout:${req.body.userId || req.ip}`,
    message: 'Too many checkout attempts, please try again later',
  }),

  // Customer portal - prevent enumeration attacks
  portal: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 portal sessions per 15 min
    keyGenerator: (req) => `portal:${req.body.accountId || req.ip}`,
    message: 'Too many portal requests, please try again later',
  }),

  // General API rate limit
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 min
    keyGenerator: (req) => rateLimitKey(req, 'api'),
    message: 'Too many requests, please slow down',
  }),

  // Analytics endpoints - allow reasonable query frequency
  analytics: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 analytics requests per 5 min
    keyGenerator: (req) => rateLimitKey(req, 'analytics'),
    message: 'Too many analytics requests, please try again later',
  }),
};
