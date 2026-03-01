import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { supabaseAdmin as supabase } from '../supabase';
import { config } from '../config';
import { sendResendEmail } from '../services/emailService';
import { buildTenantActionUrl, createNotifications, getAccountUsersByRoles } from '../services/notificationService';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBackgroundStatus(value: unknown): 'pending' | 'approved' | 'rejected' | 'not_required' {
  const status = String(value || '').toLowerCase();
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'not_required') return 'not_required';
  return 'pending';
}

function calculateTenantRiskScore(payload: {
  creditScore: number;
  monthlyIncome: number;
  employmentStatus: string;
  backgroundCheckStatus: 'pending' | 'approved' | 'rejected' | 'not_required';
  rent?: number | null;
}): number {
  const parts: Array<{ score: number; weight: number }> = [];

  const normalizedCredit = clamp(((payload.creditScore - 300) / 550) * 100, 0, 100);
  parts.push({ score: Math.round(normalizedCredit), weight: 0.4 });

  const rent = Number(payload.rent || 0);
  if (payload.monthlyIncome > 0 && rent > 0) {
    const ratio = payload.monthlyIncome / rent;
    const ratioScore =
      ratio >= 3 ? 100 :
      ratio >= 2.5 ? 90 :
      ratio >= 2 ? 80 :
      ratio >= 1.5 ? 60 :
      ratio >= 1.2 ? 50 :
      ratio >= 1 ? 40 :
      20;
    parts.push({ score: ratioScore, weight: 0.3 });
  }

  const backgroundScore =
    payload.backgroundCheckStatus === 'approved' ? 90 :
    payload.backgroundCheckStatus === 'pending' ? 60 :
    payload.backgroundCheckStatus === 'rejected' ? 20 :
    70;
  parts.push({ score: backgroundScore, weight: 0.2 });

  const employment = String(payload.employmentStatus || '').toLowerCase();
  const employmentScore =
    employment.includes('employed') || employment.includes('self') ? 80 :
    employment.includes('unemployed') ? 30 :
    employment.includes('student') || employment.includes('retired') ? 50 :
    60;
  parts.push({ score: employmentScore, weight: 0.1 });

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const weightedScore = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return clamp(Math.round(weightedScore), 0, 100);
}

async function sendTenantInviteEmail(payload: {
  toEmail: string;
  inviteLink: string;
  propertyName?: string;
  unitNumber?: string;
  fullName?: string;
  leaseStart?: string | null;
  leaseEnd?: string | null;
  rent?: number | null;
}): Promise<void> {
  const unitLabel = payload.unitNumber ? `Unit ${payload.unitNumber}` : 'Unit to be selected';
  const greeting = payload.fullName ? `Hi ${payload.fullName},` : 'Hello,';
  const lines = [
    greeting,
    '',
    'You have been invited to set up your tenant portal.',
    '',
    `Property: ${payload.propertyName || 'Property to be selected'}`,
    `Unit: ${unitLabel}`,
    payload.leaseStart ? `Lease Start: ${payload.leaseStart}` : null,
    payload.leaseEnd ? `Lease End: ${payload.leaseEnd}` : null,
    payload.rent ? `Monthly Rent: $${payload.rent}` : null,
    '',
    'Complete your onboarding here:',
    payload.inviteLink,
    '',
    'If you did not expect this invite, you can ignore this message.',
  ].filter(Boolean);

  await sendResendEmail({
    to: payload.toEmail,
    subject: `Tenant Portal Invite: ${payload.propertyName || 'Your New Home'}`,
    text: lines.join('\n'),
  });
}

