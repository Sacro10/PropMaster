/**
 * React Hooks for Plan Gating
 *
 * Provides React hooks for checking feature access and plan tiers
 * in components. These hooks cache results and automatically update
 * when the user's plan changes.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  hasFeature,
  hasPlan,
  getAccountFeatures,
  getAccountPlan,
  type FeatureKey,
  type PlanTier,
  type PlanInfo,
  type FeatureInfo,
} from '../../lib/planGating';

// =====================================================
// FEATURE CHECKING HOOKS
// =====================================================

/**
 * Hook to check if the current user has access to a specific feature.
 *
 * @param featureKey - The feature to check
 * @returns { hasAccess: boolean, loading: boolean, refetch: () => void }
 */
export function useHasFeature(featureKey: FeatureKey) {
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const checkFeature = useCallback(async () => {
    setLoading(true);
    try {
      const access = await hasFeature(featureKey);
      setHasAccess(access);
    } catch (error) {
      console.error('[useHasFeature] Error:', error);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [featureKey]);

  useEffect(() => {
    checkFeature();
  }, [checkFeature]);

  return {
    hasAccess,
    loading,
    refetch: checkFeature,
  };
}

/**
 * Hook to check if the current user meets a minimum plan tier requirement.
 *
 * @param requiredPlan - The minimum plan tier required
 * @returns { hasAccess: boolean, loading: boolean, refetch: () => void }
 */
export function useHasPlan(requiredPlan: PlanTier) {
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const checkPlan = useCallback(async () => {
    setLoading(true);
    try {
      const access = await hasPlan(requiredPlan);
      setHasAccess(access);
    } catch (error) {
      console.error('[useHasPlan] Error:', error);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [requiredPlan]);

  useEffect(() => {
    checkPlan();
  }, [checkPlan]);

  return {
    hasAccess,
    loading,
    refetch: checkPlan,
  };
}

/**
 * Hook to check multiple features at once.
 *
 * @param featureKeys - Array of features to check
 * @returns { features: Record<string, boolean>, loading: boolean, refetch: () => void }
 */
export function useHasFeatures(featureKeys: FeatureKey[]) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const checkFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const accountFeatures = await getAccountFeatures();
      const enabledFeatures = new Set(
        accountFeatures.filter(f => f.enabled).map(f => f.feature_key)
      );

      const results: Record<string, boolean> = {};
      for (const key of featureKeys) {
        results[key] = enabledFeatures.has(key);
      }

      setFeatures(results);
    } catch (error) {
      console.error('[useHasFeatures] Error:', error);
      setFeatures({});
    } finally {
      setLoading(false);
    }
  }, [featureKeys.join(',')]); // Depend on serialized keys

  useEffect(() => {
    checkFeatures();
  }, [checkFeatures]);

  return {
    features,
    loading,
    refetch: checkFeatures,
  };
}

// =====================================================
// ACCOUNT INFO HOOKS
// =====================================================

/**
 * Hook to get all features available to the current account.
 *
 * @returns { features: FeatureInfo[], loading: boolean, refetch: () => void }
 */
export function useAccountFeatures() {
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAccountFeatures();
      setFeatures(data);
    } catch (error) {
      console.error('[useAccountFeatures] Error:', error);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  return {
    features,
    loading,
    refetch: fetchFeatures,
  };
}

/**
 * Hook to get the current account's plan information and usage stats.
 *
 * @returns { plan: PlanInfo | null, loading: boolean, refetch: () => void }
 */
export function useAccountPlan() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAccountPlan();
      setPlan(data);
    } catch (error) {
      console.error('[useAccountPlan] Error:', error);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Derived values for convenience
  const canAddUnits = plan
    ? plan.current_units < plan.max_units
    : false;

  const canAddProperties = plan
    ? plan.current_properties < plan.max_properties
    : false;

  const isAtUnitLimit = plan
    ? plan.current_units >= plan.max_units
    : true;

  const isAtPropertyLimit = plan
    ? plan.current_properties >= plan.max_properties
    : true;

  return {
    plan,
    loading,
    refetch: fetchPlan,
    // Derived helpers
    canAddUnits,
    canAddProperties,
    isAtUnitLimit,
    isAtPropertyLimit,
  };
}

// =====================================================
// FEATURE GATE COMPONENT WRAPPER HOOK
// =====================================================

/**
 * Hook to gate a component based on feature access.
 * Returns a render prop pattern for conditional rendering.
 *
 * @param featureKey - The feature required to render content
 * @returns {
 *   hasAccess: boolean,
 *   loading: boolean,
 *   FeatureGate: Component that renders children if access granted
 * }
 */
export function useFeatureGate(featureKey: FeatureKey) {
  const { hasAccess, loading, refetch } = useHasFeature(featureKey);

  return {
    hasAccess,
    loading,
    refetch,
  };
}

/**
 * Hook to gate a component based on plan tier.
 *
 * @param requiredPlan - The minimum plan tier required
 * @returns {
 *   hasAccess: boolean,
 *   loading: boolean,
 *   PlanGate: Component that renders children if access granted
 * }
 */
export function usePlanGate(requiredPlan: PlanTier) {
  const { hasAccess, loading, refetch } = useHasPlan(requiredPlan);

  return {
    hasAccess,
    loading,
    refetch,
  };
}

// =====================================================
// UTILITY HOOKS
// =====================================================

/**
 * Hook to get the percentage of plan usage (units).
 *
 * @returns { percentage: number, loading: boolean }
 */
export function useUnitUsagePercentage() {
  const { plan, loading } = useAccountPlan();

  const percentage = plan && plan.max_units > 0
    ? Math.round((plan.current_units / plan.max_units) * 100)
    : 0;

  return {
    percentage,
    loading,
    current: plan?.current_units || 0,
    max: plan?.max_units || 0,
  };
}

/**
 * Hook to get the percentage of plan usage (properties).
 *
 * @returns { percentage: number, loading: boolean }
 */
export function usePropertyUsagePercentage() {
  const { plan, loading } = useAccountPlan();

  const percentage = plan && plan.max_properties > 0
    ? Math.round((plan.current_properties / plan.max_properties) * 100)
    : 0;

  return {
    percentage,
    loading,
    current: plan?.current_properties || 0,
    max: plan?.max_properties || 0,
  };
}
