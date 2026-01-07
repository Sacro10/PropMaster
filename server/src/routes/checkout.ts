import { Router } from 'express';
import { stripe, getPriceIdFromPlan } from '../stripe';
import { supabaseAdmin } from '../supabase';
import { config } from '../config';
import { validate, schemas } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimiters } from '../middleware/rateLimiter';
import {
  createAuditLog,
  AuditAction,
} from '../services/auditLog';

const router = Router();

// Create Stripe Checkout Session
router.post(
  '/create-checkout-session',
  rateLimiters.checkout,
  validate({ body: schemas.createCheckoutSession }),
  asyncHandler(async (req, res) => {
    const { accountId, plan, userId } = req.body;

    const priceId = getPriceIdFromPlan(plan);
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Get account details
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('id, name, stripe_customer_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get user email
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !userData.user || !userData.user.email) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userEmail = userData.user.email;

    // Create or use existing Stripe customer
    let customerId = account.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          account_id: accountId,
          user_id: userId,
        },
      });
      customerId = customer.id;

      // Update account with customer ID
      await supabaseAdmin
        .from('accounts')
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${config.frontendUrl}/app/settings?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/app/settings?canceled=true`,
      metadata: {
        account_id: accountId,
        user_id: userId,
        plan,
      },
      subscription_data: {
        metadata: {
          account_id: accountId,
          user_id: userId,
        },
      },
    });

    // Audit log
    await createAuditLog({
      account_id: accountId,
      user_id: userId,
      action: AuditAction.WEBHOOK_RECEIVED,
      resource_type: 'checkout_session',
      resource_id: session.id,
      metadata: { plan },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({ url: session.url });
  })
);

// Create Customer Portal Session
router.post(
  '/create-portal-session',
  rateLimiters.portal,
  validate({ body: schemas.createPortalSession }),
  asyncHandler(async (req, res) => {
    const { accountId } = req.body;

    // Get account with customer ID
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('stripe_customer_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account || !account.stripe_customer_id) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: `${config.frontendUrl}/app/settings`,
    });

    // Audit log
    await createAuditLog({
      account_id: accountId,
      action: AuditAction.WEBHOOK_RECEIVED,
      resource_type: 'portal_session',
      resource_id: session.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({ url: session.url });
  })
);

export default router;
