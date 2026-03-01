import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin as supabase } from '../supabase';

/**
 * Extended Express Request with authenticated user info
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    accountId?: string;
    role?: string;
  };
}

async function resolvePrimaryMembership(userId: string) {
  const { data, error } = await supabase
    .from('account_members')
    .select('account_id, role, is_active, joined_at, created_at')
    .eq('user_id', userId);

  if (error) {
    return { membership: null, error };
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return { membership: null, error: null };
  }

  const activeRows = rows.filter((row) => row.is_active !== false);
  const candidates = activeRows.length > 0 ? activeRows : rows;

  const sorted = [...candidates].sort((a, b) => {
    const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
    const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return { membership: sorted[0], error: null };
}

/**
 * Authentication middleware - verifies Supabase JWT token
 * Extracts user info and account membership from the token
 */
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Get the user's account membership
    const { membership, error: membershipError } = await resolvePrimaryMembership(user.id);

    if (membershipError || !membership) {
      res.status(403).json({
        error: 'User not associated with any account'
      });
      return;
    }

    if (membership.is_active === false) {
      res.status(403).json({
        error: 'Account pending approval',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      accountId: membership.account_id,
      role: membership.role,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 */
export async function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      const { membership } = await resolvePrimaryMembership(user.id);

      if (membership && membership.is_active !== false) {
        req.user = {
          id: user.id,
          email: user.email,
          accountId: membership.account_id,
          role: membership.role,
        };
      }
    }

    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    next();
  }
}
