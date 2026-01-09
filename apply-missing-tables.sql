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

-- 3. Automated Reminders (from 008_communication_portal.sql)
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

-- 4. Reminder Schedules (from 008_communication_portal.sql)
CREATE TABLE IF NOT EXISTS reminder_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reminder_id UUID NOT NULL REFERENCES automated_reminders(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_reminder ON reminder_schedules(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_scheduled ON reminder_schedules(scheduled_for) WHERE status = 'pending';

-- 5. Reminder Runs (from 008_communication_portal.sql)
CREATE TABLE IF NOT EXISTS reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reminder_id UUID NOT NULL REFERENCES automated_reminders(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients_count INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_failed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_runs_reminder ON reminder_runs(reminder_id, run_at DESC);

-- 6. Create expire_old_access_codes function (from 005_showings_enhancements.sql)
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
    UPDATE property_showings
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

-- Done!
SELECT 'Migration complete! Missing tables and functions have been created.' AS status;
