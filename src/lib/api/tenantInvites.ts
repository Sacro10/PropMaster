import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type CreateTenantInvitePayload = {
  email: string;
  unitId: string;
  fullName?: string;
  leaseStart?: string;
  leaseEnd?: string;
  rent?: number;
};

export type CreateTenantInviteResponse = {
  inviteLink: string;
  emailSent: boolean;
  emailError?: string;
};

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }
  return session.access_token;
}

export async function createTenantInvite(
  payload: CreateTenantInvitePayload
): Promise<CreateTenantInviteResponse> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tenant-invites`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to create tenant invite');
  }

  return await response.json();
}
