-- =====================================================
-- RENT COLLECTION & DISBURSEMENT ENHANCEMENTS
-- =====================================================
-- Add full rent collection tracking, auto-pay, owner entities,
-- and disbursement processing with ledger integration

-- =====================================================
-- OWNER ENTITIES
-- =====================================================
-- Can be org-level or per-property owners

CREATE TABLE IF NOT EXISTS owner_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Owner information
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Owner type
  entity_type TEXT DEFAULT 'individual' CHECK (entity_type IN ('individual', 'llc', 'trust', 'corporation')),
  
  -- Payment preferences
  disbursement_method TEXT DEFAULT 'ach' CHECK (disbursement_method IN ('ach', 'wire', 'check', 'manual')),
  disbursement_schedule TEXT DEFAULT 'monthly' CHECK (disbursement_schedule IN ('weekly', 'monthly', 'quarterly', 'annual', 'on_demand')),
  disbursement_day INT DEFAULT 15 CHECK (disbursement_day BETWEEN 1 AND 31),
  
  -- Bank information (encrypted in production)
  bank_account_last4 TEXT,
  routing_number_last4 TEXT,
  stripe_connect_account_id TEXT,
  
  -- Management fee
  management_fee_percentage NUMERIC(5,2) DEFAULT 10.00,
  management_fee_flat NUMERIC(10,2),
  
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link properties to owners
CREATE TABLE IF NOT EXISTS property_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owner_entities(id) ON DELETE CASCADE,
  ownership_percentage NUMERIC(5,2) DEFAULT 100.00 CHECK (ownership_percentage > 0 AND ownership_percentage <= 100),
  effective_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, owner_id, effective_date)
);

CREATE INDEX idx_owner_entities_account ON owner_entities(account_id);
CREATE INDEX idx_property_owners_property ON property_owners(property_id);
CREATE INDEX idx_property_owners_owner ON property_owners(owner_id);

-- =====================================================
-- PAYMENTS ENHANCEMENTS
-- =====================================================

-- Add auto-pay and better tracking to existing payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS auto_pay_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_payment_id UUID,
  ADD COLUMN IF NOT EXISTS disbursed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disbursement_id UUID,
  ADD COLUMN IF NOT EXISTS ledger_entry_id UUID;

-- Create index for overdue payments
CREATE INDEX IF NOT EXISTS idx_payments_overdue 
  ON payments(account_id, due_date, status) 
  WHERE status = 'pending' OR status = 'late';

-- Create index for disbursement tracking  
CREATE INDEX IF NOT EXISTS idx_payments_disbursed 
  ON payments(account_id, disbursed, paid_at)
  WHERE paid_at IS NOT NULL;

-- Add index for collection stats
CREATE INDEX IF NOT EXISTS idx_payments_stats 
  ON payments(account_id, paid_at, due_date, status);

-- =====================================================
-- LEASE ENHANCEMENTS (for auto-pay)
-- =====================================================

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS auto_pay_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS preferred_payment_day INT DEFAULT 1 CHECK (preferred_payment_day BETWEEN 1 AND 31);

CREATE INDEX IF NOT EXISTS idx_leases_auto_pay 
  ON leases(account_id, auto_pay_enabled) 
  WHERE auto_pay_enabled = TRUE AND status = 'active';

-- =====================================================
-- OWNER DISBURSEMENTS ENHANCEMENTS
-- =====================================================

ALTER TABLE owner_disbursements
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owner_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_owner_disbursements_owner 
  ON owner_disbursements(owner_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_owner_disbursements_status 
  ON owner_disbursements(account_id, status, disbursed_at);

-- Add reference from ledger_entries to disbursements if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ledger_entries' AND column_name = 'disbursement_id'
  ) THEN
    ALTER TABLE ledger_entries ADD COLUMN disbursement_id UUID;
  END IF;
