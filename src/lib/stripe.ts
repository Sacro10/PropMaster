import { loadStripe, Stripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_PUBLISHABLE_KEY) {
  console.warn('Missing VITE_STRIPE_PUBLISHABLE_KEY environment variable');
}

let stripePromise: Promise<Stripe | null> | null = null;

export const getStripe = () => {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

export type SubscriptionPlan = 'basic' | 'pro' | 'premium';

export interface PlanInfo {
  name: string;
  price: number;
  priceLabel: string;
  description: string;
  features: string[];
  maxUnits: number;
  recommended?: boolean;
}

export const PLAN_INFO: Record<SubscriptionPlan, PlanInfo> = {
  basic: {
    name: 'Basic',
    price: 0,
    priceLabel: 'Free',
    description: 'Perfect for getting started',
    maxUnits: 10,
    features: [
      'Up to 10 properties',
      'Basic tenant screening',
      'Maintenance tracking',
      'Email support',
    ],
  },
  pro: {
    name: 'Pro',
    price: 10,
    priceLabel: '$10/month',
    description: 'For growing property managers',
    maxUnits: 50,
    recommended: true,
    features: [
      'Up to 50 properties',
      'AI tenant screening',
      'Advanced analytics',
      'Automated rent collection',
      'Priority support',
    ],
  },
  premium: {
    name: 'Premium',
    price: 20,
    priceLabel: '$20/month',
    description: 'For professionals',
    maxUnits: 999999,
    features: [
      'Unlimited properties',
      'Full AI automation',
      'Custom reports',
      'API access',
      'Dedicated account manager',
      '24/7 phone support',
    ],
  },
};
