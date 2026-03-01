import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type TenantInviteDetails = {
  email: string;
  leaseStart: string | null;
  leaseEnd: string | null;
  rent: number | null;
  unit: {
    id: string;
    unit_number: string;
    properties?: {
      id: string;
      name: string;
      address1?: string;
      city?: string;
      state?: string;
      zip?: string;
    } | null;
  } | null;
  property: {
    id: string;
    name: string;
    address1?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
};

export async function fetchTenantInvite(token: string): Promise<TenantInviteDetails> {
  const response = await fetch(`${API_BASE}/api/tenant-invites/${token}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Invite unavailable');
  }
  return await response.json();
}

export async function acceptTenantInvite(
  token: string,
  payload: {
    password: string;
    fullName: string;
    phone?: string;
    moveInDate?: string;
    employmentStatus: string;
    monthlyIncome: number;
    creditScore: number;
    backgroundCheckStatus: 'pending' | 'approved' | 'rejected' | 'not_required';
  }
): Promise<{ success: boolean; email: string; needsOnboarding?: boolean; riskScore?: number | null }>
{
  const response = await fetch(`${API_BASE}/api/tenant-invites/${token}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to accept invite');
  }

  return await response.json();
}

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }
  return session.access_token;
}

export async function getTenantPaymentMethods() {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tenant-portal/payment-methods`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to load payment methods');
  }

  const data = await response.json();
  return data?.data || [];
}

export async function saveTenantPaymentMethod(payload: {
  methodType: 'card' | 'ach';
  label: string;
  brand?: string;
  last4?: string;
  bankName?: string;
  makeDefault?: boolean;
}) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tenant-portal/payment-methods`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to save payment method');
  }

  const data = await response.json();
  return data?.data;
}

export async function setTenantAutoPay(leaseId: string, enabled: boolean) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tenant-portal/auto-pay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ leaseId, enabled }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to update auto-pay');
  }

  return await response.json();
}

export type TenantPortalMessage = {
  id: string;
  conversation_id: string | null;
  from_user_id: string;
  to_user_id: string | null;
  subject: string | null;
  body: string;
  attachments: any[];
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export async function getTenantPortalMessages(): Promise<{
  messages: TenantPortalMessage[];
  defaultRecipientId: string | null;
}> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tenant-portal/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.details || error?.error || 'Failed to load messages');
  }

  const payload = await response.json();
  return {
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    defaultRecipientId: payload?.defaultRecipientId || null,
  };
}

export async function sendTenantPortalMessage(payload: {
  body: string;
  subject?: string;
  recipientId?: string | null;
}): Promise<{
  message: TenantPortalMessage;
  defaultRecipientId: string | null;
}> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tenant-portal/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.details || error?.error || 'Failed to send message');
  }

  const data = await response.json();
  return {
    message: data?.message,
    defaultRecipientId: data?.defaultRecipientId || null,
  };
}
