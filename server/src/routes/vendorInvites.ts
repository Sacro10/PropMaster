import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { supabaseAdmin as supabase } from '../supabase';
import { config } from '../config';
import { sendResendEmail } from '../services/emailService';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

async function sendVendorInviteEmail(payload: {
  toEmail: string;
  inviteLink: string;
}): Promise<void> {
  const lines = [
    'Hello,',
    '',
    'You have been invited to join the vendor portal.',
    '',
    'Complete your onboarding here:',
    payload.inviteLink,
    '',
    'If you did not expect this invite, you can ignore this message.',
  ];

  await sendResendEmail({
    to: payload.toEmail,
    subject: 'Vendor Portal Invite',
    text: lines.join('\n'),
  });
}

router.post('/', authenticate, Permissions.updateMaintenance, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { email, expiresAt } = req.body || {};

    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const inviteToken = crypto.randomBytes(16).toString('hex');
    const expiresAtValue = expiresAt || new Date(Date.now() + 14 * DAY_MS).toISOString();

    const { data: invite, error: inviteError } = await supabase
      .from('vendor_invites')
      .insert({
        account_id: req.user.accountId,
        email: String(email).toLowerCase(),
        invite_token: inviteToken,
        created_by: req.user.id,
        expires_at: expiresAtValue,
      })
      .select()
      .single();

    if (inviteError) {
      res.status(500).json({ error: 'Failed to create invite', details: inviteError.message });
      return;
    }

    const inviteLink = `${config.frontendUrl}/vendor/invite?token=${inviteToken}`;
    let emailSent = false;
    let emailError: string | undefined;

    try {
      await sendVendorInviteEmail({
        toEmail: String(email).toLowerCase(),
        inviteLink,
      });
      emailSent = true;
    } catch (sendError: any) {
      emailError = sendError?.message || 'Failed to send invite email';
      console.warn('[VendorInvites] Email send failed:', sendError);
    }

    res.status(201).json({
      invite,
      inviteLink,
      emailSent,
      emailError,
    });
  } catch (error) {
    console.error('Create vendor invite error:', error);
    res.status(500).json({ error: 'Failed to create vendor invite' });
  }
});

router.get('/:token', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ error: 'Invite token required' });
      return;
    }

    const { data: invite, error } = await supabase
      .from('vendor_invites')
      .select('id, email, status, expires_at')
      .eq('invite_token', token)
      .single();

    if (error || !invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    if (invite.status !== 'pending') {
      res.status(410).json({ error: `Invite ${invite.status}` });
      return;
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      res.status(410).json({ error: 'Invite expired' });
      return;
    }

    res.json({
      email: invite.email,
    });
  } catch (error) {
    console.error('Get vendor invite error:', error);
    res.status(500).json({ error: 'Failed to fetch invite' });
  }
});

router.post('/:token/accept', async (req, res) => {
  try {
    const token = req.params.token;
    const { password, fullName } = req.body || {};

    if (!token || !password) {
      res.status(400).json({ error: 'Token and password are required' });
      return;
    }

    const { data: invite, error: inviteError } = await supabase
      .from('vendor_invites')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (inviteError || !invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    if (invite.status !== 'pending') {
      res.status(409).json({ error: `Invite already ${invite.status}` });
      return;
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      res.status(410).json({ error: 'Invite expired' });
      return;
    }

    const email = String(invite.email || '').toLowerCase();
    let vendorUserId: string | null = null;

    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      res.status(500).json({ error: 'Failed to verify vendor account' });
      return;
    }

    const existingUser = listData?.users?.find((user) => user.email?.toLowerCase() === email);

    if (existingUser) {
      vendorUserId = existingUser.id;
      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || existingUser.user_metadata?.full_name,
          role: 'vendor',
        },
      });

      if (updateError) {
        res.status(500).json({ error: 'Failed to update vendor password', details: updateError.message });
        return;
      }
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email,
          role: 'vendor',
        },
      });

      if (createError || !created?.user) {
        res.status(500).json({ error: 'Failed to create vendor account', details: createError?.message });
        return;
      }

      vendorUserId = created.user.id;
    }

    if (!vendorUserId) {
      res.status(500).json({ error: 'Unable to resolve vendor user' });
      return;
    }

    await supabase
      .from('account_members')
      .upsert(
        {
          account_id: invite.account_id,
          user_id: vendorUserId,
          role: 'vendor',
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,user_id' }
      );

    const { data: existingProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('account_id', invite.account_id)
      .eq('user_id', vendorUserId)
      .maybeSingle();

    if (!existingProfile) {
      const businessName = (fullName && String(fullName).trim()) || email || 'Vendor';
      await supabase
        .from('vendor_profiles')
        .insert({
          account_id: invite.account_id,
          user_id: vendorUserId,
          business_name: businessName,
          contact_name: fullName || null,
          email,
          is_active: true,
        });
    }

    await supabase
      .from('vendor_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    res.json({ success: true, email, accountId: invite.account_id });
  } catch (error) {
    console.error('Accept vendor invite error:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;
