-- Quick fix: Create missing tables for Railway deployment
-- Run this in Supabase SQL Editor

-- 1. Activity Events (from 003_complete_schema.sql)
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_account ON activity_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events(user_id, created_at DESC);

-- 2. HVAC Delivery Batches (from 004_maintenance_enhancements.sql)
CREATE TABLE IF NOT EXISTS hvac_delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  total_units INTEGER DEFAULT 0,
  total_filters INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  carrier TEXT,
  tracking_numbers TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_hvac_batches_account ON hvac_delivery_batches(account_id, delivery_date DESC);

-- 2a. HVAC Program Enrollments (renamed from hvac_filter_subscriptions)
CREATE TABLE IF NOT EXISTS hvac_program_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  filter_size TEXT NOT NULL,
  filter_type TEXT DEFAULT 'standard' CHECK (filter_type IN ('standard', 'pleated', 'hepa', 'allergen')),
  quantity INTEGER DEFAULT 1,
  frequency TEXT DEFAULT 'quarterly' CHECK (frequency IN ('monthly', 'bimonthly', 'quarterly')),
  next_delivery_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hvac_enrollments_account ON hvac_program_enrollments(account_id);
CREATE INDEX IF NOT EXISTS idx_hvac_enrollments_unit ON hvac_program_enrollments(unit_id);
CREATE INDEX IF NOT EXISTS idx_hvac_enrollments_status ON hvac_program_enrollments(status);

-- 2b. HVAC Delivery Schedules (renamed from hvac_filter_deliveries)
CREATE TABLE IF NOT EXISTS hvac_delivery_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES hvac_program_enrollments(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  delivered_date DATE,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_transit', 'delivered', 'failed', 'cancelled')),
  tracking_number TEXT,
  carrier TEXT,
  delivery_instructions TEXT,
  delivery_photo_url TEXT,
  notes TEXT,
  batch_id UUID REFERENCES hvac_delivery_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hvac_delivery_schedules_account ON hvac_delivery_schedules(account_id);
CREATE INDEX IF NOT EXISTS idx_hvac_delivery_schedules_enrollment ON hvac_delivery_schedules(enrollment_id);

-- 2bb. Unit HVAC Status
CREATE TABLE IF NOT EXISTS unit_hvac_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  condition TEXT NOT NULL CHECK (condition IN ('good', 'monitor', 'service', 'replace')),
  last_serviced_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_hvac_status_account ON unit_hvac_status(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_hvac_status_unit ON unit_hvac_status(unit_id, created_at DESC);

-- 2b. Optional migration from legacy HVAC tables (if they exist)
DO $$
BEGIN
  IF to_regclass('public.hvac_filter_subscriptions') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM hvac_program_enrollments) THEN
      INSERT INTO hvac_program_enrollments (
        account_id,
        unit_id,
        filter_size,
        filter_type,
        quantity,
        frequency,
        next_delivery_date,
        status,
        paused_at,
        cancelled_at,
        cancellation_reason,
        created_at,
        updated_at
      )
      SELECT
        account_id,
        unit_id,
        filter_size,
        filter_type,
        quantity,
        frequency,
        next_delivery_date,
        status,
        paused_at,
        cancelled_at,
        cancellation_reason,
        created_at,
        updated_at
      FROM hvac_filter_subscriptions;
    END IF;
  END IF;

  IF to_regclass('public.hvac_filter_deliveries') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM hvac_delivery_schedules) THEN
      INSERT INTO hvac_delivery_schedules (
        account_id,
        enrollment_id,
        scheduled_date,
        delivered_date,
        status,
        tracking_number,
        carrier,
        delivery_instructions,
        delivery_photo_url,
        notes,
        created_at,
        updated_at
      )
      SELECT
        d.account_id,
        e.id,
        d.scheduled_for,
        d.delivered_at::date,
        d.status,
        d.tracking_number,
        d.carrier,
        d.delivery_instructions,
        d.delivery_photo_url,
        d.notes,
        d.created_at,
        d.updated_at
      FROM hvac_filter_deliveries d
      JOIN hvac_program_enrollments e
        ON e.account_id = d.account_id
       AND e.unit_id = (
         SELECT unit_id
         FROM hvac_filter_subscriptions s
         WHERE s.id = d.subscription_id
         LIMIT 1
       );
    END IF;
  END IF;
