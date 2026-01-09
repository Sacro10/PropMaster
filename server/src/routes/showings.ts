import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getShowings,
  createShowing,
  updateShowingStatus,
  recordShowingOutcome,
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
      scheduledDate: req.body.scheduledDate,
      duration: req.body.duration,
      agentName: req.body.agentName,
      prospectName: req.body.prospectName,
      prospectEmail: req.body.prospectEmail,
      prospectPhone: req.body.prospectPhone,
      notes: req.body.notes,
    };

    if (
      !data.unitId ||
      !data.scheduledDate ||
      !data.duration ||
      !data.prospectName ||
      !data.prospectEmail ||
      !data.prospectPhone
    ) {
      res.status(400).json({
        error: 'Missing required fields',
        required: [
          'unitId',
          'scheduledDate',
          'duration',
          'prospectName',
          'prospectEmail',
          'prospectPhone',
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

export default router;
