-- Migration 004: Maintenance & HVAC Feature Enhancements
-- Adds vendor directory, assignment tracking, emergency support, and HVAC batch management

-- ============================================================================
-- 1. VENDOR/TECHNICIAN DIRECTORY TABLES
-- ============================================================================

-- Vendor profiles table (already exists in complete_schema, ensure it has needed fields)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_profiles') THEN
    CREATE TABLE vendor_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      specialties TEXT[] DEFAULT '{}', -- e.g., ['plumbing', 'electrical', 'hvac']
      service_radius_miles INTEGER DEFAULT 25,
      hourly_rate NUMERIC(10, 2),
      avg_rating NUMERIC(3, 2) DEFAULT 0,
      total_jobs_completed INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      on_call_24_7 BOOLEAN DEFAULT false,
      insurance_expiry DATE,
      license_number TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_vendor_profiles_account ON vendor_profiles(account_id);
    CREATE INDEX idx_vendor_profiles_specialties ON vendor_profiles USING GIN(specialties);
    CREATE INDEX idx_vendor_profiles_active ON vendor_profiles(account_id, is_active);

    ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY vendor_profiles_select ON vendor_profiles FOR SELECT USING (is_account_member(account_id));
    CREATE POLICY vendor_profiles_insert ON vendor_profiles FOR INSERT WITH CHECK (is_account_member(account_id));
    CREATE POLICY vendor_profiles_update ON vendor_profiles FOR UPDATE USING (is_account_member(account_id));
  END IF;
END $$;

-- Maintenance assignments table (track vendor assignments)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'maintenance_assignments') THEN
    CREATE TABLE maintenance_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
      vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      declined_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      estimated_arrival TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_maintenance_assignments_account ON maintenance_assignments(account_id);
    CREATE INDEX idx_maintenance_assignments_request ON maintenance_assignments(request_id);
    CREATE INDEX idx_maintenance_assignments_vendor ON maintenance_assignments(vendor_profile_id);
    CREATE INDEX idx_maintenance_assignments_status ON maintenance_assignments(status);

    ALTER TABLE maintenance_assignments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY maintenance_assignments_select ON maintenance_assignments FOR SELECT USING (is_account_member(account_id));
    CREATE POLICY maintenance_assignments_insert ON maintenance_assignments FOR INSERT WITH CHECK (is_account_member(account_id));
    CREATE POLICY maintenance_assignments_update ON maintenance_assignments FOR UPDATE USING (is_account_member(account_id));
  END IF;
END $$;

-- ============================================================================
-- 2. MAINTENANCE REQUEST ENHANCEMENTS
-- ============================================================================

-- Add fields to maintenance_requests if they don't exist
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS eta_hours INTEGER;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false;

-- Update priority check constraint to include 'emergency'
ALTER TABLE maintenance_requests DROP CONSTRAINT IF EXISTS maintenance_requests_priority_check;
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'emergency'));

-- Create index for emergency requests
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_emergency ON maintenance_requests(account_id, is_emergency, requested_at DESC);

-- ============================================================================
-- 3. SLA CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'emergency')),
  response_time_hours INTEGER NOT NULL, -- Time to acknowledge/assign
  resolution_time_hours INTEGER NOT NULL, -- Time to complete
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, priority)
);

CREATE INDEX idx_sla_rules_account ON maintenance_sla_rules(account_id);

ALTER TABLE maintenance_sla_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY maintenance_sla_rules_select ON maintenance_sla_rules FOR SELECT USING (is_account_member(account_id));

-- Insert default SLA rules
INSERT INTO maintenance_sla_rules (account_id, priority, response_time_hours, resolution_time_hours)
SELECT
  id as account_id,
  unnest(ARRAY['emergency', 'urgent', 'high', 'normal', 'low']) as priority,
  unnest(ARRAY[1, 4, 8, 24, 72]) as response_time_hours,
  unnest(ARRAY[4, 24, 72, 168, 336]) as resolution_time_hours
FROM accounts
ON CONFLICT (account_id, priority) DO NOTHING;

-- ============================================================================
-- 4. EMERGENCY SUPPORT CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergency_support_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  on_call_vendor_ids UUID[] DEFAULT '{}',
  notification_phone TEXT,
  notification_email TEXT,
  notification_sms_enabled BOOLEAN DEFAULT true,
  notification_email_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

