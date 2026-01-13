import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getShowings,
  createShowing,
  updateShowingStatus,
  recordShowingOutcome,
  getShowingStatistics,
  regenerateAccessCode,
  sendShowingReminder,
  markShowingReminderSent,
  getAvailableUnits,
  CreateShowingData,
} from '../services/showingsService';

const router = Router();

/**
 * GET /api/showings
 * List all showings
 */
router.get('/', authenticate, Permissions.readShowings, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const filters = {
      status: req.query.status as string,
      unitId: req.query.unitId as string,
      propertyId: req.query.propertyId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await getShowings(req.user.accountId, filters);
    res.json(result);
  } catch (error) {
    console.error('Get showings error:', error);
    res.status(500).json({
      error: 'Failed to fetch showings',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/showings
 * Create a new showing
 */
router.post('/', authenticate, Permissions.createShowings, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const data: CreateShowingData = {
      unitId: req.body.unitId,
      showingDate: req.body.showingDate,
      duration: req.body.duration,
      showingType: req.body.showingType || 'agent_assisted',
      visitorName: req.body.visitorName,
      visitorEmail: req.body.visitorEmail,
      visitorPhone: req.body.visitorPhone,
      agentName: req.body.agentName,
      notes: req.body.notes,
    };

    if (
      !data.unitId ||
      !data.showingDate ||
      !data.visitorName ||
      !data.visitorEmail
    ) {
      res.status(400).json({
        error: 'Missing required fields',
        required: [
          'unitId',
          'showingDate',
          'visitorName',
          'visitorEmail',
        ],
      });
      return;
    }

    const showing = await createShowing(req.user.accountId, req.user.id, data);
    res.status(201).json(showing);
  } catch (error) {
    console.error('Create showing error:', error);
    res.status(500).json({
      error: 'Failed to create showing',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/showings/:id/status
 * Update showing status
 */
router.patch(
  '/:id/status',
  authenticate,
  Permissions.updateShowings,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const status = req.body.status as string;

      if (!status) {
        res.status(400).json({ error: 'Status is required' });
        return;
      }

      await updateShowingStatus(req.user.accountId, req.user.id, req.params.id, status);
      res.json({ success: true });
    } catch (error) {
      console.error('Update showing status error:', error);
      res.status(500).json({
        error: 'Failed to update showing status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/showings/:id/outcome
 * Record showing outcome
 */
router.post(
  '/:id/outcome',
  authenticate,
  Permissions.updateShowings,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const outcome = {
        outcome: req.body.outcome,
        feedbackRating: req.body.feedbackRating,
        feedbackText: req.body.feedbackText,
        nextSteps: req.body.nextSteps,
        followUpDate: req.body.followUpDate,
      };

      if (!outcome.outcome) {
        res.status(400).json({ error: 'Outcome is required' });
        return;
      }

      const result = await recordShowingOutcome(
        req.user.accountId,
        req.user.id,
        req.params.id,
        outcome
      );
      res.status(201).json(result);
    } catch (error) {
      console.error('Record showing outcome error:', error);
      res.status(500).json({
        error: 'Failed to record showing outcome',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/showings/stats
 * Get showing statistics for dashboard KPIs
 */
router.get('/stats', authenticate, Permissions.readShowings, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const stats = await getShowingStatistics(req.user.accountId);
    res.json(stats);
  } catch (error) {
    console.error('Get showing stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch showing statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/showings/available-units
 * Get available units for scheduling showings
 */
router.get('/available-units', authenticate, Permissions.readShowings, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const units = await getAvailableUnits(req.user.accountId);
    res.json(units);
  } catch (error) {
    console.error('Get available units error:', error);
    res.status(500).json({
      error: 'Failed to fetch available units',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/showings/:id/regenerate-code
 * Regenerate access code for a showing
 */
router.post(
  '/:id/regenerate-code',
  authenticate,
  Permissions.updateShowings,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const result = await regenerateAccessCode(
        req.user.accountId,
        req.user.id,
        req.params.id
      );
      res.json(result);
    } catch (error) {
      console.error('Regenerate access code error:', error);
      res.status(500).json({
        error: 'Failed to regenerate access code',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/showings/:id/send-reminder
 * Send reminder for a showing
 */
router.post(
  '/:id/send-reminder',
  authenticate,
  Permissions.updateShowings,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await sendShowingReminder(req.user.accountId, req.user.id, req.params.id);
      res.json({ success: true, message: 'Reminder sent successfully' });
    } catch (error) {
      console.error('Send reminder error:', error);
      if (error instanceof Error && error.message === 'GMAIL_NOT_CONNECTED') {
        res.status(400).json({
          error: 'Gmail not connected',
          code: 'GMAIL_NOT_CONNECTED',
        });
        return;
      }
      res.status(500).json({
        error: 'Failed to send reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/showings/:id/reminder-sent
 * Mark reminder as sent (client-composed email)
 */
router.post(
  '/:id/reminder-sent',
  authenticate,
  Permissions.updateShowings,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await markShowingReminderSent(req.user.accountId, req.user.id, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Mark reminder sent error:', error);
      res.status(500).json({
        error: 'Failed to mark reminder as sent',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