END$$;

-- 2c. HVAC annual renewal fields (legacy + program enrollments)
ALTER TABLE IF EXISTS hvac_filter_subscriptions
  ADD COLUMN IF NOT EXISTS annual_expires_on DATE,
  ADD COLUMN IF NOT EXISTS annual_renewal_reminder_sent_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS hvac_program_enrollments
  ADD COLUMN IF NOT EXISTS annual_expires_on DATE,
  ADD COLUMN IF NOT EXISTS annual_renewal_reminder_sent_at TIMESTAMPTZ;

-- 2c. Emergency Support Config (from 004_maintenance_enhancements.sql)
CREATE TABLE IF NOT EXISTS emergency_support_config (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  on_call_vendor_ids UUID[] DEFAULT '{}',
  notification_phone TEXT,
  notification_email TEXT,
  notification_channels TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emergency_support_config ADD COLUMN IF NOT EXISTS notification_channels TEXT[] DEFAULT '{}';
ALTER TABLE emergency_support_config ADD COLUMN IF NOT EXISTS notification_phone TEXT;
ALTER TABLE emergency_support_config ADD COLUMN IF NOT EXISTS notification_email TEXT;
ALTER TABLE emergency_support_config ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_emergency_support_config_account ON emergency_support_config(account_id);

-- 2d. Maintenance Assignments (required for vendor routing)
CREATE TABLE IF NOT EXISTS maintenance_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  vendor_profile_id UUID REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  vendor_notes TEXT,
  completion_notes TEXT,
  before_images JSONB DEFAULT '[]'::jsonb,
  after_images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2e. User profile contact fields
ALTER TABLE IF EXISTS user_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2f. Vendor lookup RPC with configurable radius
CREATE OR REPLACE FUNCTION find_available_vendors(
  p_account_id UUID,
  p_category TEXT,
  p_property_zip TEXT,
  p_limit INTEGER DEFAULT 10,
  p_radius_miles INTEGER DEFAULT NULL
)
RETURNS TABLE (
  vendor_id UUID,
  business_name TEXT,
  rating NUMERIC,
  jobs_completed INTEGER,
  hourly_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id,
    vp.business_name,
    vp.avg_rating,
    vp.total_jobs_completed,
    COALESCE(vs.base_rate, 85)::NUMERIC
  FROM vendor_profiles vp
  LEFT JOIN vendor_services vs
    ON vs.vendor_profile_id = vp.id
   AND vs.account_id = vp.account_id
   AND (p_category IS NULL OR vs.service_type = p_category)
  WHERE vp.account_id = p_account_id
    AND vp.is_active = true
    AND (
      p_category IS NULL OR EXISTS (
        SELECT 1
        FROM vendor_services vs2
        WHERE vs2.vendor_profile_id = vp.id
          AND vs2.account_id = vp.account_id
          AND vs2.service_type = p_category
      )
    )
    AND (
      p_radius_miles IS NULL
      OR vs.service_radius_miles IS NULL
      OR vs.service_radius_miles >= p_radius_miles
    )
  ORDER BY
    CASE
      WHEN p_property_zip IS NULL OR vp.zip IS NULL THEN 999
      WHEN vp.zip = p_property_zip THEN 0
      ELSE 25
    END,
    vp.avg_rating DESC,
    vp.total_jobs_completed DESC
  LIMIT COALESCE(p_limit, 10);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_maintenance_assignments_account ON maintenance_assignments(account_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_assignments_request ON maintenance_assignments(request_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_assignments_vendor ON maintenance_assignments(vendor_profile_id);

-- 3. Message Templates (from 003_complete_schema.sql)
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('payment', 'maintenance', 'lease', 'onboarding', 'showing', 'general')),
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Screening Results (from 003_complete_schema.sql)
CREATE TABLE IF NOT EXISTS screening_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES rental_applications(id) ON DELETE CASCADE,
  provider TEXT,
  credit_score INTEGER,
  background_check_status TEXT,
  eviction_history BOOLEAN DEFAULT false,
  criminal_history BOOLEAN DEFAULT false,
  income_verification_status TEXT,
  risk_score INTEGER,
  risk_factors TEXT[] DEFAULT '{}',
  recommendations TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  screened_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screening_results_account ON screening_results(account_id);
CREATE INDEX IF NOT EXISTS idx_screening_results_application ON screening_results(application_id);

CREATE INDEX IF NOT EXISTS idx_message_templates_account ON message_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);

-- 4. Automated Reminders (from 008_communication_portal.sql)
CREATE TABLE IF NOT EXISTS automated_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'custom')),
  custom_schedule TEXT,
  next_send_date TIMESTAMPTZ NOT NULL,
  last_sent_date TIMESTAMPTZ,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  message_subject TEXT NOT NULL,
  message_body TEXT NOT NULL,
  recipient_filter JSONB DEFAULT '{}'::jsonb,
  recipient_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automated_reminders_account ON automated_reminders(account_id);
