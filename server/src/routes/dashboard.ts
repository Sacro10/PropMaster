import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { getDashboardSummary } from '../services/dashboardService';

const router = Router();

/**
 * GET /api/dashboard/summary
 * Returns comprehensive dashboard summary including:
 * - Property and unit statistics
 * - Revenue metrics and trends
 * - Maintenance request stats
 * - Tenant information
 * - Recent activity feed
 */
router.get(
  '/summary',
  authenticate,
  Permissions.readAnalytics,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const summary = await getDashboardSummary(req.user.accountId);
      res.json(summary);
    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
