import type { SubscriptionPlan } from './stripe';

const PLAN_LEVEL: Record<SubscriptionPlan, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
};

export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, 'basic'>;

export function isPaidSubscriptionPlan(
  plan: string | null | undefined
): plan is PaidSubscriptionPlan {
  return plan === 'pro' || plan === 'premium';
}

export function getPlanSelectionPath(
  plan: SubscriptionPlan,
  isAuthenticated: boolean,
  currentPlan: SubscriptionPlan = 'basic'
): string {
  if (!isAuthenticated) {
    if (plan === 'basic') {
      return '/auth';
    }

    const returnTo = `/app/billing?${new URLSearchParams({
      plan,
      checkout: '1',
    }).toString()}`;

    return `/auth?${new URLSearchParams({ returnTo }).toString()}`;
  }

  if (plan === 'basic' && currentPlan === 'basic') {
    return '/app/dashboard';
  }

  if (PLAN_LEVEL[plan] > PLAN_LEVEL[currentPlan]) {
    return `/app/billing?${new URLSearchParams({
      plan,
      checkout: '1',
    }).toString()}`;
  }

  return '/app/billing';
}

export function getPlanCtaLabel(
  plan: SubscriptionPlan,
  isAuthenticated: boolean,
  currentPlan: SubscriptionPlan = 'basic'
): string {
  if (isAuthenticated && plan === currentPlan) {
    return 'Current Plan';
  }

  if (!isAuthenticated) {
    return plan === 'basic' ? 'Get Started' : 'Start Free Trial';
  }

  if (PLAN_LEVEL[plan] > PLAN_LEVEL[currentPlan]) {
    return 'Upgrade Now';
  }

  return plan === 'basic' ? 'Go to Dashboard' : 'Manage Plan';
}
