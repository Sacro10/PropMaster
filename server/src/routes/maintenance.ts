import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { requireFeatureAccess } from '../middleware/planAccess';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin as supabase } from '../supabase';
import { stripe } from '../stripe';
import { config } from '../config';
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
  updateMaintenanceAssignmentPhotosAndNotify,
  completeMaintenanceAssignmentAndCreatePaymentLink,
  createEmergencyRequest,
  getEmergencySupportConfig,
  upsertEmergencySupportConfig,
  testEmergencyNotifications,
  getRoutingMetrics,
  CreateMaintenanceData,
  UpdateMaintenanceData,
} from '../services/maintenanceService';

const router = Router();
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'maintenance-attachments';
let bucketEnsured = false;

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName || 'upload');
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isMissingColumnError(error: any, column: string) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  const columnName = column.toLowerCase();

  return (
    message.includes(`column "${columnName}"`) ||
    message.includes(`column '${columnName}'`) ||
    message.includes('does not exist') ||
    code === '42703' ||
    code === 'PGRST204'
  );
}

async function getVendorProfileForUser(accountId: string, userId: string) {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return null;
  }

  const activeRows = rows.filter((row: any) => row?.is_active !== false);
  const candidates = activeRows.length > 0 ? activeRows : rows;
  const sorted = [...candidates].sort((a: any, b: any) => {
    const dateA = new Date(a?.created_at || 0).getTime();
    const dateB = new Date(b?.created_at || 0).getTime();
    return dateB - dateA;
  });

  return sorted[0];
}

async function findVendorStripeAccountIdByMetadata(params: {
  accountId: string;
  vendorProfileId: string;
  userId: string;
}): Promise<string | null> {
  try {
    let startingAfter: string | undefined = undefined;
    for (let page = 0; page < 10; page += 1) {
      const accountPage: Awaited<ReturnType<typeof stripe.accounts.list>> = await stripe.accounts.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      const match = (accountPage.data || []).find((account: any) => {
        const metadata = account?.metadata || {};
        const profileMatch = String(metadata.vendor_profile_id || '') === params.vendorProfileId;
        const userMatch = String(metadata.user_id || '') === params.userId;
        const accountMatch = !metadata.account_id || String(metadata.account_id) === params.accountId;
        return (profileMatch || userMatch) && accountMatch;
      });

      if (match?.id) {
        return match.id;
      }

      if (!accountPage.has_more || accountPage.data.length === 0) {
        break;
      }
      startingAfter = accountPage.data[accountPage.data.length - 1]?.id;
    }
  } catch (error) {
    console.warn('[Maintenance] Failed to resolve vendor Stripe account by metadata:', error);
  }

  return null;
}

async function ensureStorageBucket() {
  if (bucketEnsured) {
    return;
  }

  const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(STORAGE_BUCKET);
  if (bucket && !getBucketError) {
    bucketEnsured = true;
    return;
  }

  const missingBucket =
    String(getBucketError?.message || '').toLowerCase().includes('not found') ||
    String(getBucketError?.message || '').toLowerCase().includes('does not exist');

  if (!missingBucket && getBucketError) {
    throw getBucketError;
  }

  const { error: createBucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
  });

  if (createBucketError) {
    const alreadyExists = String(createBucketError.message || '')
      .toLowerCase()
      .includes('already exists');
    if (!alreadyExists) {
      throw createBucketError;
    }
  }

  bucketEnsured = true;
}

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
        images: Array.isArray(req.body.images) ? req.body.images : undefined,
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
 * POST /api/maintenance/uploads/sign
 * Create signed upload URL for maintenance attachments
 */
