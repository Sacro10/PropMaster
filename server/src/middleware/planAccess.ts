import type { NextFunction, Response } from 'express';
import { supabaseAdmin as supabase } from '../supabase';
import type { AuthRequest } from './auth';

export type SubscriptionPlan = 'basic' | 'pro' | 'premium';

export type PlanFeature =
  | 'tenant_portal'
  | 'basic_maintenance_requests'
  | 'property_management'
  | 'tenant_screening'
  | 'basic_rent_collection'
  | 'maintenance_routing'
  | 'marketing_tools'
  | 'standard_reporting'
  | 'lease_renewals'
  | 'communication_hub'
  | 'ai_risk_scoring'
  | 'integrated_accounting'
  | 'advanced_analytics'
  | 'advanced_exports'
  | 'custom_reports'
  | 'api_access'
  | 'hvac_filter_program'
  | 'electronic_showings'
  | 'emergency_support_24_7';

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  basic: 1,
  pro: 2,
  premium: 3,
};

const FEATURE_REQUIREMENTS: Record<PlanFeature, SubscriptionPlan> = {
  tenant_portal: 'basic',
  basic_maintenance_requests: 'basic',
  property_management: 'basic',
  tenant_screening: 'basic',
  basic_rent_collection: 'pro',
  maintenance_routing: 'pro',
  marketing_tools: 'pro',
  standard_reporting: 'pro',
  lease_renewals: 'pro',
  communication_hub: 'pro',
  ai_risk_scoring: 'pro',
  integrated_accounting: 'pro',
  advanced_analytics: 'pro',
  advanced_exports: 'premium',
  custom_reports: 'premium',
  api_access: 'premium',
  hvac_filter_program: 'premium',
  electronic_showings: 'premium',
  emergency_support_24_7: 'premium',
};

async function getAccountPlan(accountId: string): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('plan')
    .eq('id', accountId)
    .maybeSingle();

  if (error || !data?.plan) {
    return null;
  }

  const plan = String(data.plan) as SubscriptionPlan;
  return plan in PLAN_RANK ? plan : null;
}

async function getFeatureOverride(accountId: string, feature: PlanFeature): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('account_features')
    .select('enabled')
    .eq('account_id', accountId)
    .eq('feature_key', feature)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.enabled === true;
}

async function accountMeetsPlan(accountId: string, requiredPlan: SubscriptionPlan): Promise<boolean> {
  const plan = await getAccountPlan(accountId);
  if (!plan) {
    return false;
  }

  return PLAN_RANK[plan] >= PLAN_RANK[requiredPlan];
}

async function accountHasFeature(accountId: string, feature: PlanFeature): Promise<boolean> {
  const override = await getFeatureOverride(accountId, feature);
  if (override !== null) {
    return override;
  }

  return accountMeetsPlan(accountId, FEATURE_REQUIREMENTS[feature]);
}

export function requirePlanAccess(requiredPlan: SubscriptionPlan) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.accountId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const allowed = await accountMeetsPlan(req.user.accountId, requiredPlan);
      if (!allowed) {
        res.status(403).json({
          error: `${requiredPlan} plan required`,
          requiredPlan,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[Plan Access] Plan check failed:', error);
      res.status(500).json({ error: 'Plan check failed' });
    }
  };
}

export function requireFeatureAccess(feature: PlanFeature) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.accountId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const allowed = await accountHasFeature(req.user.accountId, feature);
      if (!allowed) {
        res.status(403).json({
          error: 'Feature not available on current plan',
          feature,
          requiredPlan: FEATURE_REQUIREMENTS[feature],
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[Plan Access] Feature check failed:', error);
      res.status(500).json({ error: 'Feature check failed' });
    }
  };
}