CREATE INDEX IF NOT EXISTS idx_automated_reminders_next_send ON automated_reminders(next_send_date) WHERE status = 'active';

-- 5. Reminder Schedules (from 008_communication_portal.sql)
CREATE TABLE IF NOT EXISTS reminder_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT,
  reminder_type TEXT,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  frequency TEXT,
  custom_cron TEXT,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  recipient_filter JSONB DEFAULT '{}'::jsonb,
  reminder_id UUID REFERENCES automated_reminders(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS reminder_type TEXT;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS frequency TEXT;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS custom_cron TEXT;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS recipient_filter JSONB DEFAULT '{}'::jsonb;
ALTER TABLE reminder_schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE reminder_schedules ALTER COLUMN scheduled_for SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_reminder ON reminder_schedules(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_scheduled ON reminder_schedules(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_next_run ON reminder_schedules(next_run_at) WHERE is_active = true;

-- 6. Reminder Runs (from 008_communication_portal.sql)
CREATE TABLE IF NOT EXISTS reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reminder_id UUID NOT NULL REFERENCES automated_reminders(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES reminder_schedules(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients_count INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_failed INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_runs_reminder ON reminder_runs(reminder_id, run_at DESC);

ALTER TABLE reminder_runs ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES reminder_schedules(id) ON DELETE CASCADE;
ALTER TABLE reminder_runs ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0;
ALTER TABLE reminder_runs ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;
ALTER TABLE reminder_runs ALTER COLUMN reminder_id DROP NOT NULL;

-- 6b. Reminder Logs (from 008_communication_portal.sql)
CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reminder_id UUID NOT NULL REFERENCES automated_reminders(id) ON DELETE CASCADE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients_count INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_failed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('success', 'partial', 'failed', 'pending')),
  error_message TEXT,
  execution_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_reminder ON reminder_logs(reminder_id, executed_at DESC);

-- 6c. Showings columns required by access code jobs
ALTER TABLE showings ADD COLUMN IF NOT EXISTS showing_date TIMESTAMPTZ;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS showing_type TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS visitor_name TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS visitor_email TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS visitor_phone TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS prospect_name TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS prospect_email TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS prospect_phone TEXT;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS access_code_expires_at TIMESTAMPTZ;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS duration INTEGER;

-- 6d. Showings outcomes
CREATE TABLE IF NOT EXISTS showing_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  showing_id UUID NOT NULL REFERENCES showings(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_text TEXT,
  next_steps TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_showing_outcomes_showing ON showing_outcomes(showing_id);

-- 6e. User OAuth tokens (Gmail OAuth)
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_account_id ON user_oauth_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_user_id ON user_oauth_tokens(user_id);

-- 6e. Communications - conversations table + message link
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject TEXT,
  participants UUID[] NOT NULL DEFAULT '{}'::uuid[],
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  related_type TEXT,
  related_id UUID,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING GIN (participants);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- 6e. Communications - outbound message tracking
CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  reminder_id UUID REFERENCES automated_reminders(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  message_type TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  channel TEXT CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  provider TEXT,
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_messages_account ON outbound_messages(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_reminder ON outbound_messages(reminder_id);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_conversation ON outbound_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_message ON outbound_messages(message_id);

-- 6e. Communications - conversation satisfaction ratings
CREATE TABLE IF NOT EXISTS conversation_satisfaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  feedback TEXT,
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_satisfaction_account ON conversation_satisfaction(account_id, rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_satisfaction_conversation ON conversation_satisfaction(conversation_id);

-- 6e. Communications - average response time function
CREATE OR REPLACE FUNCTION calculate_avg_response_time(
  p_account_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS NUMERIC
LANGUAGE sql
AS $$
  WITH ordered AS (
    SELECT
      conversation_id,
      from_user_id,
      created_at,
      LAG(from_user_id) OVER (PARTITION BY conversation_id ORDER BY created_at) AS prev_sender,
      LAG(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at) AS prev_created_at
    FROM messages
    WHERE account_id = p_account_id
      AND conversation_id IS NOT NULL
      AND created_at >= (NOW() - (p_days || ' days')::interval)
  )
  SELECT COALESCE(
    AVG(EXTRACT(EPOCH FROM (created_at - prev_created_at)) / 60.0),
    0
  )
  FROM ordered
  WHERE prev_created_at IS NOT NULL
    AND prev_sender IS DISTINCT FROM from_user_id;
$$;

-- 6e. Communications - Gmail message links for inbound sync
CREATE TABLE IF NOT EXISTS gmail_message_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_message_links_account ON gmail_message_links(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_message_links_message ON gmail_message_links(message_id);

-- 6f. Property stats columns
ALTER TABLE properties ADD COLUMN IF NOT EXISTS occupied_units INTEGER DEFAULT 0;

-- 6g. Owner entities + ownership links
CREATE TABLE IF NOT EXISTS owner_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  entity_type TEXT DEFAULT 'individual' CHECK (entity_type IN ('individual', 'llc', 'trust', 'corporation')),
  disbursement_method TEXT DEFAULT 'manual' CHECK (disbursement_method IN ('ach', 'wire', 'check', 'manual')),
  disbursement_schedule TEXT DEFAULT 'monthly' CHECK (disbursement_schedule IN ('weekly', 'monthly', 'quarterly', 'annual', 'on_demand')),
  disbursement_day INTEGER DEFAULT 1,
  management_fee_percentage NUMERIC(5, 2) DEFAULT 0,
  management_fee_flat NUMERIC(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_entities_account ON owner_entities(account_id);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_connected_account_id TEXT;

CREATE TABLE IF NOT EXISTS property_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owner_entities(id) ON DELETE CASCADE,
  ownership_percentage NUMERIC(5, 2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, owner_id)
);

ALTER TABLE owner_disbursements ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owner_entities(id) ON DELETE SET NULL;
ALTER TABLE owner_disbursements ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE owner_disbursements ADD COLUMN IF NOT EXISTS stripe_payout_id TEXT;

-- 6h. User profiles table (needed for payments joins)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  subscription_tier TEXT DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create expire_old_access_codes function (from 005_showings_enhancements.sql)
CREATE OR REPLACE FUNCTION expire_old_access_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Expire access codes that have passed their expiration date
  WITH expired AS (
    UPDATE showings
    SET
      access_code = NULL,
      access_code_expires_at = NULL,
      updated_at = NOW()
    WHERE
      access_code IS NOT NULL
      AND access_code_expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION expire_old_access_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_access_codes() TO service_role;

-- 8. Payments: overdue payments function
CREATE OR REPLACE FUNCTION get_overdue_payments(p_account_id UUID)
RETURNS TABLE(
  payment_id UUID,
  lease_id UUID,
  tenant_user_id UUID,
  unit_id UUID,
  amount NUMERIC,
  due_date DATE,
  days_overdue INTEGER,
  tenant_name TEXT,
  property_name TEXT,
  unit_number TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id AS payment_id,
    p.lease_id,
    p.tenant_user_id,
    p.unit_id,
    p.amount,
    p.due_date,
    GREATEST(0, (CURRENT_DATE - p.due_date))::INTEGER AS days_overdue,
    COALESCE(tp.full_name, 'Unknown') AS tenant_name,
    COALESCE(pr.name, 'Unknown') AS property_name,
    COALESCE(u.unit_number, '') AS unit_number
  FROM payments p
  LEFT JOIN tenant_profiles tp ON tp.account_id = p.account_id AND tp.user_id = p.tenant_user_id
  LEFT JOIN units u ON u.id = p.unit_id
  LEFT JOIN properties pr ON pr.id = u.property_id
  WHERE p.account_id = p_account_id
    AND p.status IN ('pending', 'late')
    AND p.due_date < CURRENT_DATE;
$$;

GRANT EXECUTE ON FUNCTION get_overdue_payments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_overdue_payments(UUID) TO service_role;

-- 9. Leases: add auto-pay flag for collection stats
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS auto_pay_enabled BOOLEAN DEFAULT false;

-- 9. Tenant screening metrics RPC (optional, avoids 404)
CREATE OR REPLACE FUNCTION get_tenant_screening_metrics(p_account_id UUID)
RETURNS TABLE(
  avg_screening_time NUMERIC,
  acceptance_rate NUMERIC,
  ai_accuracy NUMERIC,
  eviction_rate NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH apps AS (
    SELECT created_at, reviewed_at, status
    FROM rental_applications
    WHERE account_id = p_account_id
  ),
  tenants AS (
    SELECT ai_risk_score, background_check_status, move_out_date, screening_notes
    FROM tenant_profiles
    WHERE account_id = p_account_id
  ),
  screening_time AS (
    SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600) AS avg_hours
    FROM apps
    WHERE reviewed_at IS NOT NULL
  ),
  acceptance AS (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (WHERE status IN ('approved','rejected')) = 0 THEN 0
        ELSE (COUNT(*) FILTER (WHERE status = 'approved')::NUMERIC /
              COUNT(*) FILTER (WHERE status IN ('approved','rejected'))::NUMERIC) * 100
      END AS rate
    FROM apps
  ),
  ai AS (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (WHERE ai_risk_score IS NOT NULL AND background_check_status IS NOT NULL) = 0 THEN 0
        ELSE (
          COUNT(*) FILTER (
            WHERE ai_risk_score IS NOT NULL
              AND background_check_status IS NOT NULL
              AND (
                (ai_risk_score >= 70 AND background_check_status = 'approved')
                OR (ai_risk_score < 70 AND background_check_status = 'rejected')
              )
          )::NUMERIC
          /
          COUNT(*) FILTER (WHERE ai_risk_score IS NOT NULL AND background_check_status IS NOT NULL)::NUMERIC
        ) * 100
      END AS accuracy
    FROM tenants
  ),
  eviction AS (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (WHERE move_out_date IS NOT NULL) = 0 THEN 0
        ELSE (
          COUNT(*) FILTER (
            WHERE move_out_date IS NOT NULL AND screening_notes ILIKE '%eviction%'
          )::NUMERIC
          /
          COUNT(*) FILTER (WHERE move_out_date IS NOT NULL)::NUMERIC
        ) * 100
      END AS rate
    FROM tenants
  )
  SELECT
    COALESCE(screening_time.avg_hours, 0) AS avg_screening_time,
    COALESCE(acceptance.rate, 0) AS acceptance_rate,
    COALESCE(ai.accuracy, 0) AS ai_accuracy,
    COALESCE(eviction.rate, 0) AS eviction_rate
  FROM screening_time, acceptance, ai, eviction;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_screening_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_screening_metrics(UUID) TO service_role;

-- 10. Monthly revenue RPC for analytics
CREATE OR REPLACE FUNCTION get_monthly_revenue(account_uuid UUID, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE(month DATE, revenue NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', paid_at)::DATE AS month,
    SUM(amount)::NUMERIC AS revenue
  FROM payments
  WHERE account_id = account_uuid
    AND status = 'paid'
    AND paid_at IS NOT NULL
    AND paid_at >= start_date
    AND paid_at <= end_date
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION get_monthly_revenue(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_revenue(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- 11. Expenses + categories (for analytics + disbursements)
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tax_deductible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  vendor_profile_id UUID REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  maintenance_request_id UUID REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_account_name ON expense_categories(account_id, name);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_property ON expenses(property_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_maintenance_request ON expenses(maintenance_request_id);

-- Enable RLS + policies (account scoped)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_categories' AND policyname = 'expense_categories_select'
  ) THEN
    CREATE POLICY expense_categories_select ON expense_categories FOR SELECT USING (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_categories' AND policyname = 'expense_categories_insert'
  ) THEN
    CREATE POLICY expense_categories_insert ON expense_categories FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_categories' AND policyname = 'expense_categories_update'
  ) THEN
    CREATE POLICY expense_categories_update ON expense_categories FOR UPDATE USING (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_categories' AND policyname = 'expense_categories_delete'
  ) THEN
    CREATE POLICY expense_categories_delete ON expense_categories FOR DELETE USING (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'expenses_select'
  ) THEN
    CREATE POLICY expenses_select ON expenses FOR SELECT USING (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'expenses_insert'
  ) THEN
    CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'expenses_update'
  ) THEN
    CREATE POLICY expenses_update ON expenses FOR UPDATE USING (is_account_member(account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'expenses_delete'
  ) THEN
    CREATE POLICY expenses_delete ON expenses FOR DELETE USING (is_account_member(account_id));
  END IF;
END $$;

-- Auto-update timestamps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_expense_categories_updated_at'
      AND tgrelid = 'expense_categories'::regclass
  ) THEN
    CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON expense_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_expenses_updated_at'
      AND tgrelid = 'expenses'::regclass
  ) THEN
    CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Backfill categories + expenses from maintenance_requests
INSERT INTO expense_categories (account_id, name, description, tax_deductible)
SELECT DISTINCT
  mr.account_id,
  INITCAP(COALESCE(mr.category, 'Other')),
  'Auto-created from maintenance requests',
  true
FROM maintenance_requests mr
WHERE mr.category IS NOT NULL
ON CONFLICT (account_id, name) DO NOTHING;

INSERT INTO expenses (
  account_id,
  property_id,
  unit_id,
  category_id,
  vendor_profile_id,
  maintenance_request_id,
  amount,
  expense_date,
  description,
  payment_method
)
SELECT
  mr.account_id,
  mr.property_id,
  mr.unit_id,
  ec.id,
  ma.vendor_profile_id,
  mr.id,
  COALESCE(mr.actual_cost, mr.estimated_cost),
  COALESCE(mr.completed_at::date, mr.updated_at::date, mr.created_at::date),
  mr.title,
  'manual'
FROM maintenance_requests mr
LEFT JOIN maintenance_assignments ma ON ma.request_id = mr.id
LEFT JOIN expense_categories ec
  ON ec.account_id = mr.account_id
  AND ec.name = INITCAP(COALESCE(mr.category, 'Other'))
WHERE COALESCE(mr.actual_cost, mr.estimated_cost) IS NOT NULL
ON CONFLICT (maintenance_request_id) DO NOTHING;

-- Done!
SELECT 'Migration complete! Missing tables and functions have been created.' AS status;
