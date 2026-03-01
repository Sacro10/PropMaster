-- Plan Gating SQL (tables + functions + RPCs)
-- Run this in Supabase SQL Editor for the target project.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Feature overrides per account
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, feature_key)
);

ALTER TABLE account_features ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_features' AND policyname = 'account_features_select'
  ) THEN
    CREATE POLICY account_features_select ON account_features FOR SELECT USING (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_features' AND policyname = 'account_features_insert'
  ) THEN
    CREATE POLICY account_features_insert ON account_features FOR INSERT WITH CHECK (has_account_role(account_id, 'owner') OR has_account_role(account_id, 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_features' AND policyname = 'account_features_update'
  ) THEN
    CREATE POLICY account_features_update ON account_features FOR UPDATE USING (has_account_role(account_id, 'owner') OR has_account_role(account_id, 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_features' AND policyname = 'account_features_delete'
  ) THEN
    CREATE POLICY account_features_delete ON account_features FOR DELETE USING (has_account_role(account_id, 'owner') OR has_account_role(account_id, 'admin'));
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Plan feature helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_plan_features(plan_name TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plan_name = 'basic' THEN
    RETURN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management'
    ];
  ELSIF plan_name = 'pro' THEN
    RETURN ARRAY[
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
    ];
  ELSIF plan_name = 'premium' THEN
    RETURN ARRAY[
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
    ];
  END IF;

  RETURN ARRAY[]::TEXT[];
END;
$$;

CREATE OR REPLACE FUNCTION has_plan(account_uuid UUID, required_plan TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_plan TEXT;
  current_rank INTEGER;
  required_rank INTEGER;
BEGIN
  SELECT plan INTO current_plan FROM accounts WHERE id = account_uuid;

  current_rank := CASE current_plan
    WHEN 'basic' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  required_rank := CASE required_plan
    WHEN 'basic' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  RETURN current_rank >= required_rank;
END;
$$;

CREATE OR REPLACE FUNCTION has_feature(account_uuid UUID, p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_name TEXT;
  override_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO override_enabled
  FROM account_features
  WHERE account_id = account_uuid
    AND feature_key = p_feature_key
  LIMIT 1;

  IF override_enabled IS NOT NULL THEN
    RETURN override_enabled;
  END IF;

  SELECT plan INTO plan_name FROM accounts WHERE id = account_uuid;
  RETURN p_feature_key = ANY(get_plan_features(plan_name));
END;
$$;

CREATE OR REPLACE FUNCTION check_unit_limit(account_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_units INTEGER;
  current_units INTEGER;
BEGIN
  SELECT max_units INTO max_units FROM accounts WHERE id = account_uuid;
  SELECT COUNT(*) INTO current_units FROM units WHERE account_id = account_uuid;
  RETURN current_units < max_units;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPCs for frontend
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_feature(p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_uuid UUID;
BEGIN
  SELECT account_id INTO account_uuid
  FROM account_members
  WHERE user_id = auth.uid()
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF account_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN has_feature(account_uuid, p_feature_key);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_check_plan(p_required_plan TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_uuid UUID;
BEGIN
  SELECT account_id INTO account_uuid
  FROM account_members
  WHERE user_id = auth.uid()
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF account_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN has_plan(account_uuid, p_required_plan);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_get_account_features()
RETURNS TABLE (
  feature_key TEXT,
  enabled BOOLEAN,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_uuid UUID;
  plan_name TEXT;
BEGIN
  SELECT account_id INTO account_uuid
  FROM account_members
  WHERE user_id = auth.uid()
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF account_uuid IS NULL THEN
    RETURN;
  END IF;

  SELECT plan INTO plan_name FROM accounts WHERE id = account_uuid;

  RETURN QUERY
  SELECT
    f.feature_key,
    f.enabled,
    'override'::TEXT AS source
  FROM account_features f
  WHERE f.account_id = account_uuid

  UNION

  SELECT
    pf.feature_key,
    TRUE AS enabled,
    'plan'::TEXT AS source
  FROM unnest(get_plan_features(plan_name)) AS pf(feature_key)
  WHERE NOT EXISTS (
    SELECT 1 FROM account_features f
    WHERE f.account_id = account_uuid
      AND f.feature_key = pf.feature_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_get_account_plan()
RETURNS TABLE (
  plan TEXT,
  max_units INTEGER,
  current_units INTEGER,
  max_properties INTEGER,
  current_properties INTEGER,
  subscription_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_uuid UUID;
BEGIN
  SELECT account_id INTO account_uuid
  FROM account_members
  WHERE user_id = auth.uid()
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF account_uuid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(a.plan, 'basic')::TEXT AS plan,
    COALESCE(a.max_units, 10)::INTEGER AS max_units,
    (SELECT COUNT(*)::INTEGER FROM units u WHERE u.account_id = account_uuid) AS current_units,
    COALESCE(a.max_properties, 10)::INTEGER AS max_properties,
    (SELECT COUNT(*)::INTEGER FROM properties p WHERE p.account_id = account_uuid) AS current_properties,
    COALESCE(a.subscription_status, 'active')::TEXT AS subscription_status
  FROM accounts a
  WHERE a.id = account_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_feature(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_check_plan(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_account_features() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_account_plan() TO authenticated;
