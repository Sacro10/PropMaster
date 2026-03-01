/**
 * Account settings routes
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin as supabase } from '../supabase';
import { stripe } from '../stripe';

const router = Router();

async function resolveAccountId(req: AuthRequest): Promise<string | null> {
  const directAccountId = req.user?.accountId?.trim();
  if (directAccountId) {
    return directAccountId;
  }

  const userId = req.user?.id;
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('account_members')
    .select('account_id, joined_at, created_at, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('account_id', 'is', null);

  if (error) {
    console.warn('Resolve account ID failed:', error);
    return null;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort((a: any, b: any) => {
    const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
    const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return sorted[0]?.account_id || null;
}

router.get(
  '/stripe-connect',
  authenticate,
  requireRole(['owner', 'manager', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      const accountId = await resolveAccountId(req);
      if (!accountId) {
        res.json({
          stripeConnectedAccountId: null,
          chargesEnabled: null,
          payoutsEnabled: null,
        });
        return;
      }

      const { data: account, error } = await supabase
        .from('accounts')
        .select('stripe_connected_account_id')
        .eq('id', accountId)
        .maybeSingle();

      if (error) {
        throw error;
      }

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
      const accountId = await resolveAccountId(req);
      if (!accountId) {
        res.status(400).json({ error: 'User account not found' });
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
        .eq('id', accountId)
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
