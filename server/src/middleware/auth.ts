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
    const { data: membership, error: membershipError } = await supabase
      .from('account_members')
      .select('account_id, role')
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      res.status(403).json({
        error: 'User not associated with any account'
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
      const { data: membership } = await supabase
        .from('account_members')
        .select('account_id, role')
        .eq('user_id', user.id)
        .single();

      if (membership) {
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
