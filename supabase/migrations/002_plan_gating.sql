-- Migration: Plan Gating System
-- Description: Implements feature flags and entitlement enforcement for Basic/Pro/Premium tiers
-- Created: 2026-01-07

-- =====================================================
-- 1. ACCOUNT_FEATURES TABLE
-- =====================================================
-- Stores feature flags for each account (optional overrides)
-- If a feature is not in this table, it's computed from the plan

CREATE TABLE IF NOT EXISTS account_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, feature_key)
);

CREATE INDEX idx_account_features_account ON account_features(account_id);
CREATE INDEX idx_account_features_key ON account_features(feature_key);

-- Auto-update timestamp trigger
CREATE TRIGGER set_account_features_updated_at
  BEFORE UPDATE ON account_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. PLAN FEATURE DEFINITIONS
-- =====================================================
-- Define which features are available in each plan

CREATE TYPE plan_tier AS ENUM ('basic', 'pro', 'premium');

-- Helper function to get all features for a plan
CREATE OR REPLACE FUNCTION get_plan_features(plan_name TEXT)
RETURNS TEXT[] AS $$
BEGIN
  RETURN CASE plan_name
    -- BASIC (FREE): up to 3 units; portal; basic maintenance request submission; limited rent collection
    WHEN 'basic' THEN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management'
    ]

    -- PRO ($10/mo): tenant screening; maintenance routing; marketing tools; standard reporting; lease renewals
    WHEN 'pro' THEN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management',
      'tenant_screening',
      'maintenance_routing',
      'marketing_tools',
      'standard_reporting',
      'lease_renewals',
      'communication_hub'
    ]

    -- PREMIUM ($20/mo): AI risk scoring; integrated accounting; HVAC filter program;
    -- electronic showings; 24/7 emergency support; advanced analytics/exports
    WHEN 'premium' THEN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management',
      'tenant_screening',
      'maintenance_routing',
      'marketing_tools',
      'standard_reporting',
      'lease_renewals',
      'communication_hub',
      'ai_risk_scoring',
      'integrated_accounting',
      'hvac_filter_program',
      'electronic_showings',
      'emergency_support_24_7',
      'advanced_analytics',
      'advanced_exports',
      'custom_reports',
      'api_access'
    ]

    ELSE ARRAY[]::TEXT[]
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 3. FEATURE ENTITLEMENT CHECK FUNCTION
-- =====================================================
-- Checks if an account has access to a specific feature
-- Priority: account_features override > plan-based features

