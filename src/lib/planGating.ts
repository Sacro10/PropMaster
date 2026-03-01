/**
 * Plan Gating System - Backend Helpers
 *
 * This module provides utilities for enforcing plan-based entitlements
 * and feature access in the frontend. All checks ultimately defer to
 * backend RLS policies and SQL functions for security.
 */

import { supabase } from './supabaseClient';
import { getCurrentAccountId } from './api/client';

// =====================================================
// TYPES & CONSTANTS
// =====================================================

export type PlanTier = 'basic' | 'pro' | 'premium';

export type FeatureKey =
  // Basic features (all plans)
  | 'tenant_portal'
  | 'basic_maintenance_requests'
  | 'basic_rent_collection'
  | 'property_management'

  // Pro features
  | 'tenant_screening'
  | 'maintenance_routing'
  | 'marketing_tools'
  | 'standard_reporting'
  | 'lease_renewals'
  | 'communication_hub'

  // Premium features
  | 'ai_risk_scoring'
  | 'integrated_accounting'
  | 'hvac_filter_program'
  | 'electronic_showings'
  | 'emergency_support_24_7'
  | 'advanced_analytics'
  | 'advanced_exports'
  | 'custom_reports'
  | 'api_access';

export interface PlanInfo {
  plan: PlanTier;
  max_units: number;
  current_units: number;
  max_properties: number;
  current_properties: number;
  subscription_status: string;
}

export interface FeatureInfo {
  feature_key: FeatureKey;
  enabled: boolean;
  source: 'plan' | 'override';
}

export interface PlanDetails {
  name: PlanTier;
  displayName: string;
  price: number;
  maxUnits: number;
  features: string[];
}

let planGatingRpcCheckEnabled = true;

const UNLIMITED_CAP = 999999;

// Plan configuration for UI display
export const PLAN_DETAILS: Record<PlanTier, PlanDetails> = {
  basic: {
    name: 'basic',
    displayName: 'Basic',
    price: 0,
    maxUnits: 10,
    features: [
      'Up to 10 properties',
      'Basic tenant screening',
      'Maintenance tracking',
      'Email support',
    ],
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    price: 10,
    maxUnits: 50,
    features: [
      'Up to 50 properties',
      'AI tenant screening',
      'Advanced analytics',
      'Automated rent collection',
      'Priority support',
    ],
  },
  premium: {
    name: 'premium',
    displayName: 'Premium',
    price: 20,
    maxUnits: UNLIMITED_CAP,
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

function normalizePlanTier(plan: string | null | undefined): PlanTier {
  if (plan === 'pro' || plan === 'premium') {
    return plan;
  }
  return 'basic';
}

async function getAccountPlanFromTables(accountId: string): Promise<PlanInfo | null> {
  const [{ data: account, error: accountError }, propertiesResult, unitsResult] = await Promise.all([
    supabase
      .from('accounts')
      .select('plan, max_units, max_properties, subscription_status')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    supabase
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
  ]);

  if (accountError || !account) {
    console.error('[Plan Gating] Account lookup failed:', accountError);
    return null;
  }

  const normalizedPlan = normalizePlanTier(account.plan as string | null | undefined);
  const fallbackMaxProperties =
    normalizedPlan === 'premium'
      ? UNLIMITED_CAP
      : normalizedPlan === 'pro'
        ? 50
        : 10;
  const fallbackMaxUnits =
    normalizedPlan === 'premium'
      ? UNLIMITED_CAP
      : normalizedPlan === 'pro'
        ? 50
        : 10;

  return {
    plan: normalizedPlan,
    max_units: Number(account.max_units ?? fallbackMaxUnits),
    current_units: unitsResult.count || 0,
    max_properties: Number(account.max_properties ?? fallbackMaxProperties),
    current_properties: propertiesResult.count || 0,
    subscription_status: account.subscription_status || 'active',
  };
}

// Feature to plan mapping for quick lookups
export const FEATURE_REQUIREMENTS: Record<FeatureKey, PlanTier> = {
  // Basic features
  tenant_portal: 'basic',
  basic_maintenance_requests: 'basic',
  property_management: 'basic',

  // Pro features
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

  // Premium features
  hvac_filter_program: 'premium',
  electronic_showings: 'premium',
  emergency_support_24_7: 'premium',
  advanced_exports: 'premium',
  custom_reports: 'premium',
  api_access: 'premium',
};

const ALL_FEATURES = Object.keys(FEATURE_REQUIREMENTS) as FeatureKey[];

async function getFeatureOverride(featureKey: FeatureKey): Promise<boolean | null> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      return null;
    }

    const { data, error } = await supabase
      .from('account_features')
      .select('enabled')
      .eq('account_id', accountId)
      .eq('feature_key', featureKey)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.enabled === true;
  } catch (error) {
    console.warn('[Plan Gating] Feature override lookup failed:', error);
    return null;
  }
}

