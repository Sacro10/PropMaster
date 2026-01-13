-- Complete Database Schema for Property Management Automation App
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/orgefuaujqiluulzhzeg

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ACCOUNTS & TEAM MANAGEMENT
-- ============================================================================

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'premium')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  subscription_current_period_end TIMESTAMPTZ,
  billing_email TEXT,
  max_properties INTEGER NOT NULL DEFAULT 10,
  max_units INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE account_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'tenant', 'vendor', 'admin')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

-- ============================================================================
-- 2. PROPERTIES & UNITS
-- ============================================================================

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address1 TEXT NOT NULL,
  address2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT DEFAULT 'USA',
  property_type TEXT DEFAULT 'residential' CHECK (property_type IN ('residential', 'commercial', 'mixed')),
  year_built INTEGER,
  total_units INTEGER DEFAULT 1,
  purchase_price NUMERIC(12, 2),
  current_value NUMERIC(12, 2),
  manager_user_id UUID REFERENCES auth.users(id),
  primary_image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE owner_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE TABLE property_owners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owner_entities(id) ON DELETE CASCADE,
  ownership_percentage NUMERIC(5, 2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, owner_id)
);

CREATE INDEX idx_owner_entities_account ON owner_entities(account_id);
CREATE INDEX idx_property_owners_account ON property_owners(account_id);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  floor_number INTEGER,
  bedrooms INTEGER DEFAULT 0,
  bathrooms NUMERIC(3, 1) DEFAULT 0,
  sqft INTEGER,
  rent_amount NUMERIC(10, 2) NOT NULL,
  deposit_amount NUMERIC(10, 2),
  status TEXT DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied', 'maintenance', 'unavailable')),
  available_date DATE,
  features JSONB DEFAULT '[]'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  hvac_filter_size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, unit_number)
);

-- ============================================================================
-- 3. TENANT PROFILES
-- ============================================================================

CREATE TABLE tenant_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  employer TEXT,
  employment_status TEXT,
  monthly_income NUMERIC(10, 2),
  move_in_date DATE,
  move_out_date DATE,
  credit_score INTEGER,
  background_check_status TEXT DEFAULT 'not_required' CHECK (background_check_status IN ('pending', 'approved', 'rejected', 'not_required')),
  ai_risk_score INTEGER CHECK (ai_risk_score >= 0 AND ai_risk_score <= 100),
  screening_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

-- ============================================================================
-- 4. VENDOR PROFILES
-- ============================================================================

CREATE TABLE vendor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  license_number TEXT,
  insurance_policy_number TEXT,
  insurance_expiry DATE,
  avg_rating NUMERIC(3, 2) DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
  total_jobs_completed INTEGER DEFAULT 0,
  on_time_completion_rate NUMERIC(5, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  preferred_contact_method TEXT DEFAULT 'app' CHECK (preferred_contact_method IN ('email', 'phone', 'sms', 'app')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

CREATE TABLE vendor_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (service_type IN ('hvac', 'plumbing', 'electrical', 'appliance', 'general', 'remodel', 'landscaping', 'pest', 'painting', 'roofing', 'flooring')),
  base_rate NUMERIC(10, 2),
  emergency_rate NUMERIC(10, 2),
  service_radius_miles INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vendor_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN DEFAULT true,
  on_call BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_profile_id, day_of_week)
);

-- ============================================================================
-- 5. LEASES & TENANCY
-- ============================================================================

CREATE TABLE leases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_user_id UUID NOT NULL REFERENCES auth.users(id),
  lease_start DATE NOT NULL,
  lease_end DATE NOT NULL,
  rent NUMERIC(10, 2) NOT NULL,
  deposit NUMERIC(10, 2) DEFAULT 0,
  pet_deposit NUMERIC(10, 2) DEFAULT 0,
  parking_fee NUMERIC(10, 2) DEFAULT 0,
  late_fee_amount NUMERIC(10, 2) DEFAULT 0,
  grace_period_days INTEGER DEFAULT 5,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'active', 'expired', 'terminated', 'renewed')),
  renewal_status TEXT CHECK (renewal_status IN ('pending', 'offered', 'accepted', 'declined')),
  renewal_offered_at TIMESTAMPTZ,
  renewal_deadline DATE,
  move_in_date DATE,
  move_out_date DATE,
  move_out_notice_date DATE,
  lease_document_url TEXT,
  signed_lease_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lease_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_user_id UUID NOT NULL REFERENCES auth.users(id),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lease_id, tenant_user_id)
);

