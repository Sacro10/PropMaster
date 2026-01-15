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
  getHVACVendorsForProperty,
  createUnitHVACStatus,
  getUnitHVACStatus,
  getPropertyHVACStatusSummary,
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
 * GET /api/hvac/vendors
 * List HVAC vendors near a property
 */
router.get(
  '/vendors',
  authenticate,
  requirePermission('hvac', 'read'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const propertyId = req.query.propertyId as string | undefined;
      const radiusMilesRaw = req.query.radiusMiles as string | undefined;
      const radiusMilesValue = radiusMilesRaw ? Number(radiusMilesRaw) : undefined;
      const radiusMiles = Number.isFinite(radiusMilesValue) ? radiusMilesValue : undefined;
      const includeExternal = req.query.includeExternal !== 'false';
      if (!propertyId) {
        res.status(400).json({ error: 'propertyId is required' });
        return;
      }

      const vendors = await getHVACVendorsForProperty(req.user.accountId, propertyId, radiusMiles, includeExternal);
      res.json(vendors);
    } catch (error) {
      console.error('Get HVAC vendors error:', error);
      res.status(500).json({
        error: 'Failed to fetch HVAC vendors',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/hvac/status
 * Get HVAC status history for a unit
 */
router.get(
  '/status',
  authenticate,
  requirePermission('hvac', 'read'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const unitId = req.query.unitId as string | undefined;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 25) : 5;
      if (!unitId) {
        res.status(400).json({ error: 'unitId is required' });
        return;
      }

      const statuses = await getUnitHVACStatus(req.user.accountId, unitId, limit);
      res.json(statuses);
    } catch (error) {
      console.error('Get HVAC status error:', error);
      res.status(500).json({
        error: 'Failed to fetch HVAC status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/hvac/status/property
 * Get latest HVAC status by unit for a property
 */
router.get(
  '/status/property',
  authenticate,
  requirePermission('hvac', 'read'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const propertyId = req.query.propertyId as string | undefined;
      if (!propertyId) {
        res.status(400).json({ error: 'propertyId is required' });
        return;
      }

      const statuses = await getPropertyHVACStatusSummary(req.user.accountId, propertyId);
      res.json(statuses);
    } catch (error) {
      console.error('Get HVAC property status error:', error);
      res.status(500).json({
        error: 'Failed to fetch HVAC property status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/hvac/status
 * Log HVAC status for a unit
 */
router.post(
  '/status',
  authenticate,
  requirePermission('hvac', 'create'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const { unitId, condition, lastServicedDate, notes } = req.body || {};
      if (!unitId || !condition) {
        res.status(400).json({ error: 'unitId and condition are required' });
        return;
      }

      const status = await createUnitHVACStatus(req.user.accountId, req.user.id || null, {
        unitId,
        condition,
        lastServicedDate,
        notes,
      });

      res.status(201).json(status);
    } catch (error) {
      console.error('Create HVAC status error:', error);
      res.status(500).json({
        error: 'Failed to create HVAC status',
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
      const details =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : (error as { message?: string } | null)?.message || 'Unknown error';
      res.status(500).json({
        error: 'Failed to generate batch',
        details,
      });
    }
  }
);

export default router;
