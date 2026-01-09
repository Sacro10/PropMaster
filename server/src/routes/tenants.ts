import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  CreateTenantData,
  UpdateTenantData,
} from '../services/tenantsService';

const router = Router();

/**
 * GET /api/tenants
 * List all tenants with optional filtering
 */
router.get('/', authenticate, Permissions.readTenants, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const filters = {
      status: req.query.status as string,
      unitId: req.query.unitId as string,
      propertyId: req.query.propertyId as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await getTenants(req.user.accountId, filters);
    res.json(result);
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({
      error: 'Failed to fetch tenants',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/tenants/:id
 * Get a single tenant by ID
 */
router.get('/:id', authenticate, Permissions.readTenants, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const tenant = await getTenantById(req.user.accountId, req.params.id);

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    res.json(tenant);
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({
      error: 'Failed to fetch tenant',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/tenants
 * Create a new tenant
 */
router.post('/', authenticate, Permissions.createTenants, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const tenantData: CreateTenantData = {
      unitId: req.body.unitId,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      leaseStart: req.body.leaseStart,
      leaseEnd: req.body.leaseEnd,
      rentAmount: req.body.rentAmount,
      depositAmount: req.body.depositAmount,
    };

    // Validate required fields
    if (
      !tenantData.unitId ||
      !tenantData.firstName ||
      !tenantData.lastName ||
      !tenantData.email ||
      !tenantData.leaseStart ||
      !tenantData.leaseEnd ||
      !tenantData.rentAmount
    ) {
      res.status(400).json({
        error: 'Missing required fields',
        required: [
          'unitId',
          'firstName',
          'lastName',
          'email',
          'leaseStart',
          'leaseEnd',
          'rentAmount',
        ],
      });
      return;
    }

    const tenant = await createTenant(req.user.accountId, tenantData);
    res.status(201).json(tenant);
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({
      error: 'Failed to create tenant',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/tenants/:id
 * Update a tenant
 */
router.patch('/:id', authenticate, Permissions.updateTenants, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const updates: UpdateTenantData = {
      phone: req.body.phone,
      status: req.body.status,
      leaseEnd: req.body.leaseEnd,
      rentAmount: req.body.rentAmount,
    };

    const tenant = await updateTenant(req.user.accountId, req.params.id, updates);
    res.json(tenant);
  } catch (error) {
    console.error('Update tenant error:', error);
    const statusCode = error instanceof Error && error.message === 'Tenant not found' ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to update tenant',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
