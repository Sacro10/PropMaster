-- Migration 003: Complete Multi-tenant Property Management Schema
-- This migration adds all missing tables and updates existing schema for production readiness

-- ============================================================================
-- 1. ACTIVITY EVENTS & AUDIT LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'property_created', 'property_updated', 'property_deleted',
    'unit_created', 'unit_updated', 'unit_deleted',
    'tenant_added', 'tenant_removed', 'tenant_updated',
    'application_submitted', 'application_approved', 'application_rejected',
    'lease_created', 'lease_renewed', 'lease_terminated',
    'maintenance_created', 'maintenance_assigned', 'maintenance_completed',
    'payment_received', 'payment_failed', 'payment_reminder_sent',
    'disbursement_processed', 'disbursement_failed',
    'showing_scheduled', 'showing_completed', 'showing_cancelled',
    'message_sent', 'reminder_sent',
    'hvac_delivery_scheduled', 'hvac_delivery_completed',
    'user_login', 'user_logout', 'settings_updated'
  )),
  entity_type TEXT,
  entity_id UUID,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_events_account ON activity_events(account_id, created_at DESC);
CREATE INDEX idx_activity_events_user ON activity_events(user_id, created_at DESC);
CREATE INDEX idx_activity_events_entity ON activity_events(entity_type, entity_id);
CREATE INDEX idx_activity_events_type ON activity_events(event_type);

-- ============================================================================
-- 2. SCREENING & APPLICATION ENHANCEMENTS
-- ============================================================================

-- Add screening results table
CREATE TABLE IF NOT EXISTS screening_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES rental_applications(id) ON DELETE CASCADE,
  provider TEXT DEFAULT 'internal' CHECK (provider IN ('internal', 'transunion', 'experian', 'checkr')),
  credit_score INTEGER,
  background_check_status TEXT CHECK (background_check_status IN ('pending', 'clear', 'flagged', 'failed')),
  eviction_history BOOLEAN DEFAULT false,
  criminal_history BOOLEAN DEFAULT false,
  income_verification_status TEXT CHECK (income_verification_status IN ('pending', 'verified', 'failed')),
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  recommendations TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  screened_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_screening_results_application ON screening_results(application_id);
CREATE INDEX idx_screening_results_account ON screening_results(account_id);

-- ============================================================================
-- 3. WORK ORDERS & SLA TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  maintenance_request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  vendor_profile_id UUID REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  work_order_number TEXT NOT NULL,
  scheduled_date TIMESTAMPTZ,
  scheduled_duration_hours NUMERIC(4, 2),
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  estimated_cost NUMERIC(10, 2),
  actual_cost NUMERIC(10, 2),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  completion_notes TEXT,
  work_performed TEXT,
  parts_used JSONB DEFAULT '[]'::jsonb,
  before_photos JSONB DEFAULT '[]'::jsonb,
  after_photos JSONB DEFAULT '[]'::jsonb,
  tenant_signature TEXT,
  vendor_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_orders_account ON work_orders(account_id);
CREATE INDEX idx_work_orders_request ON work_orders(maintenance_request_id);
CREATE INDEX idx_work_orders_vendor ON work_orders(vendor_profile_id);
CREATE INDEX idx_work_orders_scheduled ON work_orders(scheduled_date);

-- SLA metrics tracking
CREATE TABLE IF NOT EXISTS maintenance_sla_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  maintenance_request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  priority TEXT NOT NULL,
  target_response_hours INTEGER NOT NULL,
  target_resolution_hours INTEGER NOT NULL,
  actual_response_hours NUMERIC(10, 2),
  actual_resolution_hours NUMERIC(10, 2),
  response_met BOOLEAN,
  resolution_met BOOLEAN,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_metrics_account ON maintenance_sla_metrics(account_id);
CREATE INDEX idx_sla_metrics_request ON maintenance_sla_metrics(maintenance_request_id);

-- ============================================================================
-- 4. SHOWING ENHANCEMENTS
-- ============================================================================

-- Showing invites
CREATE TABLE IF NOT EXISTS showing_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  showing_id UUID NOT NULL REFERENCES showings(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_phone TEXT,
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'accepted', 'declined')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_showing_invites_showing ON showing_invites(showing_id);
CREATE INDEX idx_showing_invites_code ON showing_invites(invite_code);

-- Showing outcomes
CREATE TABLE IF NOT EXISTS showing_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  showing_id UUID NOT NULL REFERENCES showings(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('interested', 'not_interested', 'applied', 'no_show')),
  feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_text TEXT,
  next_steps TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_showing_outcomes_showing ON showing_outcomes(showing_id);