router.post('/', authenticate, Permissions.createTenants, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { unitId, email, leaseStart, leaseEnd, rent, expiresAt, fullName } = req.body || {};

    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    let unit: any = null;
    if (unitId) {
      const { data: unitData, error: unitError } = await supabase
        .from('units')
        .select('id, unit_number, rent_amount, property_id, properties (id, name)')
        .eq('account_id', req.user.accountId)
        .eq('id', unitId)
        .single();

      if (unitError || !unitData) {
        res.status(404).json({ error: 'Unit not found' });
        return;
      }
      unit = unitData;
    }

    const inviteToken = crypto.randomBytes(16).toString('hex');
    const expiresAtValue = expiresAt || new Date(Date.now() + 14 * DAY_MS).toISOString();

    const { data: invite, error: inviteError } = await supabase
      .from('tenant_invites')
      .insert({
        account_id: req.user.accountId,
        unit_id: unitId || null,
        property_id: unit?.properties?.id || unit?.property_id || null,
        email: String(email).toLowerCase(),
        invite_token: inviteToken,
        lease_start: leaseStart || null,
        lease_end: leaseEnd || null,
        rent: rent ?? unit?.rent_amount ?? null,
        created_by: req.user.id,
        expires_at: expiresAtValue,
      })
      .select()
      .single();

    if (inviteError) {
      res.status(500).json({ error: 'Failed to create invite', details: inviteError.message });
      return;
    }

    const inviteLink = `${config.frontendUrl}/tenant/invite?token=${inviteToken}`;
    let emailSent = false;
    let emailError: string | undefined;

    try {
      await sendTenantInviteEmail({
        toEmail: String(email).toLowerCase(),
        inviteLink,
        propertyName: unit?.properties?.name || undefined,
        unitNumber: unit?.unit_number || undefined,
        fullName: fullName || undefined,
        leaseStart: leaseStart || null,
        leaseEnd: leaseEnd || null,
        rent: rent ?? unit?.rent_amount ?? null,
      });
      emailSent = true;
    } catch (sendError: any) {
      emailError = sendError?.message || 'Failed to send invite email';
      console.warn('[TenantInvites] Email send failed:', sendError);
    }

    res.status(201).json({
      invite,
      inviteLink,
      emailSent,
      emailError,
    });
  } catch (error) {
    console.error('Create tenant invite error:', error);
    res.status(500).json({ error: 'Failed to create tenant invite' });
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
      .from('tenant_invites')
      .select(`
        id,
        email,
        lease_start,
        lease_end,
        rent,
        status,
        expires_at,
        units (
          id,
          unit_number,
          properties (id, name, address1, city, state, zip)
        )
      `)
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

    const unit = Array.isArray(invite.units) ? invite.units[0] : invite.units;
    const property = Array.isArray(unit?.properties) ? unit.properties[0] : unit?.properties;

    res.json({
      email: invite.email,
      leaseStart: invite.lease_start,
      leaseEnd: invite.lease_end,
      rent: invite.rent,
      unit: unit || null,
      property: property || null,
    });
  } catch (error) {
    console.error('Get tenant invite error:', error);
    res.status(500).json({ error: 'Failed to fetch invite' });
  }
});

