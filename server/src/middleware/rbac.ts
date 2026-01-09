import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { supabaseAdmin as supabase } from '../supabase';

/**
 * Permission cache to avoid repeated database queries
 * Format: { "role:resource:action": boolean }
 */
const permissionCache = new Map<string, boolean>();

/**
 * Check if a role has permission for a specific action on a resource
 */
async function hasPermission(
  role: string,
  resource: string,
  action: string
): Promise<boolean> {
  const cacheKey = `${role}:${resource}:${action}`;

  // Check cache first
  if (permissionCache.has(cacheKey)) {
    return permissionCache.get(cacheKey)!;
  }

  // Owner has all permissions
  if (role === 'owner') {
    permissionCache.set(cacheKey, true);
    return true;
  }

  // Query the database
  const { data: permissions, error } = await supabase
    .from('role_permissions')
    .select('allowed')
    .or(`role.eq.${role},role.eq.*`)
    .or(`resource.eq.${resource},resource.eq.*`)
    .or(`action.eq.${action},action.eq.*`)
    .eq('allowed', true);

  if (error) {
    console.error('Permission check error:', error);
    return false;
  }

  const hasAccess = permissions && permissions.length > 0;
  permissionCache.set(cacheKey, hasAccess);

  return hasAccess;
}

/**
 * RBAC middleware factory - creates middleware that checks permissions
 *
 * Usage:
 * router.get('/properties', requirePermission('properties', 'read'), handler)
 * router.post('/tenants', requirePermission('tenants', 'create'), handler)
 */
export function requirePermission(resource: string, action: string) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Must be authenticated first
      if (!req.user || !req.user.role) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const allowed = await hasPermission(req.user.role, resource, action);

      if (!allowed) {
        res.status(403).json({
          error: 'Insufficient permissions',
          required: { resource, action },
          userRole: req.user.role,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Require specific role(s)
 *
 * Usage:
 * router.delete('/account', requireRole(['owner', 'admin']), handler)
 */
export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.role) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: roles,
        userRole: req.user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Clear the permission cache (useful for testing or when permissions change)
 */
export function clearPermissionCache(): void {
  permissionCache.clear();
}

/**
 * Common permission presets for convenience
 */
export const Permissions = {
  // Properties
  readProperties: requirePermission('properties', 'read'),
  createProperties: requirePermission('properties', 'create'),
  updateProperties: requirePermission('properties', 'update'),
  deleteProperties: requirePermission('properties', 'delete'),

  // Tenants
  readTenants: requirePermission('tenants', 'read'),
  createTenants: requirePermission('tenants', 'create'),
  updateTenants: requirePermission('tenants', 'update'),
  deleteTenants: requirePermission('tenants', 'delete'),

  // Applications
  readApplications: requirePermission('applications', 'read'),
  updateApplications: requirePermission('applications', 'update'),

  // Maintenance
  readMaintenance: requirePermission('maintenance', 'read'),
  createMaintenance: requirePermission('maintenance', 'create'),
  updateMaintenance: requirePermission('maintenance', 'update'),

  // Financials
  readFinancials: requirePermission('financials', 'read'),
  updateFinancials: requirePermission('financials', 'update'),
  exportFinancials: requirePermission('financials', 'export'),

  // Showings
  readShowings: requirePermission('showings', 'read'),
  createShowings: requirePermission('showings', 'create'),
  updateShowings: requirePermission('showings', 'update'),

  // Payments
  readPayments: requirePermission('payments', 'read'),
  createPayments: requirePermission('payments', 'create'),
  updatePayments: requirePermission('payments', 'update'),

  // Disbursements
  readDisbursements: requirePermission('disbursements', 'read'),
  createDisbursements: requirePermission('disbursements', 'create'),
  updateDisbursements: requirePermission('disbursements', 'update'),

  // Messages
  readMessages: requirePermission('messages', 'read'),
  createMessages: requirePermission('messages', 'create'),
  updateMessages: requirePermission('messages', 'update'),
  deleteMessages: requirePermission('messages', 'delete'),

  // Analytics
  readAnalytics: requirePermission('analytics', 'read'),
  exportAnalytics: requirePermission('analytics', 'export'),
};