CREATE INDEX idx_showing_outcomes_account ON showing_outcomes(account_id);

-- Lock integration (stub for future)
CREATE TABLE IF NOT EXISTS lock_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('august', 'yale', 'schlage', 'smartthings', 'custom')),
  device_id TEXT NOT NULL,
  device_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_sync TIMESTAMPTZ,
  api_credentials JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lock_integrations_property ON lock_integrations(property_id);
CREATE INDEX idx_lock_integrations_unit ON lock_integrations(unit_id);

-- ============================================================================
-- 5. FINANCIAL ENHANCEMENTS
-- ============================================================================

-- Payment attempts tracking
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  failure_reason TEXT,
  failure_code TEXT,
  provider_transaction_id TEXT,
  provider_response JSONB DEFAULT '{}'::jsonb,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_attempts_payment ON payment_attempts(payment_id);
CREATE INDEX idx_payment_attempts_status ON payment_attempts(status);

-- Ledger entries for double-entry bookkeeping
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  account_name TEXT NOT NULL, -- e.g., 'rent_income', 'maintenance_expense', 'management_fee'
  amount NUMERIC(12, 2) NOT NULL,
  reference_type TEXT, -- 'payment', 'expense', 'disbursement'
  reference_id UUID,
  description TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_account ON ledger_entries(account_id, entry_date DESC);
CREATE INDEX idx_ledger_entries_reference ON ledger_entries(reference_type, reference_id);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  vendor_profile_id UUID REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  maintenance_request_id UUID REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  receipt_url TEXT,
  payment_method TEXT,
  reimbursable BOOLEAN DEFAULT false,
  reimbursed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tax_deductible BOOLEAN DEFAULT true,
  parent_category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_account ON expenses(account_id, expense_date DESC);
CREATE INDEX idx_expenses_property ON expenses(property_id);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expense_categories_account ON expense_categories(account_id);

-- ============================================================================
-- 6. MESSAGING & TEMPLATES ENHANCEMENTS
-- ============================================================================

-- Conversations grouping
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject TEXT,
  participants UUID[] NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  related_type TEXT, -- 'maintenance', 'lease', 'showing', 'general'
  related_id UUID,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_account ON conversations(account_id);
CREATE INDEX idx_conversations_participants ON conversations USING GIN(participants);
CREATE INDEX idx_conversations_property ON conversations(property_id);

-- Update messages to reference conversations
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- Message templates
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

CREATE INDEX idx_message_templates_account ON message_templates(account_id);
CREATE INDEX idx_message_templates_category ON message_templates(category);

-- Reminder schedules
CREATE TABLE IF NOT EXISTS reminder_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'custom')),
  custom_cron TEXT,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  recipient_filter JSONB DEFAULT '{}'::jsonb, -- e.g., {"role": "tenant", "lease_status": "active"}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminder_schedules_account ON reminder_schedules(account_id);
CREATE INDEX idx_reminder_schedules_next_run ON reminder_schedules(next_run_at) WHERE is_active = true;

-- Reminder runs
CREATE TABLE IF NOT EXISTS reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES reminder_schedules(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  recipients_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminder_runs_schedule ON reminder_runs(schedule_id);
CREATE INDEX idx_reminder_runs_status ON reminder_runs(status);

-- ============================================================================
-- 7. HVAC PROGRAM ENHANCEMENTS
-- ============================================================================

-- Rename and enhance HVAC tables
ALTER TABLE hvac_filter_subscriptions RENAME TO hvac_program_enrollments;
ALTER TABLE hvac_filter_deliveries RENAME TO hvac_delivery_schedules;

-- Add batch tracking
CREATE TABLE IF NOT EXISTS hvac_delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  total_units INTEGER NOT NULL,
  total_filters INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  carrier TEXT,
  tracking_numbers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hvac_delivery_schedules ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES hvac_delivery_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_hvac_batches_account ON hvac_delivery_batches(account_id);
CREATE INDEX idx_hvac_batches_date ON hvac_delivery_batches(delivery_date);

-- ============================================================================
-- 8. ENHANCED RBAC
-- ============================================================================

-- Update account_members with more roles
ALTER TABLE account_members DROP CONSTRAINT IF EXISTS account_members_role_check;
ALTER TABLE account_members ADD CONSTRAINT account_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'maintenance', 'agent', 'readonly', 'tenant', 'vendor'));

-- Permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  resource TEXT NOT NULL, -- e.g., 'properties', 'tenants', 'maintenance', 'financials'
  action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'export')),
  allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, resource, action)
);