router.post('/:token/accept', async (req, res) => {
  try {
    const token = req.params.token;
    const { password, fullName, phone, moveInDate, employmentStatus, monthlyIncome, creditScore, backgroundCheckStatus } = req.body || {};

    if (!token || !password || !fullName || !employmentStatus || monthlyIncome == null || creditScore == null) {
      res.status(400).json({ error: 'Token, password, full name, and scoring fields are required' });
      return;
    }

    const normalizedMonthlyIncome = Number(monthlyIncome);
    const normalizedCreditScore = Number(creditScore);
    if (!Number.isFinite(normalizedMonthlyIncome) || normalizedMonthlyIncome <= 0) {
      res.status(400).json({ error: 'monthlyIncome must be a positive number' });
      return;
    }
    if (!Number.isFinite(normalizedCreditScore) || normalizedCreditScore < 300 || normalizedCreditScore > 850) {
      res.status(400).json({ error: 'creditScore must be between 300 and 850' });
      return;
    }
    const normalizedBackgroundCheckStatus = normalizeBackgroundStatus(backgroundCheckStatus);

    const { data: invite, error: inviteError } = await supabase
      .from('tenant_invites')
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
    let tenantUserId: string | null = null;

    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      res.status(500).json({ error: 'Failed to verify tenant account' });
      return;
    }

    const existingUser = listData?.users?.find((user) => user.email?.toLowerCase() === email);

    if (existingUser) {
      tenantUserId = existingUser.id;
      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'tenant',
          membership_status: 'active',
        },
      });

      if (updateError) {
        res.status(500).json({ error: 'Failed to update tenant password', details: updateError.message });
        return;
      }
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'tenant',
          membership_status: 'active',
        },
      });

      if (createError || !created?.user) {
        res.status(500).json({ error: 'Failed to create tenant account', details: createError?.message });
        return;
      }

      tenantUserId = created.user.id;
    }

    if (!tenantUserId) {
      res.status(500).json({ error: 'Unable to resolve tenant user' });
      return;
    }

    await supabase
      .from('account_members')
      .upsert(
        {
          account_id: invite.account_id,
          user_id: tenantUserId,
          role: 'tenant',
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,user_id' }
      );

    const { data: existingProfile } = await supabase
      .from('tenant_profiles')
      .select('id')
      .eq('account_id', invite.account_id)
      .eq('user_id', tenantUserId)
      .maybeSingle();

    const riskScore = calculateTenantRiskScore({
      creditScore: normalizedCreditScore,
      monthlyIncome: normalizedMonthlyIncome,
      employmentStatus: String(employmentStatus),
      backgroundCheckStatus: normalizedBackgroundCheckStatus,
      rent: invite.rent,
    });

    if (existingProfile) {
      await supabase
        .from('tenant_profiles')
        .update({
          full_name: fullName,
          phone: phone || null,
          email,
          move_in_date: moveInDate || invite.lease_start || null,
          employment_status: String(employmentStatus),
          monthly_income: normalizedMonthlyIncome,
          credit_score: Math.round(normalizedCreditScore),
          background_check_status: normalizedBackgroundCheckStatus,
          ai_risk_score: riskScore,
        })
        .eq('id', existingProfile.id);
    } else {
      await supabase
        .from('tenant_profiles')
        .insert({
          account_id: invite.account_id,
          user_id: tenantUserId,
          full_name: fullName,
          phone: phone || null,
          email,
          move_in_date: moveInDate || invite.lease_start || null,
          employment_status: String(employmentStatus),
          monthly_income: normalizedMonthlyIncome,
          credit_score: Math.round(normalizedCreditScore),
          background_check_status: normalizedBackgroundCheckStatus,
          ai_risk_score: riskScore,
        });
    }

    let leaseId: string | null = null;
    if (invite.unit_id) {
      const { data: existingLease } = await supabase
        .from('leases')
        .select('id, tenant_user_id')
        .eq('account_id', invite.account_id)
        .eq('unit_id', invite.unit_id)
        .in('status', ['active', 'pending'])
        .maybeSingle();

      leaseId = existingLease?.id || null;

      if (existingLease && existingLease.tenant_user_id !== tenantUserId) {
        res.status(409).json({ error: 'Unit already assigned to another tenant' });
        return;
      }

      if (!leaseId) {
        const leaseStart = invite.lease_start || moveInDate || new Date().toISOString().split('T')[0];
        const leaseEnd = invite.lease_end || (() => {
          const start = new Date(leaseStart);
          start.setFullYear(start.getFullYear() + 1);
          return start.toISOString().split('T')[0];
        })();

        const { data: lease, error: leaseError } = await supabase
          .from('leases')
          .insert({
            account_id: invite.account_id,
            unit_id: invite.unit_id,
            tenant_user_id: tenantUserId,
            lease_start: leaseStart,
            lease_end: leaseEnd,
            rent: invite.rent || 0,
            status: 'active',
            move_in_date: moveInDate || invite.lease_start || null,
          })
          .select()
          .single();

        if (leaseError || !lease) {
          res.status(500).json({ error: 'Failed to create lease', details: leaseError?.message });
          return;
        }

        leaseId = lease.id;
      }

      if (leaseId) {
        await supabase
          .from('lease_tenants')
          .upsert(
            {
              account_id: invite.account_id,
              lease_id: leaseId,
              tenant_user_id: tenantUserId,
              is_primary: true,
            },
            { onConflict: 'lease_id,tenant_user_id' }
          );
      }

      await supabase
        .from('units')
        .update({ status: 'occupied' })
        .eq('account_id', invite.account_id)
        .eq('id', invite.unit_id);
    }

    await supabase
      .from('tenant_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    try {
      const ownerRecipients = await getAccountUsersByRoles(invite.account_id, ['owner', 'manager', 'admin']);
      if (ownerRecipients.length > 0) {
        const { data: unitContext } = invite.unit_id
          ? await supabase
              .from('units')
              .select('unit_number, properties(name)')
              .eq('account_id', invite.account_id)
              .eq('id', invite.unit_id)
              .maybeSingle()
          : { data: null };
        const propertyRelation = Array.isArray((unitContext as any)?.properties)
          ? (unitContext as any).properties[0]
          : (unitContext as any)?.properties;
        const propertyName = propertyRelation?.name || 'Property';
        const unitLabel = unitContext?.unit_number ? ` #${unitContext.unit_number}` : '';
        await createNotifications(
          ownerRecipients.map((recipientId) => ({
            accountId: invite.account_id,
            userId: recipientId,
            type: 'system',
            title: 'Tenant onboarding completed',
            message: [
              `${fullName || email} is now active in the tenant portal.`,
              `Property: ${propertyName}${unitLabel}`,
            ].join('\n'),
            actionUrl: buildTenantActionUrl(tenantUserId),
            relatedEntityType: 'tenant',
            relatedEntityId: tenantUserId,
            payload: {
              tenantUserId,
              inviteId: invite.id,
            },
          }))
        );
      }
    } catch (notificationError) {
      console.warn('[TenantInvites] Failed to create onboarding notifications:', notificationError);
    }

    res.json({ success: true, email, needsOnboarding: !invite.unit_id, riskScore });
  } catch (error) {
    console.error('Accept tenant invite error:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;
