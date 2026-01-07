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
  features: string[];
  maxUnits: number;
  recommended?: boolean;
}

export const PLAN_INFO: Record<SubscriptionPlan, PlanInfo> = {
  basic: {
    name: 'Basic',
    price: 0,
    priceLabel: 'Free',
    maxUnits: 3,
    features: [
      'Up to 3 units',
      'Tenant portal',
      'Basic maintenance requests',
      'Basic rent collection',
      'Property management',
    ],
  },
  pro: {
    name: 'Pro',
    price: 10,
    priceLabel: '$10/month',
    maxUnits: 100,
    recommended: true,
    features: [
      'Up to 100 units',
      'Everything in Basic',
      'Tenant screening',
      'Maintenance routing',
      'Marketing tools',
      'Standard reporting',
      'Lease renewals',
      'Communication hub',
    ],
  },
  premium: {
    name: 'Premium',
    price: 20,
    priceLabel: '$20/month',
    maxUnits: 999999,
    features: [
      'Unlimited units',
      'Everything in Pro',
      'AI risk scoring',
      'Integrated accounting',
      'HVAC filter program',
      'Electronic showings',
      '24/7 emergency support',
      'Advanced analytics',
      'Advanced exports',
      'Custom reports',
      'API access',
    ],
  },
};