CREATE OR REPLACE FUNCTION has_feature(
  p_account_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_plan TEXT;
  v_override_enabled BOOLEAN;
  v_plan_features TEXT[];
BEGIN
  -- First check for explicit override in account_features
  SELECT enabled INTO v_override_enabled
  FROM account_features
  WHERE account_id = p_account_id
    AND feature_key = p_feature_key;

  IF FOUND THEN
    RETURN v_override_enabled;
  END IF;

  -- If no override, check plan-based features
  SELECT plan INTO v_account_plan
  FROM accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_plan_features := get_plan_features(v_account_plan);
  RETURN p_feature_key = ANY(v_plan_features);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- 4. PLAN REQUIREMENT CHECK FUNCTION
-- =====================================================
-- Checks if an account meets the minimum plan tier requirement

CREATE OR REPLACE FUNCTION has_plan(
  p_account_id UUID,
  p_required_plan TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_plan TEXT;
  v_plan_rank INT;
  v_required_rank INT;
BEGIN
  -- Get account's current plan
  SELECT plan INTO v_account_plan
  FROM accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Assign numeric ranks to plans for comparison
  v_plan_rank := CASE v_account_plan
    WHEN 'basic' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  v_required_rank := CASE p_required_plan
    WHEN 'basic' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  RETURN v_plan_rank >= v_required_rank;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- 5. UNIT LIMIT CHECK FUNCTION
-- =====================================================
-- Validates unit count against plan limits

CREATE OR REPLACE FUNCTION check_unit_limit(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan TEXT;
  v_unit_count INT;
  v_max_units INT;
BEGIN
  -- Get account plan and current unit count
  SELECT a.plan, COUNT(u.id)
  INTO v_plan, v_unit_count
  FROM accounts a
  LEFT JOIN properties p ON p.account_id = a.id
  LEFT JOIN units u ON u.property_id = p.id
  WHERE a.id = p_account_id
  GROUP BY a.plan;

  -- Get max units for plan
  v_max_units := CASE v_plan
    WHEN 'basic' THEN 3
    WHEN 'pro' THEN 100
    WHEN 'premium' THEN 999999
    ELSE 0
  END;

  RETURN COALESCE(v_unit_count, 0) < v_max_units;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- 6. RPC FUNCTIONS FOR FRONTEND
-- =====================================================
-- These are callable from the frontend via supabase.rpc()

-- Check feature access (RPC endpoint)
CREATE OR REPLACE FUNCTION rpc_check_feature(p_feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Get user's account_id from account_members
  SELECT account_id INTO v_account_id
  FROM account_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN has_feature(v_account_id, p_feature_key);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check plan access (RPC endpoint)
CREATE OR REPLACE FUNCTION rpc_check_plan(p_required_plan TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Get user's account_id from account_members
  SELECT account_id INTO v_account_id
  FROM account_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN has_plan(v_account_id, p_required_plan);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get all features for current user's account
CREATE OR REPLACE FUNCTION rpc_get_account_features()
RETURNS TABLE(
  feature_key TEXT,
  enabled BOOLEAN,
  source TEXT
) AS $$
DECLARE
  v_account_id UUID;
  v_plan TEXT;
  v_plan_features TEXT[];
  v_feature TEXT;
BEGIN
  -- Get user's account_id and plan
  SELECT am.account_id, a.plan INTO v_account_id, v_plan
  FROM account_members am
  JOIN accounts a ON a.id = am.account_id
  WHERE am.user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Return overrides from account_features
  RETURN QUERY
  SELECT af.feature_key, af.enabled, 'override'::TEXT as source
  FROM account_features af
  WHERE af.account_id = v_account_id;

  -- Return plan-based features (exclude already overridden)
  v_plan_features := get_plan_features(v_plan);

  FOREACH v_feature IN ARRAY v_plan_features LOOP
    IF NOT EXISTS (
      SELECT 1 FROM account_features
      WHERE account_id = v_account_id AND feature_key = v_feature
    ) THEN
      feature_key := v_feature;
      enabled := true;
      source := 'plan';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get account plan info
CREATE OR REPLACE FUNCTION rpc_get_account_plan()
RETURNS TABLE(
  plan TEXT,
  max_units INT,
  current_units INT,
  max_properties INT,
  current_properties INT,
  subscription_status TEXT
) AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Get user's account_id
  SELECT account_id INTO v_account_id
  FROM account_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.plan,
    a.max_units,
    (SELECT COUNT(*)::INT FROM units u
     JOIN properties p ON p.id = u.property_id
     WHERE p.account_id = a.id) as current_units,
    a.max_properties,
    (SELECT COUNT(*)::INT FROM properties WHERE account_id = a.id) as current_properties,
    a.subscription_status
  FROM accounts a
  WHERE a.id = v_account_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- 7. RLS POLICIES FOR FEATURE ENFORCEMENT
-- =====================================================

-- Enable RLS on account_features
ALTER TABLE account_features ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their account's features
CREATE POLICY account_features_select_policy ON account_features
  FOR SELECT
  USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Only account owners can modify features
CREATE POLICY account_features_modify_policy ON account_features
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM account_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- =====================================================
-- 8. UPDATE EXISTING RLS POLICIES WITH PLAN CHECKS
-- =====================================================

-- Drop and recreate tenant_profiles policies with plan gating
DROP POLICY IF EXISTS tenant_profiles_insert_policy ON tenant_profiles;
DROP POLICY IF EXISTS tenant_profiles_select_policy ON tenant_profiles;

-- Only allow tenant screening if account has the feature
CREATE POLICY tenant_profiles_select_policy ON tenant_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM account_members am
      JOIN properties p ON p.account_id = am.account_id
      JOIN units u ON u.property_id = p.id
      JOIN leases l ON l.unit_id = u.id
      JOIN lease_tenants lt ON lt.lease_id = l.id
      WHERE am.user_id = auth.uid()
        AND lt.tenant_user_id = tenant_profiles.id
    )
    OR
    id = auth.uid()
  );

CREATE POLICY tenant_profiles_insert_policy ON tenant_profiles
  FOR INSERT
  WITH CHECK (
    has_feature(
      (SELECT account_id FROM account_members WHERE user_id = auth.uid() LIMIT 1),
      'tenant_screening'
    )
  );

-- Update HVAC filter subscription policies to require premium plan
DROP POLICY IF EXISTS hvac_filter_subscriptions_insert_policy ON hvac_filter_subscriptions;

CREATE POLICY hvac_filter_subscriptions_insert_policy ON hvac_filter_subscriptions
  FOR INSERT
  WITH CHECK (
    unit_id IN (
      SELECT u.id FROM units u
      JOIN properties p ON p.id = u.property_id
      JOIN account_members am ON am.account_id = p.account_id
      WHERE am.user_id = auth.uid()
        AND has_feature(p.account_id, 'hvac_filter_program')
    )
  );

-- Update showings policies to require premium plan
DROP POLICY IF EXISTS showings_insert_policy ON showings;

CREATE POLICY showings_insert_policy ON showings
  FOR INSERT
  WITH CHECK (
    unit_id IN (
      SELECT u.id FROM units u
      JOIN properties p ON p.id = u.property_id
      JOIN account_members am ON am.account_id = p.account_id
      WHERE am.user_id = auth.uid()
        AND has_feature(p.account_id, 'electronic_showings')
    )
  );

-- Update analytics_events to enforce advanced_analytics feature
DROP POLICY IF EXISTS analytics_events_insert_policy ON analytics_events;

CREATE POLICY analytics_events_insert_policy ON analytics_events
  FOR INSERT
  WITH CHECK (
    -- Basic analytics always allowed, advanced features gated
    event_type NOT IN ('export_data', 'custom_report', 'api_call')
    OR
    has_feature(
      (SELECT account_id FROM account_members WHERE user_id = auth.uid() LIMIT 1),
      'advanced_analytics'
    )
  );

-- =====================================================
-- 9. COMMENTS & DOCUMENTATION
-- =====================================================

COMMENT ON TABLE account_features IS 'Feature flag overrides for accounts. If not present, features are computed from plan.';
COMMENT ON FUNCTION has_feature IS 'Checks if account has access to a feature. Priority: override > plan-based.';
COMMENT ON FUNCTION has_plan IS 'Checks if account meets minimum plan tier requirement.';
COMMENT ON FUNCTION get_plan_features IS 'Returns array of features available in a plan tier.';
COMMENT ON FUNCTION rpc_check_feature IS 'RPC: Check if current user has access to a feature.';
COMMENT ON FUNCTION rpc_check_plan IS 'RPC: Check if current user meets minimum plan tier.';
COMMENT ON FUNCTION rpc_get_account_features IS 'RPC: Get all features for current user account.';
COMMENT ON FUNCTION rpc_get_account_plan IS 'RPC: Get plan details and usage stats for current user.';