END $$;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Calculate collection rate for account
CREATE OR REPLACE FUNCTION calculate_collection_rate(
  p_account_id UUID,
  p_start_date DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
  total_due NUMERIC;
  total_collected NUMERIC;
  rate NUMERIC;
BEGIN
  -- Total rent due in period
  SELECT COALESCE(SUM(amount), 0) INTO total_due
  FROM payments
  WHERE account_id = p_account_id
    AND due_date BETWEEN p_start_date AND p_end_date
    AND payment_type = 'rent';
  
  -- Total collected in period (paid status)
  SELECT COALESCE(SUM(amount), 0) INTO total_collected
  FROM payments
  WHERE account_id = p_account_id
    AND due_date BETWEEN p_start_date AND p_end_date
    AND payment_type = 'rent'
    AND status = 'paid';
  
  -- Calculate rate
  IF total_due > 0 THEN
    rate := (total_collected / total_due) * 100;
  ELSE
    rate := 100; -- No payments due = 100% collected
  END IF;
  
  RETURN ROUND(rate, 1);
END;
$$ LANGUAGE plpgsql;

-- Get overdue payments
CREATE OR REPLACE FUNCTION get_overdue_payments(
  p_account_id UUID
)
RETURNS TABLE (
  payment_id UUID,
  lease_id UUID,
  tenant_user_id UUID,
  unit_id UUID,
  amount NUMERIC,
  due_date DATE,
  days_overdue INT,
  tenant_name TEXT,
  property_name TEXT,
  unit_number TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS payment_id,
    p.lease_id,
    p.tenant_user_id,
    p.unit_id,
    p.amount,
    p.due_date,
    (CURRENT_DATE - p.due_date)::INT AS days_overdue,
    COALESCE(up.full_name, 'Unknown') AS tenant_name,
    COALESCE(pr.name, 'Unknown') AS property_name,
    COALESCE(u.unit_number, '') AS unit_number
  FROM payments p
  LEFT JOIN user_profiles up ON p.tenant_user_id = up.user_id
  LEFT JOIN units u ON p.unit_id = u.id
  LEFT JOIN properties pr ON u.property_id = pr.id
  WHERE p.account_id = p_account_id
    AND p.status IN ('pending', 'late')
    AND p.due_date < CURRENT_DATE
  ORDER BY p.due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Process disbursement with idempotency
CREATE OR REPLACE FUNCTION process_disbursement(
  p_disbursement_id UUID,
  p_idempotency_key TEXT,
  p_processed_by UUID
)
RETURNS UUID AS $$
DECLARE
  v_disbursement owner_disbursements%ROWTYPE;
  v_ledger_id UUID;
  v_payment_count INT;
BEGIN
  -- Check idempotency
  IF EXISTS (
    SELECT 1 FROM owner_disbursements 
    WHERE idempotency_key = p_idempotency_key 
    AND id != p_disbursement_id
  ) THEN
    RAISE EXCEPTION 'Duplicate disbursement with key: %', p_idempotency_key;
  END IF;
  
  -- Lock and get disbursement
  SELECT * INTO v_disbursement
  FROM owner_disbursements
  WHERE id = p_disbursement_id
  FOR UPDATE;
  
  -- Check if already processed
  IF v_disbursement.status = 'completed' THEN
    RETURN v_disbursement.id; -- Already processed, return safely
  END IF;
  
  -- Update disbursement status
  UPDATE owner_disbursements
  SET 
    status = 'completed',
    disbursed_at = NOW(),
    processed_by = p_processed_by,
    idempotency_key = p_idempotency_key,
    updated_at = NOW()
  WHERE id = p_disbursement_id;
  
  -- Create ledger entry for disbursement (debit cash, credit owner equity)
  INSERT INTO ledger_entries (
    account_id,
    entry_type,
    account_name,
    amount,
    reference_type,
    reference_id,
    disbursement_id,
    description,
    entry_date
  ) VALUES (
    v_disbursement.account_id,
    'debit',
    'owner_disbursement',
    v_disbursement.net_amount,
    'disbursement',
    v_disbursement.id,
    v_disbursement.id,
    'Owner disbursement for period ' || v_disbursement.period_start || ' to ' || v_disbursement.period_end,
    CURRENT_DATE
  ) RETURNING id INTO v_ledger_id;
  
  -- Mark associated payments as disbursed
  UPDATE payments
  SET 
    disbursed = TRUE,
    disbursement_id = p_disbursement_id,
    updated_at = NOW()
  WHERE account_id = v_disbursement.account_id
    AND paid_at BETWEEN v_disbursement.period_start AND v_disbursement.period_end
    AND status = 'paid'
    AND payment_type = 'rent'
    AND (disbursed = FALSE OR disbursed IS NULL);
  
  GET DIAGNOSTICS v_payment_count = ROW_COUNT;
  
  -- Update breakdown with payment count
  UPDATE owner_disbursements
  SET breakdown = jsonb_set(
    COALESCE(breakdown, '{}'::jsonb),
    '{payment_count}',
    to_jsonb(v_payment_count)
  )
  WHERE id = p_disbursement_id;
  
  RETURN v_disbursement.id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- Collection stats by account
CREATE OR REPLACE VIEW collection_stats_by_account AS
SELECT
  p.account_id,
  
  -- Collected this month
  SUM(p.amount) FILTER (
    WHERE p.status = 'paid' 
    AND DATE_TRUNC('month', p.paid_at) = DATE_TRUNC('month', CURRENT_DATE)
  ) AS collected_this_month,
  
  -- Collection rate (this month)
  calculate_collection_rate(p.account_id) AS collection_rate,
  
  -- Auto-pay enrollment (active leases with auto-pay)
  (
    SELECT COUNT(*) FILTER (WHERE auto_pay_enabled = TRUE)::FLOAT /
    NULLIF(COUNT(*), 0) * 100
    FROM leases
    WHERE account_id = p.account_id
    AND status = 'active'
  ) AS auto_pay_enrollment_rate,
  
  -- Avg collection time (days from due to paid)
  AVG(
    EXTRACT(DAY FROM (p.paid_at::DATE - p.due_date))
  ) FILTER (
    WHERE p.status = 'paid' 
    AND p.paid_at IS NOT NULL
    AND p.paid_at >= CURRENT_DATE - INTERVAL '90 days'
  ) AS avg_collection_days,
  
  -- Count overdue
  COUNT(*) FILTER (
    WHERE p.status IN ('pending', 'late')
    AND p.due_date < CURRENT_DATE
  ) AS overdue_count
  
FROM payments p
WHERE p.payment_type = 'rent'
GROUP BY p.account_id;

GRANT SELECT ON collection_stats_by_account TO authenticated;

COMMENT ON VIEW collection_stats_by_account IS 'Pre-aggregated collection statistics for rent payments';

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Owner entities
ALTER TABLE owner_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_entities_select ON owner_entities
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY owner_entities_insert ON owner_entities
  FOR INSERT WITH CHECK (is_account_member(account_id));

CREATE POLICY owner_entities_update ON owner_entities
  FOR UPDATE USING (is_account_member(account_id));

-- Property owners
ALTER TABLE property_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_owners_select ON property_owners
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_owners.property_id
      AND is_account_member(p.account_id)
    )
  );

CREATE POLICY property_owners_insert ON property_owners
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_owners.property_id
      AND is_account_member(p.account_id)
    )
  );

COMMENT ON TABLE owner_entities IS 'Property owners who receive disbursements';
COMMENT ON TABLE property_owners IS 'Links properties to their owners with ownership percentages';
COMMENT ON FUNCTION calculate_collection_rate IS 'Calculates collection rate = collected / due for date range';
COMMENT ON FUNCTION get_overdue_payments IS 'Returns all overdue payments with tenant and property details';
COMMENT ON FUNCTION process_disbursement IS 'Processes disbursement with ledger entries and idempotency';