router.post('/uploads/sign', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const fileName = String(req.body?.fileName || '').trim();
    const contentType = String(req.body?.contentType || '').trim();

    if (!fileName) {
      res.status(400).json({ error: 'fileName is required' });
      return;
    }

    if (!contentType || !contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image uploads are supported' });
      return;
    }

    const safeName = sanitizeFileName(fileName);
    const extension = path.extname(safeName) || '.jpg';
    const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${extension}`;
    const objectPath = `maintenance/${req.user.accountId}/${req.user.id}/${uniqueName}`;

    await ensureStorageBucket();

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(objectPath);

    if (error || !data?.token) {
      res.status(500).json({
        error: 'Failed to create signed upload URL',
        details: error?.message,
      });
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    res.json({
      bucket: STORAGE_BUCKET,
      path: objectPath,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
    });
  } catch (error) {
    console.error('Create maintenance upload URL error:', error);
    res.status(500).json({
      error: 'Failed to create upload URL',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/maintenance/assignments/:assignmentId/photos
 * Update assignment photos and notify tenant + assigning owner/manager
 */
router.post('/assignments/:assignmentId/photos', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id || !req.user?.role) {
      res.status(400).json({ error: 'Account ID, user ID, and role required' });
      return;
    }

    const assignmentId = req.params.assignmentId;
    const requestId = String(req.body?.requestId || '').trim();
    const beforeImages = req.body?.beforeImages;
    const afterImages = req.body?.afterImages;

    if (!requestId) {
      res.status(400).json({ error: 'requestId is required' });
      return;
    }

    if (
      typeof beforeImages !== 'undefined' &&
      (!Array.isArray(beforeImages) || beforeImages.some((value) => typeof value !== 'string'))
    ) {
      res.status(400).json({ error: 'beforeImages must be an array of strings' });
      return;
    }

    if (
      typeof afterImages !== 'undefined' &&
      (!Array.isArray(afterImages) || afterImages.some((value) => typeof value !== 'string'))
    ) {
      res.status(400).json({ error: 'afterImages must be an array of strings' });
      return;
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('maintenance_assignments')
      .select('request_id, vendor_profile_id')
      .eq('id', assignmentId)
      .eq('account_id', req.user.accountId)
      .single();

    if (assignmentError || !assignment) {
      res.status(404).json({ error: 'Maintenance assignment not found' });
      return;
    }

    if (assignment.request_id !== requestId) {
      res.status(400).json({ error: 'requestId does not match assignment' });
      return;
    }

    const privilegedRoles = new Set(['owner', 'manager', 'admin']);
    if (!privilegedRoles.has(req.user.role)) {
      if (req.user.role !== 'vendor') {
        res.status(403).json({ error: 'Insufficient permissions to update assignment photos' });
        return;
      }

      if (!assignment.vendor_profile_id) {
        res.status(403).json({ error: 'No vendor is assigned to this maintenance request' });
        return;
      }

      const { data: vendorProfile, error: vendorError } = await supabase
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', assignment.vendor_profile_id)
        .eq('account_id', req.user.accountId)
        .maybeSingle();

      if (vendorError || !vendorProfile || vendorProfile.user_id !== req.user.id) {
        res.status(403).json({ error: 'You are not assigned to this maintenance request' });
        return;
      }
    }

    const result = await updateMaintenanceAssignmentPhotosAndNotify(
      req.user.accountId,
      req.user.id,
      {
        assignmentId,
        requestId,
        beforeImages: Array.isArray(beforeImages) ? beforeImages : undefined,
        afterImages: Array.isArray(afterImages) ? afterImages : undefined,
      }
    );

    res.json({
      success: true,
      beforeImages: result.beforeImages,
      afterImages: result.afterImages,
      notifiedRecipients: result.notifiedRecipients,
    });
  } catch (error) {
    console.error('Update assignment photos error:', error);
    res.status(500).json({
      error: 'Failed to update assignment photos',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/maintenance/assignments/:assignmentId/complete
 * Vendor marks a job complete and generates a Stripe payment link for owner approval.
 */
router.post('/assignments/:assignmentId/complete', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id || !req.user?.role) {
      res.status(400).json({ error: 'Account ID, user ID, and role required' });
      return;
    }

    if (req.user.role !== 'vendor') {
      res.status(403).json({ error: 'Only vendors can complete assigned jobs' });
      return;
    }

    const assignmentId = String(req.params.assignmentId || '').trim();
    const requestId = String(req.body?.requestId || '').trim();
    const actualCost = Number(req.body?.actualCost);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;

    if (!assignmentId || !requestId) {
      res.status(400).json({ error: 'assignmentId and requestId are required' });
      return;
    }

    if (!Number.isFinite(actualCost) || actualCost <= 0) {
      res.status(400).json({ error: 'actualCost must be greater than 0' });
      return;
    }

    const result = await completeMaintenanceAssignmentAndCreatePaymentLink(
      req.user.accountId,
      req.user.id,
      {
        assignmentId,
        requestId,
        actualCost,
        notes,
      },
    );

    res.json({
      success: true,
      checkoutSessionId: result.checkoutSessionId,
      paymentUrl: result.paymentUrl,
      notifiedRecipients: result.notifiedRecipients,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    let statusCode = 500;

    if (
      details.includes('Vendor Stripe account is not connected') ||
      details.includes('Vendor Stripe account ID is invalid') ||
      details.includes('Vendor Stripe account is not fully enabled') ||
      details.includes('Unable to verify vendor Stripe account') ||
      details.includes('actualCost must be greater than 0') ||
      details.includes('actualCost must be a number greater than 0') ||
      details.includes('Invalid maintenance completion cost')
    ) {
      statusCode = 400;
    } else if (
      details.includes('Only vendors can complete assigned jobs') ||
      details.includes('You are not assigned to this maintenance request')
    ) {
      statusCode = 403;
    } else if (
      details.includes('Maintenance assignment not found') ||
      details.includes('Maintenance request not found') ||
      details.includes('Assigned vendor profile was not found')
    ) {
      statusCode = 404;
    }

    console.error('Complete maintenance assignment error:', error);
    res.status(statusCode).json({
      error: 'Failed to complete maintenance assignment',
      details,
    });
  }
});

/**
 * POST /api/maintenance/vendor/stripe-connect/onboarding-link
 * Create a Stripe Connect onboarding/update link for the authenticated vendor.
 */
router.post('/vendor/stripe-connect/onboarding-link', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id || !req.user?.role) {
      res.status(400).json({ error: 'Account ID, user ID, and role required' });
      return;
    }

    if (req.user.role !== 'vendor') {
      res.status(403).json({ error: 'Only vendors can manage vendor Stripe onboarding' });
      return;
    }

    const vendorProfile = await getVendorProfileForUser(req.user.accountId, req.user.id);
    if (!vendorProfile?.id) {
      res.status(404).json({ error: 'Vendor profile not found' });
      return;
    }

    let stripeAccountId = String(vendorProfile.stripe_connected_account_id || '').trim();
    let stripeAccount: any = null;

    if (stripeAccountId) {
      try {
        stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
      } catch (error) {
        console.warn('[Maintenance] Existing vendor Stripe account lookup failed, creating a new one:', error);
        stripeAccount = null;
      }
    }

    if (!stripeAccountId || !stripeAccount) {
      const discoveredAccountId = await findVendorStripeAccountIdByMetadata({
        accountId: req.user.accountId,
        vendorProfileId: vendorProfile.id,
        userId: req.user.id,
      });
      if (discoveredAccountId) {
        stripeAccountId = discoveredAccountId;
        try {
          stripeAccount = await stripe.accounts.retrieve(discoveredAccountId);
        } catch (error) {
          console.warn('[Maintenance] Metadata-linked Stripe account lookup failed:', error);
          stripeAccount = null;
        }
      }
    }

    if (!stripeAccount || !stripeAccountId || stripeAccountId !== stripeAccount.id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(req.user.id);
      const fallbackEmail = authUser?.user?.email || undefined;
      const vendorEmail = String(vendorProfile.email || fallbackEmail || '').trim() || undefined;
      const businessName = String(vendorProfile.business_name || vendorProfile.company_name || '').trim() || undefined;

      stripeAccount = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: vendorEmail,
        business_profile: businessName
          ? {
              name: businessName,
            }
          : undefined,
        metadata: {
          account_id: req.user.accountId,
          vendor_profile_id: vendorProfile.id,
          user_id: req.user.id,
        },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });

      stripeAccountId = stripeAccount.id;

      const { error: updateError } = await supabase
        .from('vendor_profiles')
        .update({ stripe_connected_account_id: stripeAccountId })
        .eq('id', vendorProfile.id)
        .eq('account_id', req.user.accountId)
        .eq('user_id', req.user.id);

      if (updateError) {
        if (isMissingColumnError(updateError, 'stripe_connected_account_id')) {
          console.warn('[Maintenance] stripe_connected_account_id column missing; using Stripe metadata fallback.');
        } else {
          throw updateError;
        }
      }
    }

    const shouldUseAccountUpdate = Boolean(
      stripeAccount?.details_submitted || stripeAccount?.charges_enabled || stripeAccount?.payouts_enabled
    );

    const refreshUrl = `${config.frontendUrl}/vendor/dashboard?stripe=refresh`;
    const returnUrl = `${config.frontendUrl}/vendor/dashboard?stripe=return`;

    let accountLink;
    const preferredType = shouldUseAccountUpdate ? 'account_update' : 'account_onboarding';

    try {
      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: preferredType as 'account_onboarding' | 'account_update',
      });
    } catch (error) {
      if (preferredType !== 'account_update') {
        throw error;
      }

      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
    }

    res.json({
      url: accountLink.url,
      stripeConnectedAccountId: stripeAccountId,
      mode: preferredType === 'account_update' ? 'update' : 'onboarding',
    });
  } catch (error) {
    console.error('Create vendor Stripe onboarding link error:', error);
    res.status(500).json({
      error: 'Failed to create vendor Stripe onboarding link',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
  requireFeatureAccess('maintenance_routing'),
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
  requireFeatureAccess('maintenance_routing'),
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
  requireFeatureAccess('emergency_support_24_7'),
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
      let message: string | undefined;
      if (error instanceof Error && error.message) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: string }).message === 'string') {
        message = (error as { message?: string }).message;
      } else {
        try {
          message = JSON.stringify(error);
        } catch {
          message = undefined;
        }
      }
      const details = message || 'Unknown error';

      if (details === 'Unit not found') {
        res.status(404).json({ error: 'Unit not found', details });
        return;
      }
      if (details === 'Unit does not belong to your account') {
        res.status(403).json({ error: 'Unit does not belong to your account', details });
        return;
      }

      res.status(500).json({
        error: 'Failed to create emergency request',
        details,
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
  requireFeatureAccess('emergency_support_24_7'),
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
  requireFeatureAccess('emergency_support_24_7'),
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
  requireFeatureAccess('emergency_support_24_7'),
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
  requireFeatureAccess('maintenance_routing'),
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