function getFeaturesForPlan(plan: PlanTier): FeatureKey[] {
  const planRank: Record<PlanTier, number> = {
    basic: 1,
    pro: 2,
    premium: 3,
  };

  return ALL_FEATURES.filter((featureKey) => {
    return planRank[plan] >= planRank[FEATURE_REQUIREMENTS[featureKey]];
  });
}

// =====================================================
// CORE GATING FUNCTIONS
// =====================================================

/**
 * Check if the current user has access to a specific feature.
 * This calls the backend RPC function which enforces RLS.
 *
 * @param featureKey - The feature to check
 * @returns Promise<boolean> - true if user has access
 */
export async function hasFeature(featureKey: FeatureKey): Promise<boolean> {
  try {
    const override = await getFeatureOverride(featureKey);
    if (override !== null) {
      return override;
    }

    const requiredPlan = FEATURE_REQUIREMENTS[featureKey];
    return await hasPlanFallback(requiredPlan);
  } catch (err) {
    console.warn('[Plan Gating] Exception, falling back to plan check:', err);
    // Fallback: Check plan directly from accounts table
    const requiredPlan = FEATURE_REQUIREMENTS[featureKey];
    return await hasPlanFallback(requiredPlan);
  }
}

/**
 * Check if the current user's account meets the minimum plan tier requirement.
 *
 * @param requiredPlan - The minimum plan tier required
 * @returns Promise<boolean> - true if user meets or exceeds the plan requirement
 */
export async function hasPlan(requiredPlan: PlanTier): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('rpc_check_plan', {
      p_required_plan: requiredPlan,
    });

    if (error) {
      console.warn('[Plan Gating] RPC error, falling back to direct query:', error.message);
      return await hasPlanFallback(requiredPlan);
    }

    return data === true;
  } catch (err) {
    console.warn('[Plan Gating] Exception, falling back to direct query:', err);
    return await hasPlanFallback(requiredPlan);
  }
}

/**
 * Fallback function to check plan directly from accounts table
 * Used when RPC functions are not available
 */
async function hasPlanFallback(requiredPlan: PlanTier): Promise<boolean> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      console.error('[Plan Gating] Cannot resolve account for plan fallback');
      return false;
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('plan')
      .eq('id', accountId)
      .maybeSingle();

    if (accountError || !account) {
      console.error('[Plan Gating] Cannot fetch account plan:', accountError);
      return false;
    }

    const userPlan = account.plan as string;
    if (!userPlan) {
      console.error('[Plan Gating] No plan found for user');
      return false;
    }

    // Compare plan tiers
    const planRank: Record<string, number> = {
      basic: 1,
      pro: 2,
      premium: 3,
    };

    const userRank = planRank[userPlan] || 0;
    const requiredRank = planRank[requiredPlan] || 999;

    return userRank >= requiredRank;
  } catch (err) {
    console.error('[Plan Gating] Fallback check failed:', err);
    return false;
  }
}

/**
 * Require a specific feature. Throws an error if the user doesn't have access.
 * Use this in async operations that should fail if access is denied.
 *
 * @param featureKey - The feature to require
 * @throws Error if user doesn't have access
 */
export async function requireFeature(featureKey: FeatureKey): Promise<void> {
  const hasAccess = await hasFeature(featureKey);

  if (!hasAccess) {
    const requiredPlan = FEATURE_REQUIREMENTS[featureKey];
    throw new Error(
      `This feature requires the ${PLAN_DETAILS[requiredPlan].displayName} plan or higher.`
    );
  }
}

/**
 * Require a specific plan tier. Throws an error if the user doesn't meet the requirement.
 *
 * @param requiredPlan - The minimum plan tier required
 * @throws Error if user doesn't meet the plan requirement
 */
export async function requirePlan(requiredPlan: PlanTier): Promise<void> {
  const hasAccess = await hasPlan(requiredPlan);

  if (!hasAccess) {
    throw new Error(
      `This action requires the ${PLAN_DETAILS[requiredPlan].displayName} plan or higher.`
    );
  }
}

/**
 * Get all features available to the current user's account.
 * Returns both plan-based features and account-specific overrides.
 *
 * @returns Promise<FeatureInfo[]> - Array of features with their enabled status
 */
export async function getAccountFeatures(): Promise<FeatureInfo[]> {
  try {
    const planInfo = await getAccountPlan();
    if (!planInfo) {
      return [];
    }

    const baseFeatures = getFeaturesForPlan(planInfo.plan);
    const accountId = await getCurrentAccountId();

    if (!accountId) {
      return baseFeatures.map((feature_key) => ({
        feature_key,
        enabled: true,
        source: 'plan' as const,
      }));
    }

    const { data: overrides, error } = await supabase
      .from('account_features')
      .select('feature_key, enabled')
      .eq('account_id', accountId);

    if (error) {
      console.error('[Plan Gating] Error fetching feature overrides:', error);
    }

    const overrideMap = new Map(
      (overrides || []).map((override: any) => [override.feature_key as FeatureKey, override.enabled === true])
    );

    const mergedFeatures = new Set<FeatureKey>([
      ...baseFeatures,
      ...(Array.from(overrideMap.keys()) as FeatureKey[]),
    ]);

    return Array.from(mergedFeatures).map((feature_key) => {
      if (overrideMap.has(feature_key)) {
        return {
          feature_key,
          enabled: overrideMap.get(feature_key) === true,
          source: 'override' as const,
        };
      }

      return {
        feature_key,
        enabled: true,
        source: 'plan' as const,
      };
    });
  } catch (err) {
    console.error('[Plan Gating] Exception fetching features:', err);
    return [];
  }
}

