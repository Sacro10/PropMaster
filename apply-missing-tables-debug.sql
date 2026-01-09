-- Debug version: Create missing tables for Railway deployment
-- Run this in Supabase SQL Editor
-- This version shows progress after each table creation

-- Step 1: Activity Events
DO $$
BEGIN
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

  RAISE NOTICE '✓ Created activity_events table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create activity_events: %', SQLERRM;
END $$;

-- Step 2: HVAC Delivery Batches
DO $$
BEGIN
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

  RAISE NOTICE '✓ Created hvac_delivery_batches table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create hvac_delivery_batches: %', SQLERRM;
END $$;

-- Step 3: Message Templates
DO $$
BEGIN
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

  RAISE NOTICE '✓ Created message_templates table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create message_templates: %', SQLERRM;
END $$;

-- Step 4: Automated Reminders
DO $$
BEGIN
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

  RAISE NOTICE '✓ Created automated_reminders table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create automated_reminders: %', SQLERRM;
END $$;

-- Step 5: Reminder Schedules
DO $$
BEGIN
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

  RAISE NOTICE '✓ Created reminder_schedules table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create reminder_schedules: %', SQLERRM;
END $$;

-- Step 6: Reminder Runs
DO $$
BEGIN
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

  RAISE NOTICE '✓ Created reminder_runs table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create reminder_runs: %', SQLERRM;
END $$;

-- Step 7: Create expire_old_access_codes function
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION expire_old_access_codes()
  RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $func$
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
  $func$;

  GRANT EXECUTE ON FUNCTION expire_old_access_codes() TO authenticated;
  GRANT EXECUTE ON FUNCTION expire_old_access_codes() TO service_role;

  RAISE NOTICE '✓ Created expire_old_access_codes function';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✗ Failed to create function: %', SQLERRM;
END $$;

-- Final summary
SELECT 'Migration complete! Check the notices above for details.' AS status;
