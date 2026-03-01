/**
 * Payments API Routes
 * Handles rent collection, payment tracking, and reminders
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { requirePlanAccess } from '../middleware/planAccess';
import {
  getRecentPayments,
  getOverduePayments,
  getCollectionStatistics,
  sendPaymentReminder,
  recordPayment,
} from '../services/paymentService';

const router = Router();

router.use(authenticate, requirePlanAccess('pro'));

/**
 * GET /api/payments/recent
 * Get recent payments
 */
router.get('/recent', Permissions.readPayments, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const payments = await getRecentPayments(req.user.accountId, limit);

    res.json({ data: payments, total: payments.length });
  } catch (error) {
    console.error('Get recent payments error:', error);
    res.status(500).json({
      error: 'Failed to fetch recent payments',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/payments/overdue
 * Get overdue/pending payments
 */
router.get('/overdue', Permissions.readPayments, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const payments = await getOverduePayments(req.user.accountId);
    res.json(payments);
  } catch (error) {
    console.error('Get overdue payments error:', error);
    res.status(500).json({
      error: 'Failed to fetch overdue payments',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/payments/stats
 * Get collection statistics
 */
router.get('/stats', Permissions.readPayments, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const forceLive = String(req.query.live || '').toLowerCase() === 'true';
    const stats = await getCollectionStatistics(req.user.accountId, { forceLive });
    res.json(stats);
  } catch (error) {
    console.error('Get collection stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch collection statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/payments/:id/send-reminder
 * Send payment reminder
 */
router.post(
  '/:id/send-reminder',
  Permissions.updatePayments,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await sendPaymentReminder(req.user.accountId, req.user.id, req.params.id);
      res.json({ success: true, message: 'Reminder sent successfully' });
    } catch (error) {
      console.error('Send payment reminder error:', error);
      res.status(500).json({
        error: 'Failed to send payment reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/payments
 * Record a payment
 */
router.post('/', Permissions.createPayments, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const data = {
      leaseId: req.body.leaseId,
      tenantUserId: req.body.tenantUserId,
      unitId: req.body.unitId,
      amount: req.body.amount,
      paymentType: req.body.paymentType || 'rent',
      dueDate: req.body.dueDate,
      paidAt: req.body.paidAt,
      paymentMethod: req.body.paymentMethod,
      checkNumber: req.body.checkNumber,
      notes: req.body.notes,
    };

    if (!data.leaseId || !data.tenantUserId || !data.amount || !data.dueDate) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['leaseId', 'tenantUserId', 'amount', 'dueDate'],
      });
      return;
    }

    const payment = await recordPayment(req.user.accountId, req.user.id, data);
    res.status(201).json(payment);
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({
      error: 'Failed to record payment',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
