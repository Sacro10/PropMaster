/**
 * Disbursements API Routes
 * Handles owner disbursement processing
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getOwnerEntities,
  getPendingDisbursements,
  calculateDisbursement,
  createDisbursement,
  processDisbursement,
} from '../services/disbursementService';

const router = Router();

/**
 * GET /api/disbursements/owners
 * Get owner entities
 */
router.get('/owners', authenticate, Permissions.readDisbursements, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const owners = await getOwnerEntities(req.user.accountId);
    res.json(owners);
  } catch (error) {
    console.error('Get owner entities error:', error);
    res.status(500).json({
      error: 'Failed to fetch owner entities',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/disbursements/pending
 * Get pending disbursements
 */
router.get('/pending', authenticate, Permissions.readDisbursements, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const disbursements = await getPendingDisbursements(req.user.accountId);
    res.json({ data: disbursements, total: disbursements.length });
  } catch (error) {
    console.error('Get pending disbursements error:', error);
    res.status(500).json({
      error: 'Failed to fetch pending disbursements',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/disbursements/calculate
 * Calculate disbursement for period
 */
router.post('/calculate', authenticate, Permissions.readDisbursements, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { ownerId, periodStart, periodEnd } = req.body;

    if (!ownerId || !periodStart || !periodEnd) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['ownerId', 'periodStart', 'periodEnd'],
      });
      return;
    }

    const calculation = await calculateDisbursement(
      req.user.accountId,
      ownerId,
      periodStart,
      periodEnd
    );

    res.json(calculation);
  } catch (error) {
    console.error('Calculate disbursement error:', error);
    res.status(500).json({
      error: 'Failed to calculate disbursement',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/disbursements
 * Create a disbursement
 */
router.post('/', authenticate, Permissions.createDisbursements, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const data = {
      ownerId: req.body.ownerId,
      propertyId: req.body.propertyId,
      periodStart: req.body.periodStart,
      periodEnd: req.body.periodEnd,
      paymentMethod: req.body.paymentMethod,
    };

    if (!data.ownerId || !data.periodStart || !data.periodEnd) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['ownerId', 'periodStart', 'periodEnd'],
      });
      return;
    }

    const disbursement = await createDisbursement(req.user.accountId, req.user.id, data);
    res.status(201).json(disbursement);
  } catch (error) {
    console.error('Create disbursement error:', error);
    res.status(500).json({
      error: 'Failed to create disbursement',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/disbursements/:id/process
 * Process a disbursement
 */
router.post(
  '/:id/process',
  authenticate,
  Permissions.updateDisbursements,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const idempotencyKey = req.body.idempotencyKey || req.headers['idempotency-key'] as string;

      const disbursement = await processDisbursement(
        req.user.accountId,
        req.user.id,
        req.params.id,
        idempotencyKey
      );

      res.json(disbursement);
    } catch (error) {
      console.error('Process disbursement error:', error);
      res.status(500).json({
        error: 'Failed to process disbursement',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
