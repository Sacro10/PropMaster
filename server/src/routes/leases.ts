import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { setLeaseAutoPay } from '../services/leaseService';

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

export default router;
