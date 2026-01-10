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

-- Done!
SELECT 'Migration complete! Missing tables and functions have been created.' AS status;
