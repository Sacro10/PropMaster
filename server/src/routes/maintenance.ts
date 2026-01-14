import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getMaintenanceRequests,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
  getSLAMetrics,
  getMaintenanceStats,
  getAvailableVendors,
  getMaintenanceRequestVendorContext,
  assignVendorToRequest,
  createEmergencyRequest,
  getEmergencySupportConfig,
  upsertEmergencySupportConfig,
  testEmergencyNotifications,
  getRoutingMetrics,
  CreateMaintenanceData,
  UpdateMaintenanceData,
} from '../services/maintenanceService';

const router = Router();

/**
 * GET /api/maintenance
 * List maintenance requests with filtering
 */
router.get('/', authenticate, Permissions.readMaintenance, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const filters = {
      status: req.query.status as string,
      priority: req.query.priority as string,
      propertyId: req.query.propertyId as string,
      unitId: req.query.unitId as string,
      assignedTo: req.query.assignedTo as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await getMaintenanceRequests(req.user.accountId, filters);
    res.json(result);
  } catch (error) {
    console.error('Get maintenance requests error:', error);
    res.status(500).json({
      error: 'Failed to fetch maintenance requests',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/maintenance
 * Create a new maintenance request
 */
router.post(
  '/',
  authenticate,
  Permissions.createMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const data: CreateMaintenanceData = {
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
        category: req.body.category,
        unitId: req.body.unitId,
        reportedBy: req.body.reportedBy,
      };

      // Validate required fields
      if (
        !data.title ||
        !data.description ||
        !data.priority ||
        !data.category ||
        !data.unitId
      ) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['title', 'description', 'priority', 'category', 'unitId'],
        });
        return;
      }

      const request = await createMaintenanceRequest(
        req.user.accountId,
        req.user.id,
        data
      );
      res.status(201).json(request);
    } catch (error) {
      console.error('Create maintenance request error:', error);
      res.status(500).json({
        error: 'Failed to create maintenance request',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PATCH /api/maintenance/:id
 * Update a maintenance request (status, assignment, etc.)
 */
router.patch(
  '/:id',
  authenticate,
  Permissions.updateMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const updates: UpdateMaintenanceData = {
        status: req.body.status,
        assignedTo: req.body.assignedTo,
        priority: req.body.priority,
        notes: req.body.notes,
      };

      const request = await updateMaintenanceRequest(
        req.user.accountId,
        req.user.id,
        req.params.id,
        updates
      );
      res.json(request);
    } catch (error) {
      console.error('Update maintenance request error:', error);
      res.status(500).json({
        error: 'Failed to update maintenance request',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/maintenance/:id
 * Delete a maintenance request
 */
router.delete(
  '/:id',
  authenticate,
  Permissions.updateMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await deleteMaintenanceRequest(req.user.accountId, req.user.id ?? null, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete maintenance request error:', error);
      const statusCode = error instanceof Error && error.message === 'Maintenance request not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to delete maintenance request',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/maintenance/sla-metrics
 * Get SLA performance metrics
 */
router.get(
  '/sla-metrics',
  authenticate,
  Permissions.readMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const metrics = await getSLAMetrics(req.user.accountId);
      res.json(metrics);
    } catch (error) {
      console.error('Get SLA metrics error:', error);
      res.status(500).json({
        error: 'Failed to fetch SLA metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/maintenance/stats
 * Get maintenance KPI statistics
 */
router.get(
  '/stats',
  authenticate,
  Permissions.readMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const stats = await getMaintenanceStats(req.user.accountId);
      res.json(stats);
    } catch (error) {
      console.error('Get maintenance stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch maintenance stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/maintenance/:id/vendors
 * Get available vendors for a maintenance request
 */
router.get(
  '/:id/vendors',
  authenticate,
  Permissions.readMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const requestId = req.params.id;
      const context = await getMaintenanceRequestVendorContext(
        req.user.accountId,
        requestId
      );
      const vendors = await getAvailableVendors(
        req.user.accountId,
        context.category || 'general',
        context.propertyZip || '00000'
      );
      res.json(vendors);
    } catch (error) {
      console.error('Get available vendors error:', error);
      res.status(500).json({
        error: 'Failed to fetch available vendors',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/maintenance/:id/assign
 * Assign a vendor to a maintenance request
 */
router.post(
  '/:id/assign',
  authenticate,
  Permissions.updateMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const { vendorProfileId } = req.body;
      if (!vendorProfileId) {
        res.status(400).json({ error: 'vendorProfileId is required' });
        return;
      }

      await assignVendorToRequest(
        req.user.accountId,
        req.user.id,
        req.params.id,
        vendorProfileId
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Assign vendor error:', error);
      res.status(500).json({
        error: 'Failed to assign vendor',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/maintenance/emergency
 * Create an emergency maintenance request
 */
router.post(
  '/emergency',
  authenticate,
  Permissions.createMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const data = {
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        unitId: req.body.unitId,
        reportedBy: req.body.reportedBy,
        notificationChannels: req.body.notificationChannels,
      };

      // Validate required fields
      if (!data.title || !data.description || !data.category || !data.unitId) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['title', 'description', 'category', 'unitId'],
        });
        return;
      }

      const result = await createEmergencyRequest(
        req.user.accountId,
        req.user.id,
        data
      );
      res.status(201).json({
        request: result.request,
        notifications: result.notifications,
      });
    } catch (error) {
      console.error('Create emergency request error:', error);
      res.status(500).json({
        error: 'Failed to create emergency request',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/maintenance/emergency-config
 * Get emergency support configuration
 */
router.get(
  '/emergency-config',
  authenticate,
  Permissions.readMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const config = await getEmergencySupportConfig(req.user.accountId);
      res.json(config);
    } catch (error) {
      console.error('Get emergency config error:', error);
      res.status(500).json({
        error: 'Failed to fetch emergency config',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/maintenance/emergency-config
 * Update emergency support configuration
 */
router.put(
  '/emergency-config',
  authenticate,
  Permissions.updateMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const updated = await upsertEmergencySupportConfig(req.user.accountId, {
        isEnabled: Boolean(req.body.isEnabled),
        notificationPhone: req.body.notificationPhone || null,
        notificationEmail: req.body.notificationEmail || null,
        notificationChannels: req.body.notificationChannels || [],
      });

      res.json(updated);
    } catch (error) {
      console.error('Update emergency config error:', error);
      res.status(500).json({
        error: 'Failed to update emergency config',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/maintenance/emergency-test
 * Send a test emergency notification
 */
router.post(
  '/emergency-test',
  authenticate,
  Permissions.updateMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const notifications = await testEmergencyNotifications(
        req.user.accountId,
        req.user.id,
        {
          title: req.body.title,
          description: req.body.description,
          category: req.body.category,
          unitId: req.body.unitId,
          propertyId: req.body.propertyId,
          notificationChannels: req.body.notificationChannels,
        }
      );

      res.json({ notifications });
    } catch (error) {
      console.error('Emergency test error:', error);
      res.status(500).json({
        error: 'Failed to send emergency test',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/maintenance/routing-metrics
 * Get smart routing metrics
 */
router.get(
  '/routing-metrics',
  authenticate,
  Permissions.readMaintenance,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const metrics = await getRoutingMetrics(req.user.accountId);
      res.json(metrics);
    } catch (error) {
      console.error('Get routing metrics error:', error);
      res.status(500).json({
        error: 'Failed to fetch routing metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
