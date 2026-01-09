-- =====================================================
-- SHOWINGS ENHANCEMENTS
-- =====================================================
-- Add electronic showings features: access codes,
-- showing types, visitor tracking, and proper timestamps

-- Add missing columns to showings table
ALTER TABLE showings
  ADD COLUMN IF NOT EXISTS showing_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS showing_type TEXT DEFAULT 'agent_assisted'
    CHECK (showing_type IN ('self_guided', 'agent_assisted', 'virtual')),
  ADD COLUMN IF NOT EXISTS visitor_name TEXT,
  ADD COLUMN IF NOT EXISTS visitor_email TEXT,
  ADD COLUMN IF NOT EXISTS visitor_phone TEXT,
  ADD COLUMN IF NOT EXISTS access_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Migrate data from scheduled_at to showing_date if needed
UPDATE showings
SET showing_date = scheduled_at
WHERE showing_date IS NULL AND scheduled_at IS NOT NULL;

-- Migrate applicant data to visitor fields if needed
UPDATE showings
SET
  visitor_name = applicant_name,
  visitor_email = applicant_email,
  visitor_phone = applicant_phone
WHERE visitor_name IS NULL AND applicant_name IS NOT NULL;

-- Now make showing_date NOT NULL (after migration)
ALTER TABLE showings
  ALTER COLUMN showing_date SET NOT NULL;

-- Add index for access code lookups
CREATE INDEX IF NOT EXISTS idx_showings_access_code ON showings(access_code) WHERE access_code IS NOT NULL;

-- Add index for expiring access codes (for background job)
CREATE INDEX IF NOT EXISTS idx_showings_expired_codes ON showings(access_code_expires_at)
  WHERE access_code IS NOT NULL AND access_code_expires_at IS NOT NULL;

-- Add index for date-based queries
CREATE INDEX IF NOT EXISTS idx_showings_showing_date ON showings(account_id, showing_date);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_showings_status ON showings(account_id, status, showing_date);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to generate unique access codes
CREATE OR REPLACE FUNCTION generate_showing_access_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8-character alphanumeric code
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
    
    -- Check if code already exists and is not expired
    SELECT EXISTS(
      SELECT 1 FROM showings
      WHERE access_code = new_code
        AND (access_code_expires_at IS NULL OR access_code_expires_at > NOW())
    ) INTO code_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-set access code expiration
CREATE OR REPLACE FUNCTION set_access_code_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- If access code is set and showing_type is self_guided, calculate expiration
  IF NEW.access_code IS NOT NULL AND NEW.showing_type = 'self_guided' THEN
    -- Set expiration to showing end time (showing_date + duration)
    NEW.access_code_expires_at := NEW.showing_date + (COALESCE(NEW.duration_minutes, 30) || ' minutes')::INTERVAL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for access code expiration
DROP TRIGGER IF EXISTS trg_set_access_code_expiration ON showings;
CREATE TRIGGER trg_set_access_code_expiration
  BEFORE INSERT OR UPDATE ON showings
  FOR EACH ROW
  EXECUTE FUNCTION set_access_code_expiration();

-- Function to expire old access codes (for background job)
CREATE OR REPLACE FUNCTION expire_old_access_codes()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Update showings with expired access codes
  UPDATE showings
  SET
    access_code = NULL,
    access_code_expires_at = NULL,
    updated_at = NOW()
  WHERE access_code IS NOT NULL
    AND access_code_expires_at IS NOT NULL
    AND access_code_expires_at < NOW()
    AND status IN ('scheduled', 'confirmed');
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS FOR SHOWINGS ANALYTICS
-- =====================================================

-- Create view for showing stats by account
CREATE OR REPLACE VIEW showing_stats_by_account AS
SELECT
  s.account_id,
  COUNT(*) FILTER (WHERE DATE(s.showing_date) = CURRENT_DATE) AS scheduled_today,
  COUNT(*) FILTER (WHERE s.showing_date >= DATE_TRUNC('week', CURRENT_DATE)) AS total_this_week,
  COUNT(*) FILTER (WHERE s.status = 'completed') AS completed_showings,
  COUNT(*) FILTER (WHERE s.status IN ('scheduled', 'confirmed')) AS upcoming_showings,
  COUNT(*) AS total_showings,
  -- Avg response time: from creation to showing date (in hours)
  AVG(EXTRACT(EPOCH FROM (s.showing_date - s.created_at)) / 3600)::NUMERIC(10,1) AS avg_response_time_hours,
  -- Conversion rate: applications / completed showings
  (COUNT(*) FILTER (WHERE s.application_submitted = true)::FLOAT /
   NULLIF(COUNT(*) FILTER (WHERE s.status = 'completed'), 0) * 100)::NUMERIC(5,2) AS conversion_rate_percent
FROM showings s
WHERE s.showing_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY s.account_id;

-- Grant access to the view
GRANT SELECT ON showing_stats_by_account TO authenticated;

COMMENT ON VIEW showing_stats_by_account IS 'Aggregated showing statistics by account for dashboard KPIs';
