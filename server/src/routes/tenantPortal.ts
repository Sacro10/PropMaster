import { Router } from 'express';
import path from 'path';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabaseAdmin as supabase } from '../supabase';
import { setLeaseAutoPay } from '../services/leaseService';
import { sendMessage } from '../services/communicationsService';
import { stripe } from '../stripe';
import { config } from '../config';
import { cache } from '../utils/cache';
import { notifyPaymentPaid } from '../services/paymentService';

const router = Router();
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'maintenance-attachments';
const OWNER_ROLES = ['owner', 'manager', 'admin'];
let bucketEnsured = false;

type UploadedFilePayload = {
  url?: string;
  publicUrl?: string;
  fileName?: string;
  file_name?: string;
  name?: string;
  contentType?: string;
  content_type?: string;
  size?: number;
  file_size?: number;
};

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName || 'document');
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function deriveFileNameFromUrl(url: string) {
  try {
    const lastSegment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (lastSegment) return decodeURIComponent(lastSegment);
  } catch {
    // no-op
  }
  const fallback = url.split('/').filter(Boolean).pop();
  return fallback || 'document';
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

async function getOwnerMemberIds(accountId: string, excludeUserId?: string) {
  const { data, error } = await supabase
    .from('account_members')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .in('role', OWNER_ROLES);

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => row.user_id as string)
    .filter((userId) => Boolean(userId) && userId !== excludeUserId);
}

