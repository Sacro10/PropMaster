import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface StripeConnectSettings {
  stripeConnectedAccountId: string | null;
  chargesEnabled: boolean | null;
  payoutsEnabled: boolean | null;
}

export async function getStripeConnectSettings(): Promise<StripeConnectSettings> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/accounts/stripe-connect`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) throw new Error('Failed to fetch Stripe connect settings');
  return await response.json();
}

export async function updateStripeConnectSettings(stripeAccountId: string): Promise<StripeConnectSettings> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await fetch(`${API_BASE}/api/accounts/stripe-connect`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stripeAccountId }),
  });

  if (!response.ok) throw new Error('Failed to update Stripe connect settings');
  return await response.json();
}
