import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type CreateVendorInvitePayload = {
  email: string;
  expiresAt?: string;
};

export type CreateVendorInviteResponse = {
  inviteLink: string;
  emailSent: boolean;
  emailError?: string;
};

export type VendorInviteDetails = {
  email: string;
};

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }
  return session.access_token;
}

export async function createVendorInvite(
  payload: CreateVendorInvitePayload
): Promise<CreateVendorInviteResponse> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/vendor-invites`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to create vendor invite');
  }

  return await response.json();
}

export async function fetchVendorInvite(token: string): Promise<VendorInviteDetails> {
  const response = await fetch(`${API_BASE}/api/vendor-invites/${token}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Invite unavailable');
  }
  return await response.json();
}

export async function acceptVendorInvite(
  token: string,
  payload: {
    password: string;
    fullName?: string;
  }
): Promise<{ success: boolean; email: string; accountId?: string }> {
  const response = await fetch(`${API_BASE}/api/vendor-invites/${token}/accept`, {
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