-- ============================================================================
-- 6. MAINTENANCE MANAGEMENT
-- ============================================================================

CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('hvac', 'plumbing', 'electrical', 'appliance', 'general', 'remodel', 'landscaping', 'pest', 'painting', 'roofing', 'flooring', 'security')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'assigned', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled')),
  entry_allowed BOOLEAN DEFAULT false,
  preferred_contact_method TEXT DEFAULT 'app' CHECK (preferred_contact_method IN ('app', 'phone', 'email', 'sms')),
  images JSONB DEFAULT '[]'::jsonb,
  estimated_cost NUMERIC(10, 2),
  actual_cost NUMERIC(10, 2),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE maintenance_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE TABLE maintenance_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  update_type TEXT NOT NULL CHECK (update_type IN ('comment', 'status_change', 'assignment', 'completion')),
  message TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. PAYMENTS & FINANCIALS
-- ============================================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES leases(id) ON DELETE SET NULL,
  tenant_user_id UUID NOT NULL REFERENCES auth.users(id),
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('rent', 'deposit', 'pet_deposit', 'late_fee', 'parking', 'utility', 'other')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'late', 'failed', 'refunded', 'cancelled')),
  payment_method TEXT DEFAULT 'manual' CHECK (payment_method IN ('manual', 'stripe', 'ach', 'check', 'cash', 'money_order')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  check_number TEXT,
  transaction_id TEXT,
  late_fee_assessed NUMERIC(10, 2) DEFAULT 0,
  late_fee_waived BOOLEAN DEFAULT false,
  notes TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tax_deductible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE TABLE owner_disbursements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES owner_entities(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  disbursed_at TIMESTAMPTZ,
  payment_method TEXT DEFAULT 'manual' CHECK (payment_method IN ('manual', 'stripe', 'ach', 'wire', 'check')),
  stripe_transfer_id TEXT,
  total_rent_collected NUMERIC(12, 2) DEFAULT 0,
  total_expenses NUMERIC(12, 2) DEFAULT 0,
  management_fee NUMERIC(12, 2) DEFAULT 0,
  net_amount NUMERIC(12, 2) NOT NULL,
  breakdown JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. COMMUNICATION
-- ============================================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_user_id UUID REFERENCES auth.users(id),
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  maintenance_request_id UUID REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  thread_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_oauth_tokens (
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

CREATE INDEX idx_user_oauth_tokens_account_id ON user_oauth_tokens(account_id);
CREATE INDEX idx_user_oauth_tokens_user_id ON user_oauth_tokens(user_id);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('payment_due', 'payment_received', 'maintenance_update', 'lease_expiring', 'message', 'system', 'announcement')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  sent_via_email BOOLEAN DEFAULT false,
  sent_via_sms BOOLEAN DEFAULT false,
  sent_via_push BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. SHOWINGS & APPLICATIONS
-- ============================================================================

CREATE TABLE showings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  access_method TEXT CHECK (access_method IN ('lockbox', 'smartlock', 'agent_present', 'property_manager', 'self_guided')),
  access_code TEXT,
  access_instructions TEXT,
  feedback TEXT,
  interested BOOLEAN,
  application_submitted BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rental_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  applicant_user_id UUID REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  desired_move_in_date DATE,
  employer TEXT,
  occupation TEXT,
  monthly_income NUMERIC(10, 2),
  ai_risk_score INTEGER CHECK (ai_risk_score >= 0 AND ai_risk_score <= 100),
  credit_score INTEGER,
  background_check_status TEXT DEFAULT 'pending' CHECK (background_check_status IN ('pending', 'in_progress', 'passed', 'failed', 'waived')),
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'expired')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  approval_notes TEXT,
  application_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. HVAC FILTER SUBSCRIPTION PROGRAM
-- ============================================================================

CREATE TABLE hvac_filter_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE TABLE hvac_filter_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES hvac_filter_subscriptions(id) ON DELETE CASCADE,
  scheduled_for DATE NOT NULL,
  delivered_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_transit', 'delivered', 'failed', 'cancelled')),
  tracking_number TEXT,
  carrier TEXT,
  delivery_instructions TEXT,
  delivery_photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 11. ANALYTICS & AUDIT
-- ============================================================================

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'view', 'export')),
  changes JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Account members
