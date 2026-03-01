import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { requireFeatureAccess } from '../middleware/planAccess';
import {
  getApplications,
  getApplicationById,
  createApplication,
  approveApplication,
  rejectApplication,
  runScreening,
  CreateApplicationData,
} from '../services/applicationsService';
import { supabaseAdmin as supabase } from '../supabase';

const router = Router();

/**
 * GET /api/applications
 * List all rental applications with optional filtering
 */
router.get(
  '/',
  authenticate,
  Permissions.readApplications,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const filters = {
        status: req.query.status as string,
        unitId: req.query.unitId as string,
        propertyId: req.query.propertyId as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await getApplications(req.user.accountId, filters);
      res.json(result);
    } catch (error) {
      console.error('Get applications error:', error);
      res.status(500).json({
        error: 'Failed to fetch applications',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/applications/:id
 * Get a single application by ID
 */
router.get(
  '/:id',
  authenticate,
  Permissions.readApplications,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const application = await getApplicationById(req.user.accountId, req.params.id);

      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      res.json(application);
    } catch (error) {
      console.error('Get application error:', error);
      res.status(500).json({
        error: 'Failed to fetch application',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/applications
 * Create a new rental application
 */
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const applicationData: CreateApplicationData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      unitId: req.body.unitId,
      moveInDate: req.body.moveInDate,
      monthlyIncome: req.body.monthlyIncome,
      currentEmployer: req.body.currentEmployer,
      currentAddress: req.body.currentAddress,
      creditScore: req.body.creditScore ?? null,
      backgroundCheckStatus: req.body.backgroundCheckStatus,
      incomeVerificationStatus: req.body.incomeVerificationStatus,
      evictionHistory: req.body.evictionHistory ?? null,
      criminalHistory: req.body.criminalHistory ?? null,
      applicantUserId: req.user?.role === 'tenant' ? req.user.id : null,
    };

    // Validate required fields
    if (
      !applicationData.firstName ||
      !applicationData.lastName ||
      !applicationData.email ||
      !applicationData.phone ||
      !applicationData.unitId ||
      !applicationData.moveInDate ||
      !applicationData.monthlyIncome
    ) {
      res.status(400).json({
        error: 'Missing required fields',
        required: [
          'firstName',
          'lastName',
          'email',
          'phone',
          'unitId',
          'moveInDate',
          'monthlyIncome',
        ],
      });
      return;
    }

    const application = await createApplication(req.user.accountId, applicationData);

    if (req.user.role === 'tenant') {
      const { error: deactivateError } = await supabase
        .from('account_members')
        .update({ is_active: false })
        .eq('account_id', req.user.accountId)
        .eq('user_id', req.user.id);

      if (deactivateError) {
        console.error('Failed to deactivate tenant after application:', deactivateError);
      }

      const { error: metadataError } = await supabase.auth.admin.updateUserById(req.user.id, {
        user_metadata: {
          role: req.user.role,
          membership_status: 'pending',
        },
      });

      if (metadataError) {
        console.error('Failed to update tenant metadata after application:', metadataError);
      }
    }

    res.status(201).json(application);
  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({
      error: 'Failed to create application',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/applications/:id/approve
 * Approve an application
 */
router.post(
  '/:id/approve',
  authenticate,
  Permissions.updateApplications,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const application = await approveApplication(
        req.user.accountId,
        req.user.id,
        req.params.id
      );
      res.json(application);
    } catch (error) {
      console.error('Approve application error:', error);
      const details =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : (error as { message?: string } | null)?.message || 'Unknown error';
      res.status(500).json({
        error: 'Failed to approve application',
        details,
      });
    }
  }
);

/**
 * POST /api/applications/:id/reject
 * Reject an application
 */
router.post(
  '/:id/reject',
  authenticate,
  Permissions.updateApplications,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const reason = req.body.reason as string | undefined;
      const application = await rejectApplication(
        req.user.accountId,
        req.user.id,
        req.params.id,
        reason
      );
      res.json(application);
    } catch (error) {
      console.error('Reject application error:', error);
      res.status(500).json({
        error: 'Failed to reject application',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/applications/:id/screen
 * Run screening for an application
 */
router.post(
  '/:id/screen',
  authenticate,
  requireFeatureAccess('ai_risk_scoring'),
  Permissions.updateApplications,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const screeningResult = await runScreening(
        req.user.accountId,
        req.user.id,
        req.params.id
      );
      res.json(screeningResult);
    } catch (error) {
      console.error('Run screening error:', error);
      res.status(500).json({
        error: 'Failed to run screening',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
