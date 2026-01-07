/**
 * Plan Gating System - Backend Helpers
 *
 * This module provides utilities for enforcing plan-based entitlements
 * and feature access in the frontend. All checks ultimately defer to
 * backend RLS policies and SQL functions for security.
 */

import { supabase } from './supabaseClient';

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

// Plan configuration for UI display
export const PLAN_DETAILS: Record<PlanTier, PlanDetails> = {
  basic: {
    name: 'basic',
    displayName: 'Basic',
    price: 0,
    maxUnits: 3,
    features: [
      'Up to 3 units',
      'Tenant portal',
      'Basic maintenance requests',
      'Limited rent collection',
    ],
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    price: 10,
    maxUnits: 100,
    features: [
      'Up to 100 units',
      'Tenant screening',
      'Maintenance routing',
      'Marketing tools',
      'Standard reporting',
      'Lease renewals',
      'Communication hub',
    ],
  },
  premium: {
    name: 'premium',
    displayName: 'Premium',
    price: 20,
    maxUnits: 999999,
    features: [
      'Unlimited units',
      'AI risk scoring',
      'Integrated accounting',
      'HVAC filter program',
      'Electronic showings',
      '24/7 emergency support',
      'Advanced analytics & exports',
      'Custom reports',
      'API access',
    ],
  },
};

// Feature to plan mapping for quick lookups
export const FEATURE_REQUIREMENTS: Record<FeatureKey, PlanTier> = {
  // Basic features
  tenant_portal: 'basic',
  basic_maintenance_requests: 'basic',
  basic_rent_collection: 'basic',
  property_management: 'basic',

  // Pro features
  tenant_screening: 'pro',
  maintenance_routing: 'pro',
  marketing_tools: 'pro',
  standard_reporting: 'pro',
  lease_renewals: 'pro',
  communication_hub: 'pro',

  // Premium features
  ai_risk_scoring: 'premium',
  integrated_accounting: 'premium',
  hvac_filter_program: 'premium',
  electronic_showings: 'premium',
  emergency_support_24_7: 'premium',
  advanced_analytics: 'premium',
  advanced_exports: 'premium',
  custom_reports: 'premium',
  api_access: 'premium',
};

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
    const { data, error } = await supabase.rpc('rpc_check_feature', {
      p_feature_key: featureKey,
    });

    if (error) {
      console.error('[Plan Gating] Error checking feature:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[Plan Gating] Exception checking feature:', err);
    return false;
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
      console.error('[Plan Gating] Error checking plan:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[Plan Gating] Exception checking plan:', err);
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
    const { data, error } = await supabase.rpc('rpc_get_account_features');

    if (error) {
      console.error('[Plan Gating] Error fetching features:', error);
      return [];
    }

    return data || [];
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
    const { data, error } = await supabase.rpc('rpc_get_account_plan');

    if (error) {
      console.error('[Plan Gating] Error fetching plan:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
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
