import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  getHVACProgramSummary,
  getHVACEnrollments,
  createHVACEnrollment,
  getDeliveryBatches,
  markDeliveryDelivered,
  generateDeliveryBatch,
} from '../services/hvacService';

const router = Router();

/**
 * GET /api/hvac/summary
 * Get HVAC program summary statistics
 */
router.get(
  '/summary',
  authenticate,
  requirePermission('hvac', 'read'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const summary = await getHVACProgramSummary(req.user.accountId);
      res.json(summary);
    } catch (error) {
      console.error('Get HVAC summary error:', error);
      res.status(500).json({
        error: 'Failed to fetch HVAC summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/hvac/enrollments
 * List all HVAC enrollments
 */
router.get(
  '/enrollments',
  authenticate,
  requirePermission('hvac', 'read'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const filters = {
        status: req.query.status as string,
        unitId: req.query.unitId as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await getHVACEnrollments(req.user.accountId, filters);
      res.json(result);
    } catch (error) {
      console.error('Get HVAC enrollments error:', error);
      res.status(500).json({
        error: 'Failed to fetch enrollments',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/hvac/enrollments
 * Create a new HVAC enrollment
 */
router.post(
  '/enrollments',
  authenticate,
  requirePermission('hvac', 'create'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const data = {
        unitId: req.body.unitId,
        frequency: req.body.frequency,
        filterSize: req.body.filterSize,
      };

      if (!data.unitId || !data.frequency || !data.filterSize) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['unitId', 'frequency', 'filterSize'],
        });
        return;
      }

      const enrollment = await createHVACEnrollment(req.user.accountId, data);
      res.status(201).json(enrollment);
    } catch (error) {
      console.error('Create HVAC enrollment error:', error);
      res.status(500).json({
        error: 'Failed to create enrollment',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/hvac/batches
 * List delivery batches
 */
router.get(
  '/batches',
  authenticate,
  requirePermission('hvac', 'read'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const filters = {
        status: req.query.status as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await getDeliveryBatches(req.user.accountId, filters);
      res.json(result);
    } catch (error) {
      console.error('Get delivery batches error:', error);
      res.status(500).json({
        error: 'Failed to fetch batches',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/hvac/deliveries/:id/delivered
 * Mark a delivery as delivered
 */
router.post(
  '/deliveries/:id/delivered',
  authenticate,
  requirePermission('hvac', 'update'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const trackingNumber = req.body.trackingNumber as string | undefined;
      await markDeliveryDelivered(req.user.accountId, req.params.id, trackingNumber);
      res.json({ success: true });
    } catch (error) {
      console.error('Mark delivery delivered error:', error);
      res.status(500).json({
        error: 'Failed to mark delivery as delivered',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/hvac/batches/generate
 * Generate next delivery batch
 */
router.post(
  '/batches/generate',
  authenticate,
  requirePermission('hvac', 'create'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const batch = await generateDeliveryBatch(req.user.accountId);
      res.status(201).json(batch);
    } catch (error) {
      console.error('Generate delivery batch error:', error);
      if (error instanceof Error && error.message === 'No enrollments due for delivery') {
        res.status(409).json({
          error: 'No enrollments due for delivery',
          details: 'Add active HVAC enrollments or adjust next delivery dates.',
        });
        return;
      }
      res.status(500).json({
        error: 'Failed to generate batch',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
