import Stripe from 'stripe';
import { config } from './config';

export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export type SubscriptionPlan = 'basic' | 'pro' | 'premium';

export interface PlanLimits {
  maxProperties: number;
  maxUnits: number;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  basic: {
    maxProperties: 1,
    maxUnits: 3,
  },
  pro: {
    maxProperties: 10,
    maxUnits: 100,
  },
  premium: {
    maxProperties: 999999,
    maxUnits: 999999,
  },
};

export function getPlanFromPriceId(priceId: string): SubscriptionPlan {
  if (priceId === config.stripe.proPriceId) {
    return 'pro';
  }
  if (priceId === config.stripe.premiumPriceId) {
    return 'premium';
  }
  return 'basic';
}

export function getPriceIdFromPlan(plan: SubscriptionPlan): string | null {
  switch (plan) {
    case 'pro':
      return config.stripe.proPriceId;
    case 'premium':
      return config.stripe.premiumPriceId;
    default:
      return null;
  }
}
