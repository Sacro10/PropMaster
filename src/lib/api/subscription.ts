import { SubscriptionPlan } from '../stripe';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateCheckoutSessionResponse {
  url: string;
}

export interface CreatePortalSessionResponse {
  url: string;
}

export async function createCheckoutSession(
  accountId: string,
  plan: SubscriptionPlan,
  userId: string
): Promise<string> {
  const response = await fetch(`${API_URL}/api/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId,
      plan,
      userId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  const data: CreateCheckoutSessionResponse = await response.json();
  return data.url;
}

export async function createPortalSession(accountId: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/create-portal-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create portal session');
  }

  const data: CreatePortalSessionResponse = await response.json();
  return data.url;
}
