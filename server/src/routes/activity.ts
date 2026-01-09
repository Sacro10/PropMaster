import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getActivityEvents,
  getActivityStats,
  ActivityFilters,
} from '../services/activityService';

const router = Router();

/**
 * GET /api/activity
 * Returns filtered activity events
 * Query params:
 * - eventType: Filter by event type
 * - entityType: Filter by entity type
 * - userId: Filter by user
 * - startDate: Filter by start date (ISO format)
 * - endDate: Filter by end date (ISO format)
 * - limit: Number of results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 */
router.get('/', authenticate, Permissions.readAnalytics, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const filters: ActivityFilters = {
      eventType: req.query.eventType as string,
      entityType: req.query.entityType as string,
      userId: req.query.userId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? Math.min(parseInt(req.query.limit as string), 100) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await getActivityEvents(req.user.accountId, filters);
    res.json(result);
  } catch (error) {
    console.error('Activity events error:', error);
    res.status(500).json({
      error: 'Failed to fetch activity events',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/activity/stats
 * Returns activity statistics
 * Query params:
 * - startDate: Start date for stats (ISO format)
 * - endDate: End date for stats (ISO format)
 */
router.get('/stats', authenticate, Permissions.readAnalytics, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const stats = await getActivityStats(req.user.accountId, startDate, endDate);
    res.json(stats);
  } catch (error) {
    console.error('Activity stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch activity statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
