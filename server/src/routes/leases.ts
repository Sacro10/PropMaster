import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { setLeaseAutoPay } from '../services/leaseService';
import { supabaseAdmin } from '../supabase';

const router = Router();

/**
 * POST /api/leases/:id/auto-pay
 * Enable/disable auto-pay and schedule monthly rent payments
 */
router.post('/:id/auto-pay', authenticate, Permissions.updateTenants, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const enabled = Boolean(req.body?.enabled);
    const result = await setLeaseAutoPay(req.user.accountId, req.params.id, enabled);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Set lease auto-pay error:', error);
    res.status(500).json({
      error: 'Failed to update auto-pay',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/leases/:id/tenant-auto-pay
 * Tenant self-service auto-pay toggle
 */
router.post('/:id/tenant-auto-pay', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    if (req.user.role !== 'tenant') {
      res.status(403).json({ error: 'Only tenants can update auto-pay from the portal.' });
      return;
    }

    const { data: lease, error: leaseError } = await supabaseAdmin
      .from('leases')
      .select('id, tenant_user_id')
      .eq('account_id', req.user.accountId)
      .eq('id', req.params.id)
      .single();

    if (leaseError || !lease) {
      res.status(404).json({ error: 'Lease not found.' });
      return;
    }

    if (lease.tenant_user_id !== req.user.id) {
      res.status(403).json({ error: 'You do not have access to this lease.' });
      return;
    }

    const enabled = Boolean(req.body?.enabled);
    const result = await setLeaseAutoPay(req.user.accountId, req.params.id, enabled);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Tenant auto-pay error:', error);
    res.status(500).json({
      error: 'Failed to update auto-pay',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