/**
 * Get the current user's account plan information and usage stats.
 *
 * @returns Promise<PlanInfo | null> - Plan info or null if not found
 */
export async function getAccountPlan(): Promise<PlanInfo | null> {
  try {
    const accountId = await getCurrentAccountId();
    if (accountId) {
      const directPlan = await getAccountPlanFromTables(accountId);
      if (directPlan) {
        return directPlan;
      }
    }

    if (!planGatingRpcCheckEnabled) {
      return null;
    }

    const { data, error } = await supabase.rpc('rpc_get_account_plan');
    if (error) {
      console.warn('[Plan Gating] rpc_get_account_plan failed:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return {
      plan: normalizePlanTier(data[0].plan),
      max_units: Number(data[0].max_units ?? 0),
      current_units: Number(data[0].current_units ?? 0),
      max_properties: Number(data[0].max_properties ?? 0),
      current_properties: Number(data[0].current_properties ?? 0),
      subscription_status: data[0].subscription_status || 'active',
    };
  } catch (err) {
    console.error('[Plan Gating] Exception fetching plan:', err);
    return null;
  }
}

/**
 * Check if the account can add more units based on their plan limit.
 *
 * @returns Promise<boolean> - true if under the limit
 */
export async function canAddUnits(): Promise<boolean> {
  const planInfo = await getAccountPlan();

  if (!planInfo) {
    return false;
  }

  return planInfo.current_units < planInfo.max_units;
}

/**
 * Get the required plan tier for a specific feature.
 *
 * @param featureKey - The feature to check
 * @returns PlanTier - The minimum plan tier that includes this feature
 */
export function getRequiredPlan(featureKey: FeatureKey): PlanTier {
  return FEATURE_REQUIREMENTS[featureKey];
}

/**
 * Get display details for a plan tier.
 *
 * @param plan - The plan tier
 * @returns PlanDetails - Display information for the plan
 */
export function getPlanDetails(plan: PlanTier): PlanDetails {
  return PLAN_DETAILS[plan];
}

// =====================================================
// BATCH CHECKING (Performance Optimization)
// =====================================================

/**
 * Check multiple features at once. More efficient than individual calls.
 *
 * @param features - Array of feature keys to check
 * @returns Promise<Record<FeatureKey, boolean>> - Map of features to access status
 */
export async function hasFeatures(
  features: FeatureKey[]
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  // Get all account features in one call
  const accountFeatures = await getAccountFeatures();
  const enabledFeatures = new Set(
    accountFeatures.filter(f => f.enabled).map(f => f.feature_key)
  );

  // Check each requested feature
  for (const feature of features) {
    results[feature] = enabledFeatures.has(feature);
  }

  return results;
}

// =====================================================
// ERROR HANDLING
// =====================================================

export class PlanGatingError extends Error {
  constructor(
    message: string,
    public requiredPlan: PlanTier,
    public feature?: FeatureKey
  ) {
    super(message);
    this.name = 'PlanGatingError';
  }
}

/**
 * Wraps an async function with plan gating. If access is denied, throws PlanGatingError.
 *
 * @param requiredPlan - The minimum plan tier required
 * @param fn - The async function to wrap
 * @returns Wrapped function that checks plan access first
 */
export function withPlanGate<T extends any[], R>(
  requiredPlan: PlanTier,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const hasAccess = await hasPlan(requiredPlan);

    if (!hasAccess) {
      throw new PlanGatingError(
        `This action requires the ${PLAN_DETAILS[requiredPlan].displayName} plan or higher.`,
        requiredPlan
      );
    }

    return fn(...args);
  };
}

/**
 * Wraps an async function with feature gating. If access is denied, throws PlanGatingError.
 *
 * @param featureKey - The feature required
 * @param fn - The async function to wrap
 * @returns Wrapped function that checks feature access first
 */
export function withFeatureGate<T extends any[], R>(
  featureKey: FeatureKey,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const hasAccess = await hasFeature(featureKey);

    if (!hasAccess) {
      const requiredPlan = FEATURE_REQUIREMENTS[featureKey];
      throw new PlanGatingError(
        `This feature requires the ${PLAN_DETAILS[requiredPlan].displayName} plan or higher.`,
        requiredPlan,
        featureKey
      );
    }

    return fn(...args);
  };
}