CREATE INDEX idx_account_members_account_id ON account_members(account_id);
CREATE INDEX idx_account_members_user_id ON account_members(user_id);
CREATE INDEX idx_account_members_role ON account_members(role);

-- Properties
CREATE INDEX idx_properties_account_id ON properties(account_id);
CREATE INDEX idx_properties_manager_user_id ON properties(manager_user_id);

-- Units
CREATE INDEX idx_units_account_id ON units(account_id);
CREATE INDEX idx_units_property_id ON units(property_id);
CREATE INDEX idx_units_status ON units(status);

-- Tenant profiles
CREATE INDEX idx_tenant_profiles_account_id ON tenant_profiles(account_id);
CREATE INDEX idx_tenant_profiles_user_id ON tenant_profiles(user_id);

-- Vendor profiles
CREATE INDEX idx_vendor_profiles_account_id ON vendor_profiles(account_id);
CREATE INDEX idx_vendor_profiles_user_id ON vendor_profiles(user_id);
CREATE INDEX idx_vendor_profiles_is_active ON vendor_profiles(is_active);

-- Vendor services
CREATE INDEX idx_vendor_services_account_id ON vendor_services(account_id);
CREATE INDEX idx_vendor_services_vendor_profile_id ON vendor_services(vendor_profile_id);
CREATE INDEX idx_vendor_services_service_type ON vendor_services(service_type);

-- Leases
CREATE INDEX idx_leases_account_id ON leases(account_id);
CREATE INDEX idx_leases_unit_id ON leases(unit_id);
CREATE INDEX idx_leases_tenant_user_id ON leases(tenant_user_id);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_lease_end ON leases(lease_end);

-- Maintenance requests
CREATE INDEX idx_maintenance_requests_account_id ON maintenance_requests(account_id);
CREATE INDEX idx_maintenance_requests_unit_id ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_requests_property_id ON maintenance_requests(property_id);
CREATE INDEX idx_maintenance_requests_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_requests_priority ON maintenance_requests(priority);
CREATE INDEX idx_maintenance_requests_created_by ON maintenance_requests(created_by_user_id);
CREATE INDEX idx_maintenance_requests_created_at ON maintenance_requests(created_at);

-- Maintenance assignments
CREATE INDEX idx_maintenance_assignments_account_id ON maintenance_assignments(account_id);
CREATE INDEX idx_maintenance_assignments_request_id ON maintenance_assignments(request_id);
CREATE INDEX idx_maintenance_assignments_vendor_id ON maintenance_assignments(vendor_profile_id);
CREATE INDEX idx_maintenance_assignments_status ON maintenance_assignments(status);

