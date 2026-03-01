-- Plan Gating RPC Functions
-- These functions check if a user has access to features based on their plan

-- Function to check if user's account meets minimum plan requirement
CREATE OR REPLACE FUNCTION rpc_check_plan(p_required_plan TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_user_plan TEXT;
  v_plan_rank INTEGER;
  v_required_rank INTEGER;
BEGIN
  -- Get most recent active account membership
  SELECT am.account_id INTO v_account_id
  FROM account_members am
  WHERE am.user_id = auth.uid()
    AND am.is_active = true
  ORDER BY am.joined_at DESC NULLS LAST, am.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get the current account plan
  SELECT a.plan INTO v_user_plan
  FROM accounts a
  WHERE a.id = v_account_id;

  -- If no plan found, deny access
  IF v_user_plan IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Convert plans to ranks (higher number = better plan)
  v_plan_rank := CASE v_user_plan
    WHEN 'basic' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  v_required_rank := CASE p_required_plan
    WHEN 'basic' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    ELSE 999
  END;

  -- Return TRUE if user's plan rank meets or exceeds required rank
  RETURN v_plan_rank >= v_required_rank;
END;
$$;

-- Function to check if user has access to a specific feature
CREATE OR REPLACE FUNCTION rpc_check_feature(p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_override_enabled BOOLEAN;
  v_required_plan TEXT;
BEGIN
  -- Get most recent active account membership
  SELECT am.account_id INTO v_account_id
  FROM account_members am
  WHERE am.user_id = auth.uid()
    AND am.is_active = true
  ORDER BY am.joined_at DESC NULLS LAST, am.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Optional explicit feature override
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'account_features'
  ) THEN
    SELECT af.enabled INTO v_override_enabled
    FROM account_features af
    WHERE af.account_id = v_account_id
      AND af.feature_key = p_feature_key
    LIMIT 1;

    IF v_override_enabled IS NOT NULL THEN
      RETURN v_override_enabled;
    END IF;
  END IF;

  -- Map features to required plans
  v_required_plan := CASE p_feature_key
    -- Basic features (all plans)
    WHEN 'tenant_portal' THEN 'basic'
    WHEN 'basic_maintenance_requests' THEN 'basic'
    WHEN 'basic_rent_collection' THEN 'basic'
    WHEN 'property_management' THEN 'basic'

    -- Pro features
    WHEN 'tenant_screening' THEN 'pro'
    WHEN 'maintenance_routing' THEN 'pro'
    WHEN 'marketing_tools' THEN 'pro'
    WHEN 'standard_reporting' THEN 'pro'
    WHEN 'lease_renewals' THEN 'pro'
    WHEN 'communication_hub' THEN 'pro'

    -- Premium features
    WHEN 'ai_risk_scoring' THEN 'premium'
    WHEN 'integrated_accounting' THEN 'premium'
    WHEN 'hvac_filter_program' THEN 'premium'
    WHEN 'electronic_showings' THEN 'premium'
    WHEN 'emergency_support_24_7' THEN 'premium'
    WHEN 'advanced_analytics' THEN 'premium'
    WHEN 'advanced_exports' THEN 'premium'
    WHEN 'custom_reports' THEN 'premium'
    WHEN 'api_access' THEN 'premium'
    
    -- Unknown feature - deny by default
    ELSE 'premium'
  END;

  -- Check if user's plan meets the requirement
  RETURN rpc_check_plan(v_required_plan);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION rpc_check_plan(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_check_feature(TEXT) TO authenticated;

-- Function to return current account plan + usage with strict return typing
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
  v_account_id UUID;
BEGIN
  -- Get most recent active account membership
  SELECT am.account_id INTO v_account_id
  FROM account_members am
  WHERE am.user_id = auth.uid()
    AND am.is_active = true
  ORDER BY am.joined_at DESC NULLS LAST, am.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(a.plan, 'basic')::TEXT AS plan,
    COALESCE(a.max_units, 10)::INTEGER AS max_units,
    (SELECT COUNT(*)::INTEGER FROM units u WHERE u.account_id = v_account_id) AS current_units,
    COALESCE(a.max_properties, 10)::INTEGER AS max_properties,
    (SELECT COUNT(*)::INTEGER FROM properties p WHERE p.account_id = v_account_id) AS current_properties,
    COALESCE(a.subscription_status, 'active')::TEXT AS subscription_status
  FROM accounts a
  WHERE a.id = v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_account_plan() TO authenticated;