-- Seed default permissions
INSERT INTO role_permissions (role, resource, action, allowed) VALUES
-- Owner: full access
('owner', '*', '*', true),
-- Admin: full access except billing
('admin', '*', '*', true),
-- Manager: properties, tenants, maintenance, showings
('manager', 'properties', 'read', true),
('manager', 'properties', 'update', true),
('manager', 'tenants', 'create', true),
('manager', 'tenants', 'read', true),
('manager', 'tenants', 'update', true),
('manager', 'maintenance', 'create', true),
('manager', 'maintenance', 'read', true),
('manager', 'maintenance', 'update', true),
('manager', 'showings', 'create', true),
('manager', 'showings', 'read', true),
('manager', 'financials', 'read', true),
-- Maintenance: only maintenance tickets
('maintenance', 'maintenance', 'read', true),
('maintenance', 'maintenance', 'update', true),
-- Agent: showings and applications
('agent', 'showings', 'create', true),
('agent', 'showings', 'read', true),
('agent', 'showings', 'update', true),
('agent', 'applications', 'read', true),
-- Readonly: view only
('readonly', '*', 'read', true)
ON CONFLICT (role, resource, action) DO NOTHING;

-- ============================================================================
-- 9. ROW LEVEL SECURITY UPDATES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_sla_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE showing_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE showing_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lock_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for new tables (account member access)
CREATE POLICY activity_events_select ON activity_events FOR SELECT USING (is_account_member(account_id));
CREATE POLICY screening_results_select ON screening_results FOR SELECT USING (is_account_member(account_id));
CREATE POLICY work_orders_select ON work_orders FOR SELECT USING (is_account_member(account_id));
CREATE POLICY maintenance_sla_metrics_select ON maintenance_sla_metrics FOR SELECT USING (is_account_member(account_id));
CREATE POLICY showing_invites_select ON showing_invites FOR SELECT USING (is_account_member(account_id));
CREATE POLICY showing_outcomes_select ON showing_outcomes FOR SELECT USING (is_account_member(account_id));
CREATE POLICY lock_integrations_select ON lock_integrations FOR SELECT USING (is_account_member(account_id));
CREATE POLICY payment_attempts_select ON payment_attempts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY ledger_entries_select ON ledger_entries FOR SELECT USING (is_account_member(account_id));
CREATE POLICY expenses_select ON expenses FOR SELECT USING (is_account_member(account_id));
CREATE POLICY expense_categories_select ON expense_categories FOR SELECT USING (is_account_member(account_id));
CREATE POLICY conversations_select ON conversations FOR SELECT USING (is_account_member(account_id));
CREATE POLICY message_templates_select ON message_templates FOR SELECT USING (is_account_member(account_id));
CREATE POLICY reminder_schedules_select ON reminder_schedules FOR SELECT USING (is_account_member(account_id));
CREATE POLICY reminder_runs_select ON reminder_runs FOR SELECT USING (is_account_member(account_id));
CREATE POLICY hvac_delivery_batches_select ON hvac_delivery_batches FOR SELECT USING (is_account_member(account_id));
CREATE POLICY role_permissions_select ON role_permissions FOR SELECT USING (true); -- Public read for permissions

-- ============================================================================
-- 10. TRIGGERS & FUNCTIONS
-- ============================================================================

-- Function to log activity events
CREATE OR REPLACE FUNCTION log_activity_event(
  p_account_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_summary TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO activity_events (
    account_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    summary,
    metadata
  ) VALUES (
    p_account_id,
    auth.uid(),
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_summary,
    p_metadata
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create work order when maintenance request is created
CREATE OR REPLACE FUNCTION create_work_order_for_maintenance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO work_orders (
    account_id,
    maintenance_request_id,
    work_order_number,
    status
  ) VALUES (
    NEW.account_id,
    NEW.id,
    'WO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(NEW.id::TEXT, 1, 8),
    'scheduled'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_work_order_on_maintenance
  AFTER INSERT ON maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION create_work_order_for_maintenance();

-- Update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.conversation_id IS NOT NULL)
  EXECUTE FUNCTION update_conversation_timestamp();

-- ============================================================================
-- 11. UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================================================

CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lock_integrations_updated_at BEFORE UPDATE ON lock_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reminder_schedules_updated_at BEFORE UPDATE ON reminder_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hvac_delivery_batches_updated_at BEFORE UPDATE ON hvac_delivery_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON MIGRATION IS 'Complete multi-tenant property management schema with RBAC, audit logging, and all features';
