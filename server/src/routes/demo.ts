import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { seedDemoData, clearDemoData } from '../services/demoDataSeeder';

const router = Router();

/**
 * POST /api/demo/seed
 * Generate demo data for the authenticated user's account
 */
router.post(
  '/seed',
  authenticate,
  Permissions.createProperties, // Only managers can seed data
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const options = {
        accountId: req.user.accountId,
        numProperties: req.body.numProperties || 3,
        numTenants: req.body.numTenants || 15,
        numApplications: req.body.numApplications || 5,
        numMaintenanceRequests: req.body.numMaintenanceRequests || 8,
        numPayments: req.body.numPayments || 20,
        numShowings: req.body.numShowings || 4,
        includeMessages: req.body.includeMessages !== false,
      };

      await seedDemoData(options);

      res.json({
        success: true,
        message: 'Demo data generated successfully',
        data: options,
      });
    } catch (error) {
      console.error('Demo seed error:', error);
      res.status(500).json({
        error: 'Failed to generate demo data',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/demo/clear
 * Clear all demo data for the authenticated user's account
 */
router.delete(
  '/clear',
  authenticate,
  Permissions.deleteProperties,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await clearDemoData(req.user.accountId);

      res.json({
        success: true,
        message: 'Demo data cleared successfully',
      });
    } catch (error) {
      console.error('Demo clear error:', error);
      res.status(500).json({
        error: 'Failed to clear demo data',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