async function getPreferredOwnerRecipient(accountId: string, excludeUserId?: string) {
  const { data, error } = await supabase
    .from('account_members')
    .select('user_id, role, joined_at, created_at, is_active')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .in('role', OWNER_ROLES);

  if (error) {
    throw error;
  }

  const rows = (data || [])
    .filter((row: any) => row?.user_id && row.user_id !== excludeUserId);

  if (rows.length === 0) {
    return null;
  }

  const rolePriority = ['owner', 'admin', 'manager'];
  const sorted = [...rows].sort((a: any, b: any) => {
    const roleScore = (role: string | null | undefined) => {
      const index = rolePriority.indexOf(role || '');
      return index === -1 ? rolePriority.length : index;
    };

    const roleDiff = roleScore(a.role) - roleScore(b.role);
    if (roleDiff !== 0) {
      return roleDiff;
    }

    const dateA = new Date(a.joined_at || a.created_at || 0).getTime();
    const dateB = new Date(b.joined_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return sorted[0]?.user_id || null;
}

function normalizeMessageAttachments(messageId: string, attachments: any, uploadedAt: string, source: 'owner' | 'tenant') {
  if (!Array.isArray(attachments)) {
    return [] as Array<{
      id: string;
      source: 'owner' | 'tenant';
      sourceLabel: string;
      uploadedAt: string;
      title: string;
      fileName: string;
      url: string;
    }>;
  }

  const sourceLabel = source === 'owner' ? 'Property owner' : 'You';
  const docs: Array<{
    id: string;
    source: 'owner' | 'tenant';
    sourceLabel: string;
    uploadedAt: string;
    title: string;
    fileName: string;
    url: string;
  }> = [];

  attachments.forEach((item: any, index: number) => {
    const directUrl = typeof item === 'string' ? item : null;
    const objectItem = typeof item === 'object' && item ? item as UploadedFilePayload : null;
    const url = directUrl || objectItem?.url || objectItem?.publicUrl || null;

    if (!url) {
      return;
    }

    const fileName =
      objectItem?.fileName ||
      objectItem?.file_name ||
      objectItem?.name ||
      deriveFileNameFromUrl(url);

    docs.push({
      id: `${messageId}-${index}`,
      source,
      sourceLabel,
      uploadedAt,
      title: fileName,
      fileName,
      url,
    });
  });

  return docs;
}

router.get('/messages', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const [ownerMemberIds, preferredRecipientId] = await Promise.all([
      getOwnerMemberIds(req.user.accountId, req.user.id),
      getPreferredOwnerRecipient(req.user.accountId, req.user.id),
    ]);

    if (ownerMemberIds.length === 0) {
      res.json({
        messages: [],
        defaultRecipientId: null,
      });
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, from_user_id, to_user_id, subject, body, attachments, is_read, read_at, created_at')
      .eq('account_id', req.user.accountId)
      .or(`from_user_id.eq.${req.user.id},to_user_id.eq.${req.user.id}`)
      .order('created_at', { ascending: true })
      .limit(300);

    if (error) {
      res.status(500).json({
        error: 'Failed to fetch messages',
        details: error.message,
      });
      return;
    }

    const ownerIdSet = new Set(ownerMemberIds);
    const messages = (data || []).filter((message: any) => {
      const outbound = message.from_user_id === req.user?.id && ownerIdSet.has(message.to_user_id);
      const inbound = message.to_user_id === req.user?.id && ownerIdSet.has(message.from_user_id);
      return outbound || inbound;
    });

    const unreadInboundIds = messages
      .filter((message: any) => message.to_user_id === req.user?.id && message.is_read !== true)
      .map((message: any) => message.id)
      .filter(Boolean);

    if (unreadInboundIds.length > 0) {
      await supabase
        .from('messages')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .in('id', unreadInboundIds)
        .eq('account_id', req.user.accountId);
    }

    const latestInbound = [...messages]
      .reverse()
      .find((message: any) => message.to_user_id === req.user?.id && ownerIdSet.has(message.from_user_id));

    res.json({
      messages: messages.map((message: any) => ({
        ...message,
        is_read: message.to_user_id === req.user?.id ? true : message.is_read,
      })),
      defaultRecipientId: latestInbound?.from_user_id || preferredRecipientId || ownerMemberIds[0] || null,
    });
  } catch (error) {
    console.error('Get tenant portal messages error:', error);
    res.status(500).json({ error: 'Failed to fetch tenant portal messages' });
  }
});

router.post('/messages', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const body = String(req.body?.body || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const requestedRecipientId = String(req.body?.recipientId || '').trim();

    if (!body) {
      res.status(400).json({ error: 'Message body is required' });
      return;
    }

    const [ownerMemberIds, preferredRecipientId, leaseContext] = await Promise.all([
      getOwnerMemberIds(req.user.accountId, req.user.id),
      getPreferredOwnerRecipient(req.user.accountId, req.user.id),
      supabase
        .from('leases')
        .select('unit_id, units(property_id)')
        .eq('account_id', req.user.accountId)
        .eq('tenant_user_id', req.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (ownerMemberIds.length === 0) {
      res.status(400).json({ error: 'No property owner/manager found for this account' });
      return;
    }

    const resolvedRecipientId =
      (requestedRecipientId && ownerMemberIds.includes(requestedRecipientId) ? requestedRecipientId : null) ||
      preferredRecipientId ||
      ownerMemberIds[0];

    if (!resolvedRecipientId) {
      res.status(400).json({ error: 'No valid message recipient found' });
      return;
    }

    const unitId = leaseContext?.data?.unit_id || undefined;
    const unit = Array.isArray((leaseContext?.data as any)?.units)
      ? (leaseContext?.data as any).units[0]
      : (leaseContext?.data as any)?.units;
    const propertyId = unit?.property_id || undefined;

    const message = await sendMessage(req.user.accountId, req.user.id, {
      recipientId: resolvedRecipientId,
      subject: subject || 'Tenant portal message',
      body,
      propertyId,
      unitId,
    });

    res.status(201).json({
      message: {
        id: message.id,
        conversation_id: message.conversationId,
        from_user_id: message.fromUserId,
        to_user_id: message.toUserId,
        subject: message.subject,
        body: message.body,
        attachments: [],
        is_read: message.isRead,
        read_at: message.readAt,
        created_at: message.createdAt,
      },
      defaultRecipientId: resolvedRecipientId,
    });
  } catch (error) {
    console.error('Send tenant portal message error:', error);
    res.status(500).json({
      error: 'Failed to send tenant portal message',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/documents', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const ownerMemberIds = await getOwnerMemberIds(req.user.accountId, req.user.id);
    const ownerIdSet = new Set(ownerMemberIds);

    const [{ data: lease, error: leaseError }, { data: inboundMessages, error: inboundError }, { data: outboundMessages, error: outboundError }] = await Promise.all([
      supabase
        .from('leases')
        .select('id, lease_document_url, signed_lease_url, updated_at, created_at')
        .eq('account_id', req.user.accountId)
        .eq('tenant_user_id', req.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('messages')
        .select('id, from_user_id, attachments, created_at')
        .eq('account_id', req.user.accountId)
        .eq('to_user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('messages')
        .select('id, to_user_id, attachments, created_at')
        .eq('account_id', req.user.accountId)
        .eq('from_user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (leaseError || inboundError || outboundError) {
      res.status(500).json({
        error: 'Failed to fetch documents',
        details: leaseError?.message || inboundError?.message || outboundError?.message,
      });
      return;
    }

    const ownerDocuments: Array<{
      id: string;
      source: 'owner' | 'tenant';
      sourceLabel: string;
      uploadedAt: string;
      title: string;
      fileName: string;
      url: string;
    }> = [];

    const tenantDocuments: Array<{
      id: string;
      source: 'owner' | 'tenant';
      sourceLabel: string;
      uploadedAt: string;
      title: string;
      fileName: string;
      url: string;
    }> = [];

    if (lease?.lease_document_url) {
      ownerDocuments.push({
        id: `lease-${lease.id}-agreement`,
        source: 'owner',
        sourceLabel: 'Property owner',
        uploadedAt: lease.updated_at || lease.created_at || new Date().toISOString(),
        title: 'Lease Agreement',
        fileName: 'Lease Agreement',
        url: lease.lease_document_url,
      });
    }

    if (lease?.signed_lease_url) {
      ownerDocuments.push({
        id: `lease-${lease.id}-signed`,
        source: 'owner',
        sourceLabel: 'Property owner',
        uploadedAt: lease.updated_at || lease.created_at || new Date().toISOString(),
        title: 'Signed Lease',
        fileName: 'Signed Lease',
        url: lease.signed_lease_url,
      });
    }

    (inboundMessages || []).forEach((message: any) => {
      if (!ownerIdSet.has(message.from_user_id)) {
        return;
      }

      ownerDocuments.push(
        ...normalizeMessageAttachments(
          message.id,
          message.attachments,
          message.created_at || new Date().toISOString(),
          'owner'
        )
      );
    });

    (outboundMessages || []).forEach((message: any) => {
      if (!ownerIdSet.has(message.to_user_id)) {
        return;
      }

      tenantDocuments.push(
        ...normalizeMessageAttachments(
          message.id,
          message.attachments,
          message.created_at || new Date().toISOString(),
          'tenant'
        )
      );
    });

    const dedupeByUrl = (docs: typeof ownerDocuments) => {
      const seen = new Set<string>();
      return docs.filter((doc) => {
        const key = `${doc.source}:${doc.url}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };

    const sortByNewest = (docs: typeof ownerDocuments) =>
      [...docs].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    res.json({
      ownerDocuments: sortByNewest(dedupeByUrl(ownerDocuments)),
      tenantDocuments: sortByNewest(dedupeByUrl(tenantDocuments)),
    });
  } catch (error) {
    console.error('Get tenant documents error:', error);
    res.status(500).json({ error: 'Failed to fetch tenant documents' });
  }
});

router.post('/documents/upload-sign', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const fileName = String(req.body?.fileName || '').trim();
    const contentType = String(req.body?.contentType || '').trim().toLowerCase();

    if (!fileName) {
      res.status(400).json({ error: 'fileName is required' });
      return;
    }

    const isAllowedContentType =
      contentType.startsWith('image/') ||
      contentType === 'application/pdf' ||
      contentType === 'application/msword' ||
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      contentType === 'text/plain';

    if (!isAllowedContentType) {
      res.status(400).json({ error: 'Unsupported file type' });
      return;
    }

    const safeName = sanitizeFileName(fileName);
    const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`;
    const objectPath = `tenant-documents/${req.user.accountId}/${req.user.id}/${uniqueName}`;

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
    console.error('Create tenant document upload URL error:', error);
    res.status(500).json({
      error: 'Failed to create upload URL',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/documents/share', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const accountId = req.user.accountId;
    const senderId = req.user.id;

    const files = Array.isArray(req.body?.files) ? req.body.files as UploadedFilePayload[] : [];
    const note = String(req.body?.note || '').trim();

    const normalizedFiles = files
      .map((file) => {
        const url = file?.url || file?.publicUrl || '';
        if (!url) return null;
        const fileName = file?.fileName || file?.file_name || file?.name || deriveFileNameFromUrl(url);
        const contentType = file?.contentType || file?.content_type || null;
        const size = file?.size || file?.file_size || null;
        return {
          url,
          fileName,
          contentType,
          size,
        };
      })
      .filter((item): item is { url: string; fileName: string; contentType: string | null; size: number | null } => Boolean(item));

    if (normalizedFiles.length === 0) {
      res.status(400).json({ error: 'At least one uploaded file is required' });
      return;
    }

    const ownerMemberIds = await getOwnerMemberIds(req.user.accountId, req.user.id);
    if (ownerMemberIds.length === 0) {
      res.status(400).json({ error: 'No property owner/manager found for this account' });
      return;
    }

    const { data: leaseContext } = await supabase
      .from('leases')
      .select('unit_id, units(property_id)')
      .eq('account_id', req.user.accountId)
      .eq('tenant_user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const unitId = leaseContext?.unit_id || null;
    const unit = Array.isArray((leaseContext as any)?.units)
      ? (leaseContext as any).units[0]
      : (leaseContext as any)?.units;
    const propertyId = unit?.property_id || undefined;

    const body = note || `Tenant uploaded ${normalizedFiles.length} document${normalizedFiles.length > 1 ? 's' : ''} in the tenant portal.`;

    await Promise.all(
      ownerMemberIds.map((ownerUserId) =>
        sendMessage(accountId, senderId, {
          recipientId: ownerUserId,
          subject: 'Tenant document upload',
          body,
          propertyId,
          unitId: unitId || undefined,
          attachments: normalizedFiles,
        })
      )
    );

    res.status(201).json({
      success: true,
      sharedWith: ownerMemberIds.length,
    });
  } catch (error) {
    console.error('Share tenant documents error:', error);
    res.status(500).json({ error: 'Failed to share tenant documents' });
  }
});

router.get('/payment-methods', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { data, error } = await supabase
      .from('tenant_payment_methods')
      .select('*')
      .eq('account_id', req.user.accountId)
      .eq('tenant_user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch payment methods' });
      return;
    }

    res.json({ data: data || [] });
  } catch (error) {
    console.error('Get tenant payment methods error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

router.post('/payment-methods', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { methodType, label, brand, last4, bankName, makeDefault } = req.body || {};

    if (!methodType || !label) {
      res.status(400).json({ error: 'methodType and label are required' });
      return;
    }

    const isDefault = makeDefault !== false;

    if (isDefault) {
      await supabase
        .from('tenant_payment_methods')
        .update({ is_default: false })
        .eq('account_id', req.user.accountId)
        .eq('tenant_user_id', req.user.id);
    }

    const { data, error } = await supabase
      .from('tenant_payment_methods')
      .insert({
        account_id: req.user.accountId,
        tenant_user_id: req.user.id,
        method_type: methodType,
        label,
        brand: brand || null,
        last4: last4 || null,
        bank_name: bankName || null,
        is_default: isDefault,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to save payment method', details: error.message });
      return;
    }

    res.status(201).json({ data });
  } catch (error) {
    console.error('Save tenant payment method error:', error);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

router.post('/auto-pay', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { leaseId, enabled } = req.body || {};

    if (!leaseId) {
      res.status(400).json({ error: 'leaseId is required' });
      return;
    }

    const { data: lease, error: leaseError } = await supabase
      .from('leases')
      .select('id, tenant_user_id')
      .eq('account_id', req.user.accountId)
      .eq('id', leaseId)
      .single();

    if (leaseError || !lease) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }

    if (lease.tenant_user_id !== req.user.id) {
      res.status(403).json({ error: 'Not authorized to update this lease' });
      return;
    }

    const result = await setLeaseAutoPay(req.user.accountId, leaseId, Boolean(enabled));
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Tenant auto-pay error:', error);
    res.status(500).json({ error: 'Failed to update auto-pay' });
  }
});

router.post('/rent-checkout-session', authenticate, async (req: AuthRequest, res) => {
  let createdPaymentId: string | null = null;
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const { leaseId, amount, dueDate } = req.body || {};
    const normalizedAmount = Number(amount);
    if (!leaseId || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      res.status(400).json({ error: 'leaseId and a valid amount are required' });
      return;
    }

    const amountInCents = Math.round(normalizedAmount * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    let normalizedDueDate = new Date().toISOString().split('T')[0];
    if (typeof dueDate === 'string' && dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        res.status(400).json({ error: 'Invalid dueDate' });
        return;
      }
      normalizedDueDate = parsedDueDate.toISOString().split('T')[0];
    }

    const { data: lease, error: leaseError } = await supabase
      .from('leases')
      .select(`
        id,
        unit_id,
        tenant_user_id,
        units (
          unit_number,
          properties (
            name
          )
        )
      `)
      .eq('account_id', req.user.accountId)
      .eq('id', leaseId)
      .single();

    if (leaseError || !lease) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }

    if (lease.tenant_user_id !== req.user.id) {
      res.status(403).json({ error: 'Not authorized to pay for this lease' });
      return;
    }

    const { data: paymentRow, error: paymentInsertError } = await supabase
      .from('payments')
      .insert({
        account_id: req.user.accountId,
        lease_id: lease.id,
        tenant_user_id: req.user.id,
        unit_id: lease.unit_id || null,
        amount: normalizedAmount,
        payment_type: 'rent',
        due_date: normalizedDueDate,
        status: 'processing',
        payment_method: 'stripe',
        notes: 'Tenant-initiated Stripe checkout',
      })
      .select('id')
      .single();

    if (paymentInsertError || !paymentRow) {
      res.status(500).json({
        error: 'Failed to create payment record',
        details: paymentInsertError?.message,
      });
      return;
    }
    createdPaymentId = paymentRow.id;

    const unit = Array.isArray((lease as any).units) ? (lease as any).units[0] : (lease as any).units;
    const property = Array.isArray(unit?.properties) ? unit.properties[0] : unit?.properties;
    const descriptionParts = [property?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null].filter(Boolean);
    const description = descriptionParts.length > 0 ? descriptionParts.join(' • ') : 'Tenant rent payment';

    const metadata = {
      account_id: req.user.accountId,
      tenant_user_id: req.user.id,
      lease_id: lease.id,
      payment_id: paymentRow.id,
      payment_type: 'rent',
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountInCents,
            product_data: {
              name: 'Rent Payment',
              description,
            },
          },
        },
      ],
      success_url: `${config.frontendUrl}/portal/tenant?rent_payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/portal/tenant?rent_payment=cancelled`,
      metadata,
      payment_intent_data: {
        metadata,
      },
    });

    res.status(201).json({
      sessionId: session.id,
      url: session.url,
      paymentId: paymentRow.id,
    });
  } catch (error) {
    console.error('Create tenant rent checkout session error:', error);
    if (createdPaymentId && req.user?.accountId) {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          notes: 'Stripe checkout initialization failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdPaymentId)
        .eq('account_id', req.user.accountId);
    }
    res.status(500).json({ error: 'Failed to create Stripe checkout session' });
  }
});

router.get('/rent-checkout-status', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and user ID required' });
      return;
    }

    const sessionId = String(req.query.sessionId || req.query.session_id || '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const metadata = session.metadata || {};
    const metadataAccountId = metadata.account_id || null;
    const metadataTenantId = metadata.tenant_user_id || null;
    const paymentId = metadata.payment_id || null;

    if (metadataAccountId && metadataAccountId !== req.user.accountId) {
      res.status(403).json({ error: 'Checkout session does not belong to this account' });
      return;
    }

    if (metadataTenantId && metadataTenantId !== req.user.id) {
      res.status(403).json({ error: 'Checkout session does not belong to this tenant' });
      return;
    }

    const sessionStatus = session.status || 'open';
    const paymentStatus = session.payment_status || 'unpaid';
    let normalizedPaymentStatus: 'processing' | 'paid' | 'failed' | 'cancelled' = 'processing';

    if (paymentStatus === 'paid') {
      normalizedPaymentStatus = 'paid';
    } else if (sessionStatus === 'expired') {
      normalizedPaymentStatus = 'cancelled';
    } else if (sessionStatus === 'complete') {
      normalizedPaymentStatus = 'failed';
    }

    let paymentIntentId: string | null = null;
    let chargeId: string | null = null;
    let paidAt: string | null = null;

    const paymentIntent = session.payment_intent;
    if (typeof paymentIntent === 'string') {
      paymentIntentId = paymentIntent;
    } else if (paymentIntent) {
      paymentIntentId = paymentIntent.id;
      if (paymentIntent.status === 'succeeded') {
        paidAt = new Date(paymentIntent.created * 1000).toISOString();
      }
      chargeId =
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id || null;
    }

    if (!paidAt && paymentStatus === 'paid') {
      paidAt = new Date().toISOString();
    }

    if (paymentId) {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('status')
        .eq('id', paymentId)
        .eq('account_id', req.user.accountId)
        .maybeSingle();

      const updates: Record<string, any> = {
        status: normalizedPaymentStatus,
        transaction_id: session.id,
        updated_at: new Date().toISOString(),
      };

      if (normalizedPaymentStatus === 'paid') {
        updates.paid_at = paidAt;
        updates.payment_method = 'stripe';
      }

      if (paymentIntentId) updates.stripe_payment_intent_id = paymentIntentId;
      if (chargeId) updates.stripe_charge_id = chargeId;

      const { error: updateError } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', paymentId)
        .eq('account_id', req.user.accountId);

      if (updateError) {
        res.status(500).json({
          error: 'Failed to sync payment status',
          details: updateError.message,
        });
        return;
      }

      // Payment state changed; bust analytics cache so owner metrics refresh immediately.
      cache.clear();

      if (normalizedPaymentStatus === 'paid' && existingPayment?.status !== 'paid') {
        await notifyPaymentPaid({
          accountId: req.user.accountId,
          paymentId,
          actorUserId: req.user.id,
        });
      }
    }

    res.json({
      sessionId: session.id,
      sessionStatus,
      paymentStatus,
      normalizedPaymentStatus,
      paymentId,
    });
  } catch (error) {
    console.error('Get rent checkout status error:', error);
    res.status(500).json({ error: 'Failed to get checkout status' });
  }
});

export default router;
