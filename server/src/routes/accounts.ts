/**
 * Account settings routes
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin as supabase } from '../supabase';
import { stripe } from '../stripe';

const router = Router();

router.get(
  '/stripe-connect',
  authenticate,
  requireRole(['owner', 'manager', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const { data: account, error } = await supabase
        .from('accounts')
        .select('stripe_connected_account_id')
        .eq('id', req.user.accountId)
        .single();

      if (error) throw error;

      const stripeAccountId = account?.stripe_connected_account_id || null;
      let chargesEnabled: boolean | null = null;
      let payoutsEnabled: boolean | null = null;

      if (stripeAccountId) {
        try {
          const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
          chargesEnabled = stripeAccount.charges_enabled ?? null;
          payoutsEnabled = stripeAccount.payouts_enabled ?? null;
        } catch (stripeError) {
          console.warn('Stripe account lookup failed:', stripeError);
        }
      }

      res.json({
        stripeConnectedAccountId: stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
      });
    } catch (error) {
      console.error('Get Stripe connect settings error:', error);
      res.status(500).json({
        error: 'Failed to fetch Stripe connect settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.post(
  '/stripe-connect',
  authenticate,
  requireRole(['owner', 'manager', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const stripeAccountId = String(req.body?.stripeAccountId || '').trim();
      if (!stripeAccountId) {
        res.status(400).json({ error: 'stripeAccountId is required' });
        return;
      }

      if (!stripeAccountId.startsWith('acct_')) {
        res.status(400).json({ error: 'stripeAccountId must start with acct_' });
        return;
      }

      const { data: updated, error } = await supabase
        .from('accounts')
        .update({ stripe_connected_account_id: stripeAccountId })
        .eq('id', req.user.accountId)
        .select('stripe_connected_account_id')
        .single();

      if (error) throw error;

      res.json({
        stripeConnectedAccountId: updated?.stripe_connected_account_id || stripeAccountId,
      });
    } catch (error) {
      console.error('Update Stripe connect settings error:', error);
      res.status(500).json({
        error: 'Failed to update Stripe connect settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