CREATE INDEX idx_emergency_config_account ON emergency_support_config(account_id);

ALTER TABLE emergency_support_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY emergency_support_config_select ON emergency_support_config FOR SELECT USING (is_account_member(account_id));

-- Initialize emergency support config for all accounts
INSERT INTO emergency_support_config (account_id, is_enabled)
SELECT id, (plan = 'premium')
FROM accounts
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================================
-- 5. HVAC PROGRAM ENHANCEMENTS
-- ============================================================================

-- Rename old tables to new naming convention (if they exist)
DO $$ BEGIN
  -- Rename hvac_filter_subscriptions to hvac_program_enrollments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hvac_filter_subscriptions') AND
     NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hvac_program_enrollments') THEN
    ALTER TABLE hvac_filter_subscriptions RENAME TO hvac_program_enrollments;
  END IF;

  -- Rename hvac_filter_deliveries to hvac_delivery_schedules
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hvac_filter_deliveries') AND
     NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hvac_delivery_schedules') THEN
    ALTER TABLE hvac_filter_deliveries RENAME TO hvac_delivery_schedules;
  END IF;
END $$;

-- Ensure hvac_program_enrollments has needed columns
ALTER TABLE hvac_program_enrollments ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- Ensure hvac_delivery_schedules has batch_id
ALTER TABLE hvac_delivery_schedules ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES hvac_delivery_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hvac_delivery_schedules_batch ON hvac_delivery_schedules(batch_id);

-- ============================================================================
-- 6. FUNCTIONS FOR MAINTENANCE ROUTING
-- ============================================================================

-- Function to calculate ETA based on SLA rules and priority
CREATE OR REPLACE FUNCTION calculate_maintenance_eta(
  p_account_id UUID,
  p_priority TEXT,
  p_requested_at TIMESTAMPTZ
)
RETURNS INTEGER AS $$
DECLARE
  v_response_hours INTEGER;
BEGIN
  -- Get SLA response time for priority
  SELECT response_time_hours INTO v_response_hours
  FROM maintenance_sla_rules
  WHERE account_id = p_account_id AND priority = p_priority;

  -- Default to 24 hours if no SLA rule found
  IF v_response_hours IS NULL THEN
    v_response_hours := 24;
  END IF;

  RETURN v_response_hours;
END;
$$ LANGUAGE plpgsql;

