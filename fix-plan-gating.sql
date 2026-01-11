-- Plan Gating RPC Functions
-- These functions check if a user has access to features based on their plan

-- Function to check if user's account meets minimum plan requirement
CREATE OR REPLACE FUNCTION rpc_check_plan(p_required_plan TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_plan TEXT;
  v_plan_rank INTEGER;
  v_required_rank INTEGER;
BEGIN
  -- Get the current user's account plan
  SELECT a.plan INTO v_user_plan
  FROM accounts a
  JOIN account_members am ON am.account_id = a.id
  WHERE am.user_id = auth.uid()
  LIMIT 1;

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
AS $$
DECLARE
  v_user_plan TEXT;
  v_required_plan TEXT;
BEGIN
  -- Get the current user's account plan
  SELECT a.plan INTO v_user_plan
  FROM accounts a
  JOIN account_members am ON am.account_id = a.id
  WHERE am.user_id = auth.uid()
  LIMIT 1;

  -- If no plan found, deny access
  IF v_user_plan IS NULL THEN
    RETURN FALSE;
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