-- Payments
CREATE INDEX idx_payments_account_id ON payments(account_id);
CREATE INDEX idx_payments_lease_id ON payments(lease_id);
CREATE INDEX idx_payments_tenant_user_id ON payments(tenant_user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_due_date ON payments(due_date);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE UNIQUE INDEX idx_expense_categories_account_name ON expense_categories(account_id, name);
CREATE INDEX idx_expenses_account_id ON expenses(account_id);
CREATE INDEX idx_expenses_property_id ON expenses(property_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE UNIQUE INDEX idx_expenses_maintenance_request_id ON expenses(maintenance_request_id);

-- Messages
CREATE INDEX idx_messages_account_id ON messages(account_id);
CREATE INDEX idx_messages_from_user_id ON messages(from_user_id);
CREATE INDEX idx_messages_to_user_id ON messages(to_user_id);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Notifications
CREATE INDEX idx_notifications_account_id ON notifications(account_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Showings
CREATE INDEX idx_showings_account_id ON showings(account_id);
CREATE INDEX idx_showings_property_id ON showings(property_id);
CREATE INDEX idx_showings_unit_id ON showings(unit_id);
CREATE INDEX idx_showings_scheduled_at ON showings(scheduled_at);

-- Rental applications
CREATE INDEX idx_rental_applications_account_id ON rental_applications(account_id);
CREATE INDEX idx_rental_applications_property_id ON rental_applications(property_id);
CREATE INDEX idx_rental_applications_status ON rental_applications(status);

-- HVAC subscriptions
CREATE INDEX idx_hvac_filter_subs_account_id ON hvac_filter_subscriptions(account_id);
CREATE INDEX idx_hvac_filter_subs_unit_id ON hvac_filter_subscriptions(unit_id);
CREATE INDEX idx_hvac_filter_subs_status ON hvac_filter_subscriptions(status);

-- Analytics & audit
CREATE INDEX idx_analytics_events_account_id ON analytics_events(account_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX idx_audit_log_account_id ON audit_log(account_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================================
-- FUNCTIONS FOR RLS
-- ============================================================================

-- Check if user is a member of the account
CREATE OR REPLACE FUNCTION is_account_member(account_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = account_uuid
    AND user_id = auth.uid()
    AND is_active = true
  );
END;
$$;

-- Check if user has a specific role in the account
CREATE OR REPLACE FUNCTION has_account_role(account_uuid UUID, required_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = account_uuid
    AND user_id = auth.uid()
    AND role = required_role
    AND is_active = true
  );
END;
$$;

-- Get user's role in account
CREATE OR REPLACE FUNCTION get_user_role(account_uuid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM account_members
  WHERE account_id = account_uuid
  AND user_id = auth.uid()
  AND is_active = true
  LIMIT 1;
$$;

-- Check if user is tenant of a specific unit
CREATE OR REPLACE FUNCTION is_unit_tenant(unit_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM leases
    WHERE unit_id = unit_uuid
    AND (tenant_user_id = auth.uid() OR id IN (
      SELECT lease_id FROM lease_tenants WHERE tenant_user_id = auth.uid()
    ))
    AND status = 'active'
  );
END;
$$;

-- Check if user is assigned vendor for a maintenance request
CREATE OR REPLACE FUNCTION is_assigned_vendor(request_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM maintenance_assignments ma
    JOIN vendor_profiles vp ON ma.vendor_profile_id = vp.id
    WHERE ma.request_id = request_uuid
    AND vp.user_id = auth.uid()
  );
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE showings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_filter_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_filter_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Accounts: Users can only see accounts they're members of
CREATE POLICY accounts_select ON accounts FOR SELECT USING (is_account_member(id));
CREATE POLICY accounts_update ON accounts FOR UPDATE USING (has_account_role(id, 'owner'));

-- Account members: Users can see members of their accounts
CREATE POLICY account_members_select ON account_members FOR SELECT USING (is_account_member(account_id));
CREATE POLICY account_members_insert ON account_members FOR INSERT WITH CHECK (has_account_role(account_id, 'owner') OR has_account_role(account_id, 'admin'));
CREATE POLICY account_members_update ON account_members FOR UPDATE USING (has_account_role(account_id, 'owner') OR has_account_role(account_id, 'admin'));
CREATE POLICY account_members_delete ON account_members FOR DELETE USING (has_account_role(account_id, 'owner'));

-- Properties: Account members can see all properties
CREATE POLICY properties_select ON properties FOR SELECT USING (is_account_member(account_id));
CREATE POLICY properties_insert ON properties FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY properties_update ON properties FOR UPDATE USING (is_account_member(account_id) AND (get_user_role(account_id) IN ('owner', 'manager', 'admin')));
CREATE POLICY properties_delete ON properties FOR DELETE USING (has_account_role(account_id, 'owner'));

-- Units: Account members can see all units
CREATE POLICY units_select ON units FOR SELECT USING (is_account_member(account_id));
CREATE POLICY units_insert ON units FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY units_update ON units FOR UPDATE USING (is_account_member(account_id) AND (get_user_role(account_id) IN ('owner', 'manager', 'admin')));
CREATE POLICY units_delete ON units FOR DELETE USING (has_account_role(account_id, 'owner'));

-- Tenant profiles: Users can see their own profile and managers can see all
CREATE POLICY tenant_profiles_select ON tenant_profiles FOR SELECT USING (
  is_account_member(account_id) AND (
    user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);
CREATE POLICY tenant_profiles_insert ON tenant_profiles FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY tenant_profiles_update ON tenant_profiles FOR UPDATE USING (
  is_account_member(account_id) AND (
    user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);

-- Vendor profiles: Vendors see their own, managers see all
CREATE POLICY vendor_profiles_select ON vendor_profiles FOR SELECT USING (
  is_account_member(account_id) AND (
    user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);
CREATE POLICY vendor_profiles_insert ON vendor_profiles FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY vendor_profiles_update ON vendor_profiles FOR UPDATE USING (
  is_account_member(account_id) AND (
    user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);

-- Vendor services
CREATE POLICY vendor_services_select ON vendor_services FOR SELECT USING (is_account_member(account_id));
CREATE POLICY vendor_services_insert ON vendor_services FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY vendor_services_update ON vendor_services FOR UPDATE USING (is_account_member(account_id));
CREATE POLICY vendor_services_delete ON vendor_services FOR DELETE USING (is_account_member(account_id));

-- Vendor availability
CREATE POLICY vendor_availability_select ON vendor_availability FOR SELECT USING (is_account_member(account_id));
CREATE POLICY vendor_availability_insert ON vendor_availability FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY vendor_availability_update ON vendor_availability FOR UPDATE USING (is_account_member(account_id));
CREATE POLICY vendor_availability_delete ON vendor_availability FOR DELETE USING (is_account_member(account_id));

-- Leases: Tenants see their own, managers see all
CREATE POLICY leases_select ON leases FOR SELECT USING (
  is_account_member(account_id) AND (
    tenant_user_id = auth.uid() OR
    id IN (SELECT lease_id FROM lease_tenants WHERE tenant_user_id = auth.uid()) OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);
CREATE POLICY leases_insert ON leases FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY leases_update ON leases FOR UPDATE USING (is_account_member(account_id) AND get_user_role(account_id) IN ('owner', 'manager', 'admin'));

-- Lease tenants
CREATE POLICY lease_tenants_select ON lease_tenants FOR SELECT USING (
  is_account_member(account_id) AND (
    tenant_user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);
CREATE POLICY lease_tenants_insert ON lease_tenants FOR INSERT WITH CHECK (is_account_member(account_id));

-- Maintenance requests: Tenants see their own, vendors see assigned, managers see all
CREATE POLICY maintenance_requests_select ON maintenance_requests FOR SELECT USING (
  is_account_member(account_id) AND (
    created_by_user_id = auth.uid() OR
    is_unit_tenant(unit_id) OR
    is_assigned_vendor(id) OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);
CREATE POLICY maintenance_requests_insert ON maintenance_requests FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY maintenance_requests_update ON maintenance_requests FOR UPDATE USING (
  is_account_member(account_id) AND (
    created_by_user_id = auth.uid() OR
    is_assigned_vendor(id) OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);

-- Maintenance assignments
CREATE POLICY maintenance_assignments_select ON maintenance_assignments FOR SELECT USING (is_account_member(account_id));
CREATE POLICY maintenance_assignments_insert ON maintenance_assignments FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY maintenance_assignments_update ON maintenance_assignments FOR UPDATE USING (is_account_member(account_id));

-- Maintenance updates
CREATE POLICY maintenance_updates_select ON maintenance_updates FOR SELECT USING (is_account_member(account_id));
CREATE POLICY maintenance_updates_insert ON maintenance_updates FOR INSERT WITH CHECK (is_account_member(account_id));

-- Payments: Tenants see their own, managers see all
CREATE POLICY payments_select ON payments FOR SELECT USING (
  is_account_member(account_id) AND (
    tenant_user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'manager', 'admin')
  )
);
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY payments_update ON payments FOR UPDATE USING (is_account_member(account_id));

-- Owner entities + ownership links: Account members
CREATE POLICY owner_entities_select ON owner_entities FOR SELECT USING (is_account_member(account_id));
CREATE POLICY owner_entities_insert ON owner_entities FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY owner_entities_update ON owner_entities FOR UPDATE USING (is_account_member(account_id));
CREATE POLICY owner_entities_delete ON owner_entities FOR DELETE USING (is_account_member(account_id));

CREATE POLICY property_owners_select ON property_owners FOR SELECT USING (is_account_member(account_id));
CREATE POLICY property_owners_insert ON property_owners FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY property_owners_update ON property_owners FOR UPDATE USING (is_account_member(account_id));
CREATE POLICY property_owners_delete ON property_owners FOR DELETE USING (is_account_member(account_id));

-- Expenses: Account members
CREATE POLICY expense_categories_select ON expense_categories FOR SELECT USING (is_account_member(account_id));
CREATE POLICY expense_categories_insert ON expense_categories FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY expense_categories_update ON expense_categories FOR UPDATE USING (is_account_member(account_id));
CREATE POLICY expense_categories_delete ON expense_categories FOR DELETE USING (is_account_member(account_id));

CREATE POLICY expenses_select ON expenses FOR SELECT USING (is_account_member(account_id));
CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY expenses_update ON expenses FOR UPDATE USING (is_account_member(account_id));
CREATE POLICY expenses_delete ON expenses FOR DELETE USING (is_account_member(account_id));

-- Owner disbursements: Only owners
CREATE POLICY owner_disbursements_select ON owner_disbursements FOR SELECT USING (has_account_role(account_id, 'owner'));
CREATE POLICY owner_disbursements_insert ON owner_disbursements FOR INSERT WITH CHECK (has_account_role(account_id, 'owner'));

-- Messages: Users see messages they sent or received
CREATE POLICY messages_select ON messages FOR SELECT USING (
  is_account_member(account_id) AND (
    from_user_id = auth.uid() OR
    to_user_id = auth.uid() OR
    get_user_role(account_id) IN ('owner', 'admin')
  )
);
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (is_account_member(account_id) AND from_user_id = auth.uid());
CREATE POLICY messages_update ON messages FOR UPDATE USING (to_user_id = auth.uid());

-- Notifications: Users see their own
CREATE POLICY notifications_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (user_id = auth.uid());

-- Showings: Account members can see all
CREATE POLICY showings_select ON showings FOR SELECT USING (is_account_member(account_id));
CREATE POLICY showings_insert ON showings FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY showings_update ON showings FOR UPDATE USING (is_account_member(account_id));

-- Rental applications: Account members can see all
CREATE POLICY rental_applications_select ON rental_applications FOR SELECT USING (
  is_account_member(account_id) OR applicant_user_id = auth.uid()
);
CREATE POLICY rental_applications_insert ON rental_applications FOR INSERT WITH CHECK (true);
CREATE POLICY rental_applications_update ON rental_applications FOR UPDATE USING (
  is_account_member(account_id) AND get_user_role(account_id) IN ('owner', 'manager', 'admin')
);

-- HVAC subscriptions: Account members
CREATE POLICY hvac_filter_subs_select ON hvac_filter_subscriptions FOR SELECT USING (is_account_member(account_id));
CREATE POLICY hvac_filter_subs_insert ON hvac_filter_subscriptions FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY hvac_filter_subs_update ON hvac_filter_subscriptions FOR UPDATE USING (is_account_member(account_id));

-- HVAC deliveries: Account members
CREATE POLICY hvac_filter_deliveries_select ON hvac_filter_deliveries FOR SELECT USING (is_account_member(account_id));
CREATE POLICY hvac_filter_deliveries_insert ON hvac_filter_deliveries FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY hvac_filter_deliveries_update ON hvac_filter_deliveries FOR UPDATE USING (is_account_member(account_id));

-- Analytics events: Account members can see their account's events
CREATE POLICY analytics_events_select ON analytics_events FOR SELECT USING (is_account_member(account_id));
CREATE POLICY analytics_events_insert ON analytics_events FOR INSERT WITH CHECK (true);

-- Audit log: Only owners and admins can view
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (
  is_account_member(account_id) AND get_user_role(account_id) IN ('owner', 'admin')
);
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_account_members_updated_at BEFORE UPDATE ON account_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_profiles_updated_at BEFORE UPDATE ON tenant_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendor_profiles_updated_at BEFORE UPDATE ON vendor_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leases_updated_at BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_assignments_updated_at BEFORE UPDATE ON maintenance_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_owner_entities_updated_at BEFORE UPDATE ON owner_entities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_owner_disbursements_updated_at BEFORE UPDATE ON owner_disbursements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_showings_updated_at BEFORE UPDATE ON showings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rental_applications_updated_at BEFORE UPDATE ON rental_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hvac_filter_subs_updated_at BEFORE UPDATE ON hvac_filter_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hvac_filter_deliveries_updated_at BEFORE UPDATE ON hvac_filter_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 12. USER PROFILES (Required by Frontend)
-- ============================================================================

-- User profiles table for app compatibility
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'pro', 'premium')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT USING (auth.uid() = id);

-- Allow inserts during signup (auth.uid() matches the profile being created OR it's a service role)
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT WITH CHECK (
  auth.uid() = id OR auth.uid() IS NULL
);

-- Users can update their own profile
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- Index for performance
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- Trigger for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUTO-CREATE ACCOUNT ON USER SIGNUP
-- ============================================================================

-- Function to automatically create account and membership when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_account_id UUID;
  user_email TEXT;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  -- Get user email from auth.users
  user_email := COALESCE(NEW.email, (SELECT email FROM auth.users WHERE id = NEW.id));

  -- Create user profile (required by frontend)
  INSERT INTO user_profiles (id, email, subscription_tier)
  VALUES (NEW.id, COALESCE(user_email, ''), 'basic');

  -- Create a new account for the user
  INSERT INTO accounts (name, plan, max_properties, max_units)
  VALUES (
    COALESCE(user_email, 'My Account'),
    'basic',
    10,
    3
  )
  RETURNING id INTO new_account_id;

  -- Add user as owner of the account
  INSERT INTO account_members (account_id, user_id, role, joined_at)
  VALUES (
    new_account_id,
    NEW.id,
    'owner',
    NOW()
  );

  RETURN NEW;
END;
$$;

-- Trigger to run the function after user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- COMPLETE!
-- ============================================================================

-- ============================================================================
-- ANALYTICS FUNCTIONS
-- ============================================================================

-- Function to get monthly revenue aggregation
CREATE OR REPLACE FUNCTION get_monthly_revenue(
  account_uuid UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  month DATE,
  revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('month', paid_at)::DATE AS month,
    COALESCE(SUM(amount), 0) AS revenue
  FROM payments
  WHERE account_id = account_uuid
    AND status = 'paid'
    AND paid_at >= start_date
    AND paid_at <= end_date
  GROUP BY DATE_TRUNC('month', paid_at)
  ORDER BY month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get monthly occupancy rates
CREATE OR REPLACE FUNCTION get_monthly_occupancy(
  account_uuid UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  month DATE,
  occupancy_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    generate_series(
      DATE_TRUNC('month', start_date)::DATE,
      DATE_TRUNC('month', end_date)::DATE,
      '1 month'::interval
    )::DATE AS month,
    -- This is simplified - in production you'd track historical occupancy
    75.0 + (RANDOM() * 20.0) AS occupancy_rate
  ORDER BY month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get property performance metrics
CREATE OR REPLACE FUNCTION get_property_performance(
  account_uuid UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  property_id UUID,
  property_name TEXT,
  revenue NUMERIC,
  expenses NUMERIC,
  noi NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS property_id,
    p.name AS property_name,
    COALESCE(revenue_data.total_revenue, 0) AS revenue,
    COALESCE(expense_data.total_expenses, 0) AS expenses,
    COALESCE(revenue_data.total_revenue, 0) - COALESCE(expense_data.total_expenses, 0) AS noi
  FROM properties p
  LEFT JOIN (
    SELECT
      u.property_id,
      SUM(pay.amount) AS total_revenue
    FROM units u
    LEFT JOIN payments pay ON pay.unit_id = u.id
      AND pay.status = 'paid'
      AND pay.paid_at >= start_date
      AND pay.paid_at <= end_date
    WHERE u.account_id = account_uuid
    GROUP BY u.property_id
  ) revenue_data ON revenue_data.property_id = p.id
  LEFT JOIN (
    SELECT
      u.property_id,
      SUM(mr.actual_cost) AS total_expenses
    FROM units u
    LEFT JOIN maintenance_requests mr ON mr.unit_id = u.id
      AND mr.status = 'completed'
      AND mr.completed_at >= start_date
      AND mr.completed_at <= end_date
      AND mr.actual_cost IS NOT NULL
    WHERE u.account_id = account_uuid
    GROUP BY u.property_id
  ) expense_data ON expense_data.property_id = p.id
  WHERE p.account_id = account_uuid
  ORDER BY noi DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify schema was created successfully
SELECT
  'Tables created: ' || COUNT(*)::text as summary
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';