-- Function to find available vendors for a request
CREATE OR REPLACE FUNCTION find_available_vendors(
  p_account_id UUID,
  p_category TEXT,
  p_property_zip TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  vendor_id UUID,
  business_name TEXT,
  distance_score INTEGER,
  rating NUMERIC,
  jobs_completed INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id as vendor_id,
    vp.business_name,
    -- Simple distance score based on zip code match (stub implementation)
    CASE
      WHEN vp.zip = p_property_zip THEN 1
      ELSE 2
    END as distance_score,
    vp.avg_rating as rating,
    vp.total_jobs_completed as jobs_completed
  FROM vendor_profiles vp
  WHERE vp.account_id = p_account_id
    AND vp.is_active = true
    AND (p_category = ANY(vp.specialties) OR 'general' = ANY(vp.specialties))
  ORDER BY
    distance_score ASC,
    vp.avg_rating DESC,
    vp.total_jobs_completed DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-assign maintenance request
CREATE OR REPLACE FUNCTION auto_assign_maintenance_request(
  p_request_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_request RECORD;
  v_vendor RECORD;
  v_assignment_id UUID;
BEGIN
  -- Get request details
  SELECT
    mr.account_id,
    mr.category,
    mr.priority,
    mr.requested_at,
    p.zip
  INTO v_request
  FROM maintenance_requests mr
  JOIN units u ON mr.unit_id = u.id
  JOIN properties p ON u.property_id = p.id
  WHERE mr.id = p_request_id;

  -- Find best available vendor
  SELECT vendor_id INTO v_vendor
  FROM find_available_vendors(
    v_request.account_id,
    v_request.category,
    v_request.zip,
    1
  )
  LIMIT 1;

  -- If vendor found, create assignment
  IF v_vendor.vendor_id IS NOT NULL THEN
    INSERT INTO maintenance_assignments (
      account_id,
      request_id,
      vendor_profile_id,
      status,
      assigned_at
    ) VALUES (
      v_request.account_id,
      p_request_id,
      v_vendor.vendor_id,
      'pending',
      NOW()
    ) RETURNING id INTO v_assignment_id;

    -- Update request status and ETA
    UPDATE maintenance_requests
    SET
      status = 'assigned',
      assigned_at = NOW(),
      eta_hours = calculate_maintenance_eta(v_request.account_id, v_request.priority, v_request.requested_at)
    WHERE id = p_request_id;

    -- Log activity
    PERFORM log_activity_event(
      v_request.account_id,
      'maintenance_assigned',
      'maintenance_request',
      p_request_id,
      'Maintenance request auto-assigned to vendor',
      jsonb_build_object('vendor_id', v_vendor.vendor_id, 'auto_assigned', true)
    );

    RETURN v_assignment_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Trigger to auto-create SLA metric record when maintenance request is created
CREATE OR REPLACE FUNCTION create_sla_metric_for_request()
RETURNS TRIGGER AS $$
DECLARE
  v_sla_rule RECORD;
BEGIN
  -- Get SLA rules for this priority
  SELECT * INTO v_sla_rule
  FROM maintenance_sla_rules
  WHERE account_id = NEW.account_id AND priority = NEW.priority;

  -- Create SLA metric record
  IF v_sla_rule.id IS NOT NULL THEN
    INSERT INTO maintenance_sla_metrics (
      account_id,
      maintenance_request_id,
      priority,
      target_response_hours,
      target_resolution_hours
    ) VALUES (
      NEW.account_id,
      NEW.id,
      NEW.priority,
      v_sla_rule.response_time_hours,
      v_sla_rule.resolution_time_hours
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_sla_metric_on_request
  AFTER INSERT ON maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION create_sla_metric_for_request();

-- Trigger to update SLA metrics when request status changes
CREATE OR REPLACE FUNCTION update_sla_metrics_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_response_hours NUMERIC;
  v_resolution_hours NUMERIC;
BEGIN
  -- Calculate response time when first assigned
  IF NEW.status = 'assigned' AND OLD.status != 'assigned' AND NEW.assigned_at IS NOT NULL THEN
    v_response_hours := EXTRACT(EPOCH FROM (NEW.assigned_at - NEW.requested_at)) / 3600;

    UPDATE maintenance_sla_metrics
    SET
      actual_response_hours = v_response_hours,
      response_met = (v_response_hours <= target_response_hours)
    WHERE maintenance_request_id = NEW.id;
  END IF;

  -- Calculate resolution time when completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.completed_at IS NOT NULL THEN
    v_resolution_hours := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.requested_at)) / 3600;

    UPDATE maintenance_sla_metrics
    SET
      actual_resolution_hours = v_resolution_hours,
      resolution_met = (v_resolution_hours <= target_resolution_hours)
    WHERE maintenance_request_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sla_metrics_on_maintenance_change
  AFTER UPDATE ON maintenance_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION update_sla_metrics_on_status_change();

-- ============================================================================
-- 8. SEED DATA FOR TESTING
-- ============================================================================

-- Add sample vendor profiles for testing (only if table is empty)
DO $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Get first account for testing
  SELECT id INTO v_account_id FROM accounts LIMIT 1;

  IF v_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendor_profiles LIMIT 1) THEN
    INSERT INTO vendor_profiles (
      account_id, business_name, contact_name, email, phone,
      city, state, zip, specialties, hourly_rate, avg_rating,
      total_jobs_completed, on_call_24_7
    ) VALUES
      (v_account_id, 'QuickFix Plumbing', 'John Smith', 'john@quickfixplumbing.com', '555-0101',
       'Austin', 'TX', '78701', ARRAY['plumbing', 'general'], 85.00, 4.8, 127, true),
      (v_account_id, 'Elite HVAC Services', 'Sarah Johnson', 'sarah@elitehvac.com', '555-0102',
       'Austin', 'TX', '78702', ARRAY['hvac', 'electrical'], 95.00, 4.9, 203, true),
      (v_account_id, 'Reliable Electric', 'Mike Davis', 'mike@reliableelectric.com', '555-0103',
       'Austin', 'TX', '78701', ARRAY['electrical', 'general'], 90.00, 4.7, 156, false),
      (v_account_id, 'Pro Maintenance Co', 'Lisa Chen', 'lisa@promaintenance.com', '555-0104',
       'Austin', 'TX', '78703', ARRAY['general', 'plumbing', 'electrical', 'hvac'], 75.00, 4.6, 89, true);
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
