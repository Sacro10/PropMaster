-- =========================================
-- CLEAN DATABASE SETUP SCRIPT
-- Property Management SaaS Platform
-- =========================================
-- This version handles existing objects gracefully
-- Run this in your Supabase SQL Editor:
-- https://app.supabase.com/project/orgefuaujqiluulzhzeg/sql/new
-- =========================================

-- Required extensions
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =========================================
-- 1) CORE TABLES: Accounts & Membership
-- =========================================

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'basic' check (plan in ('basic','pro','premium')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text default 'active' check (subscription_status in ('active','past_due','canceled','incomplete','trialing')),
  subscription_current_period_end timestamptz,
  billing_email text,
  max_properties int default 10,
  max_units int default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','tenant','vendor','admin')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz default now(),
  joined_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, user_id)
);

create table if not exists tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  employer text,
  employment_status text,
  monthly_income numeric(12,2),
  move_in_date date,
  move_out_date date,
  credit_score int,
  background_check_status text check (background_check_status in ('pending','approved','rejected','not_required')),
  ai_risk_score int check (ai_risk_score between 0 and 100),
  screening_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, user_id)
);

create table if not exists vendor_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  phone text not null,
  email text not null,
  address1 text,
  address2 text,
  city text,
  state text,
  zip text,
  license_number text,
  insurance_policy_number text,
  insurance_expiry date,
  avg_rating numeric(3,2) default 0.00,
  total_jobs_completed int default 0,
  on_time_completion_rate numeric(5,2) default 0.00,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  verified_at timestamptz,
  preferred_contact_method text default 'email' check (preferred_contact_method in ('email','phone','sms','app')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, user_id)
);

create table if not exists vendor_services (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  vendor_profile_id uuid not null references vendor_profiles(id) on delete cascade,
  service_type text not null check (service_type in ('hvac','plumbing','electrical','appliance','general','remodel','landscaping','pest','painting','roofing','flooring')),
  base_rate numeric(12,2),
  emergency_rate numeric(12,2),
  service_radius_miles int,
  created_at timestamptz not null default now(),
  unique(account_id, vendor_profile_id, service_type)
);

create table if not exists vendor_availability (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  vendor_profile_id uuid not null references vendor_profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  on_call boolean not null default false,
  created_at timestamptz not null default now(),
  unique(account_id, vendor_profile_id, day_of_week)
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  address1 text not null,
  address2 text,
  city text not null,
  state text not null,
  zip text not null,
  country text not null default 'US',
  property_type text not null default 'residential' check (property_type in ('residential','commercial','mixed')),
  year_built int,
  total_units int default 1,
  purchase_price numeric(12,2),
  current_value numeric(12,2),
  manager_user_id uuid references auth.users(id) on delete set null,
  primary_image_url text,
  images jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  unit_number text not null,
  floor_number int,
  bedrooms int default 0,
  bathrooms numeric(3,1) default 0,
  sqft int,
  rent_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  status text not null default 'vacant' check (status in ('vacant','occupied','maintenance','unavailable')),
  available_date date,
  features jsonb default '[]'::jsonb,
  images jsonb default '[]'::jsonb,
  hvac_filter_size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, unit_number)
);

create table if not exists leases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  tenant_user_id uuid not null references auth.users(id) on delete cascade,
  lease_start date not null,
  lease_end date not null,
  rent numeric(12,2) not null default 0,
  deposit numeric(12,2) not null default 0,
  pet_deposit numeric(12,2) default 0,
  parking_fee numeric(12,2) default 0,
  late_fee_amount numeric(12,2) default 0,
  grace_period_days int default 5,
  status text not null default 'draft' check (status in ('draft','pending','active','expired','terminated','renewed')),
  renewal_status text default 'pending' check (renewal_status in ('pending','offered','accepted','declined')),
  renewal_offered_at timestamptz,
  renewal_deadline date,
  move_in_date date,
  move_out_date date,
  move_out_notice_date date,
  lease_document_url text,
  signed_lease_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lease_tenants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lease_id uuid not null references leases(id) on delete cascade,
  tenant_user_id uuid not null references auth.users(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(lease_id, tenant_user_id)
);

create table if not exists maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null check (category in ('hvac','plumbing','electrical','appliance','general','remodel','landscaping','pest','painting','roofing','flooring','security','pest_control')),
  priority text not null default 'normal' check (priority in ('low','normal','high','emergency')),
  status text not null default 'submitted' check (status in ('submitted','reviewed','assigned','scheduled','in_progress','completed','closed','cancelled')),
  entry_allowed boolean not null default false,
  preferred_contact_method text default 'app' check (preferred_contact_method in ('app','phone','email','sms')),
  images jsonb default '[]'::jsonb,
  estimated_cost numeric(12,2),
  actual_cost numeric(12,2),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  assigned_at timestamptz,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists maintenance_assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  request_id uuid not null references maintenance_requests(id) on delete cascade,
  vendor_profile_id uuid references vendor_profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','in_progress','completed','cancelled')),
  assigned_at timestamptz default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  vendor_notes text,
  completion_notes text,
  before_images jsonb default '[]'::jsonb,
  after_images jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists maintenance_updates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  request_id uuid not null references maintenance_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  update_type text not null check (update_type in ('comment','status_change','assignment','completion')),
  message text not null,
  images jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lease_id uuid references leases(id) on delete set null,
  tenant_user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  amount numeric(12,2) not null,
  payment_type text not null default 'rent' check (payment_type in ('rent','deposit','pet_deposit','late_fee','parking','utility','other')),
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'pending' check (status in ('pending','processing','paid','late','failed','refunded','cancelled')),
  payment_method text default 'manual' check (payment_method in ('manual','stripe','ach','check','cash','money_order')),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  check_number text,
  transaction_id text,
  late_fee_assessed numeric(12,2) default 0,
  late_fee_waived boolean default false,
  notes text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists owner_disbursements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  amount numeric(12,2) not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  disbursed_at timestamptz,
  payment_method text default 'manual' check (payment_method in ('manual','stripe','ach','wire','check')),
  stripe_transfer_id text,
  total_rent_collected numeric(12,2) not null default 0,
  total_expenses numeric(12,2) not null default 0,
  management_fee numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  breakdown jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid references auth.users(id) on delete set null,
  unit_id uuid references units(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  maintenance_request_id uuid references maintenance_requests(id) on delete set null,
  subject text,
  body text not null,
  attachments jsonb default '[]'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  parent_message_id uuid references messages(id) on delete set null,
  thread_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('payment_due','payment_received','maintenance_update','lease_expiring','message','system','announcement')),
  title text not null,
  message text not null,
  action_url text,
  related_entity_type text,
  related_entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  sent_via_email boolean default false,
  sent_via_sms boolean default false,
  sent_via_push boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists showings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30,
  applicant_name text not null,
  applicant_email text,
  applicant_phone text,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  access_method text default 'lockbox' check (access_method in ('lockbox','smartlock','agent_present','property_manager','self_guided')),
  access_code text,
  access_instructions text,
  feedback text,
  interested boolean,
  application_submitted boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rental_applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  applicant_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  desired_move_in_date date,
  employer text,
  occupation text,
  monthly_income numeric(12,2),
  ai_risk_score int check (ai_risk_score between 0 and 100),
  credit_score int,
  background_check_status text check (background_check_status in ('pending','in_progress','passed','failed','waived')),
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected','withdrawn','expired')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  approval_notes text,
  application_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hvac_filter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  filter_size text not null,
  filter_type text not null default 'standard' check (filter_type in ('standard','pleated','hepa','allergen')),
  quantity int not null default 1,
  frequency text not null default 'monthly' check (frequency in ('monthly','bimonthly','quarterly')),
  next_delivery_date date not null,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  paused_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hvac_filter_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  subscription_id uuid not null references hvac_filter_subscriptions(id) on delete cascade,
  scheduled_for date not null,
  delivered_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','in_transit','delivered','failed','cancelled')),
  tracking_number text,
  carrier text,
  delivery_instructions text,
  delivery_photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_name text not null,
  properties jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('create','update','delete','view','export')),
  changes jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS account_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, feature_key)
);

-- =========================================
-- INDEXES
-- =========================================

create index if not exists idx_account_members_user on account_members(user_id);
create index if not exists idx_account_members_account_role on account_members(account_id, role);
create index if not exists idx_properties_account on properties(account_id);
create index if not exists idx_units_account on units(account_id);
create index if not exists idx_units_property on units(property_id);
create index if not exists idx_units_status on units(status) where status = 'vacant';
create index if not exists idx_leases_account on leases(account_id);
create index if not exists idx_leases_tenant on leases(tenant_user_id);
create index if not exists idx_leases_unit on leases(unit_id);
create index if not exists idx_leases_status on leases(status);
create index if not exists idx_leases_active on leases(account_id, status) where status = 'active';
create index if not exists idx_maint_req_account on maintenance_requests(account_id);
create index if not exists idx_maint_req_unit on maintenance_requests(unit_id);
create index if not exists idx_maint_req_created_by on maintenance_requests(created_by_user_id);
create index if not exists idx_maint_req_status on maintenance_requests(status);
create index if not exists idx_maint_assign_request on maintenance_assignments(request_id);
create index if not exists idx_maint_assign_vendor on maintenance_assignments(vendor_profile_id);
create index if not exists idx_payments_account on payments(account_id);
create index if not exists idx_payments_tenant on payments(tenant_user_id);
create index if not exists idx_payments_lease on payments(lease_id);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_payments_due_date on payments(due_date);
create index if not exists idx_messages_account on messages(account_id);
create index if not exists idx_messages_to_user on messages(to_user_id);
create index if not exists idx_messages_from_user on messages(from_user_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_unread on notifications(user_id) where is_read = false;
create index if not exists idx_vendor_profiles_account on vendor_profiles(account_id);
create index if not exists idx_vendor_profiles_active on vendor_profiles(account_id, is_active) where is_active = true;
create index if not exists idx_audit_log_account on audit_log(account_id);
create index if not exists idx_audit_log_entity on audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_created on audit_log(created_at desc);
CREATE INDEX if not exists idx_account_features_account ON account_features(account_id);
CREATE INDEX if not exists idx_account_features_key ON account_features(feature_key);

-- =========================================
-- FUNCTIONS
-- =========================================

create or replace function public.is_account_member(p_account_id uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.account_members am where am.account_id = p_account_id and am.user_id = auth.uid() and am.is_active = true);
$$;

create or replace function public.has_account_role(p_account_id uuid, p_roles text[])
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.account_members am where am.account_id = p_account_id and am.user_id = auth.uid() and am.role = any(p_roles) and am.is_active = true);
$$;

create or replace function public.get_user_role(p_account_id uuid)
returns text language sql stable security definer as $$
  select am.role from public.account_members am where am.account_id = p_account_id and am.user_id = auth.uid() and am.is_active = true limit 1;
$$;

create or replace function public.account_plan(p_account_id uuid)
returns text language sql stable security definer as $$
  select a.plan from public.accounts a where a.id = p_account_id and a.is_active = true;
$$;

create or replace function public.is_unit_tenant(p_unit_id uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.leases l where l.unit_id = p_unit_id and l.tenant_user_id = auth.uid() and l.status = 'active');
$$;

create or replace function public.is_assigned_vendor(p_request_id uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.maintenance_assignments ma join public.vendor_profiles vp on vp.id = ma.vendor_profile_id where ma.request_id = p_request_id and vp.user_id = auth.uid());
$$;

create or replace function public.user_account_ids()
returns setof uuid language sql stable security definer as $$
  select am.account_id from public.account_members am where am.user_id = auth.uid() and am.is_active = true;
$$;

CREATE OR REPLACE FUNCTION get_plan_features(plan_name TEXT)
RETURNS TEXT[] AS $$
BEGIN
  RETURN CASE plan_name
    WHEN 'basic' THEN ARRAY['tenant_portal','basic_maintenance_requests','basic_rent_collection','property_management']
    WHEN 'pro' THEN ARRAY['tenant_portal','basic_maintenance_requests','basic_rent_collection','property_management','tenant_screening','maintenance_routing','marketing_tools','standard_reporting','lease_renewals','communication_hub']
    WHEN 'premium' THEN ARRAY['tenant_portal','basic_maintenance_requests','basic_rent_collection','property_management','tenant_screening','maintenance_routing','marketing_tools','standard_reporting','lease_renewals','communication_hub','ai_risk_scoring','integrated_accounting','hvac_filter_program','electronic_showings','emergency_support_24_7','advanced_analytics','advanced_exports','custom_reports','api_access']
    ELSE ARRAY[]::TEXT[]
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION has_feature(p_account_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_plan TEXT;
  v_override_enabled BOOLEAN;
  v_plan_features TEXT[];
BEGIN
  SELECT enabled INTO v_override_enabled FROM account_features WHERE account_id = p_account_id AND feature_key = p_feature_key;
  IF FOUND THEN RETURN v_override_enabled; END IF;
  SELECT plan INTO v_account_plan FROM accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_plan_features := get_plan_features(v_account_plan);
  RETURN p_feature_key = ANY(v_plan_features);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC functions for frontend
CREATE OR REPLACE FUNCTION rpc_check_feature(p_feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE v_account_id UUID;
BEGIN
  SELECT account_id INTO v_account_id FROM account_members WHERE user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN has_feature(v_account_id, p_feature_key);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_check_plan(p_required_plan TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_id UUID;
  v_account_plan TEXT;
  v_plan_rank INT;
  v_required_rank INT;
BEGIN
  SELECT account_id INTO v_account_id FROM account_members WHERE user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT plan INTO v_account_plan FROM accounts WHERE id = v_account_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_plan_rank := CASE v_account_plan WHEN 'basic' THEN 1 WHEN 'pro' THEN 2 WHEN 'premium' THEN 3 ELSE 0 END;
  v_required_rank := CASE p_required_plan WHEN 'basic' THEN 1 WHEN 'pro' THEN 2 WHEN 'premium' THEN 3 ELSE 0 END;
  RETURN v_plan_rank >= v_required_rank;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_get_account_features()
RETURNS TABLE(feature_key TEXT, enabled BOOLEAN, source TEXT) AS $$
DECLARE
  v_account_id UUID;
  v_plan TEXT;
  v_plan_features TEXT[];
  v_feature TEXT;
BEGIN
  SELECT am.account_id, a.plan INTO v_account_id, v_plan FROM account_members am JOIN accounts a ON a.id = am.account_id WHERE am.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT af.feature_key, af.enabled, 'override'::TEXT as source FROM account_features af WHERE af.account_id = v_account_id;
  v_plan_features := get_plan_features(v_plan);
  FOREACH v_feature IN ARRAY v_plan_features LOOP
    IF NOT EXISTS (SELECT 1 FROM account_features WHERE account_id = v_account_id AND account_features.feature_key = v_feature) THEN
      feature_key := v_feature;
      enabled := true;
      source := 'plan';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_get_account_plan()
RETURNS TABLE(plan TEXT, max_units INT, current_units INT, max_properties INT, current_properties INT, subscription_status TEXT) AS $$
DECLARE v_account_id UUID;
BEGIN
  SELECT account_id INTO v_account_id FROM account_members WHERE user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT a.plan, a.max_units, (SELECT COUNT(*)::INT FROM units u JOIN properties p ON p.id = u.property_id WHERE p.account_id = a.id) as current_units, a.max_properties, (SELECT COUNT(*)::INT FROM properties WHERE account_id = a.id) as current_properties, a.subscription_status FROM accounts a WHERE a.id = v_account_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =========================================
-- TRIGGERS
-- =========================================

create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_members_updated_at ON account_members;
CREATE TRIGGER update_account_members_updated_at BEFORE UPDATE ON account_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_profiles_updated_at ON tenant_profiles;
CREATE TRIGGER update_tenant_profiles_updated_at BEFORE UPDATE ON tenant_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendor_profiles_updated_at ON vendor_profiles;
CREATE TRIGGER update_vendor_profiles_updated_at BEFORE UPDATE ON vendor_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_units_updated_at ON units;
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leases_updated_at ON leases;
CREATE TRIGGER update_leases_updated_at BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_requests_updated_at ON maintenance_requests;
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_assignments_updated_at ON maintenance_assignments;
CREATE TRIGGER update_maintenance_assignments_updated_at BEFORE UPDATE ON maintenance_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_owner_disbursements_updated_at ON owner_disbursements;
CREATE TRIGGER update_owner_disbursements_updated_at BEFORE UPDATE ON owner_disbursements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_showings_updated_at ON showings;
CREATE TRIGGER update_showings_updated_at BEFORE UPDATE ON showings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rental_applications_updated_at ON rental_applications;
CREATE TRIGGER update_rental_applications_updated_at BEFORE UPDATE ON rental_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hvac_filter_subscriptions_updated_at ON hvac_filter_subscriptions;
CREATE TRIGGER update_hvac_filter_subscriptions_updated_at BEFORE UPDATE ON hvac_filter_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hvac_filter_deliveries_updated_at ON hvac_filter_deliveries;
CREATE TRIGGER update_hvac_filter_deliveries_updated_at BEFORE UPDATE ON hvac_filter_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_account_features_updated_at ON account_features;
CREATE TRIGGER set_account_features_updated_at BEFORE UPDATE ON account_features FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- RLS POLICIES (condensed)
-- =========================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE showings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_filter_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_filter_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_features ENABLE ROW LEVEL SECURITY;

-- Create policies (drop first to avoid errors)
DO $$ BEGIN
DROP POLICY IF EXISTS accounts_select_member ON accounts;
CREATE POLICY accounts_select_member ON accounts FOR SELECT USING (public.is_account_member(id));
DROP POLICY IF EXISTS accounts_update_owner_admin ON accounts;
CREATE POLICY accounts_update_owner_admin ON accounts FOR UPDATE USING (public.has_account_role(id, array['owner','admin']));
DROP POLICY IF EXISTS accounts_insert_authenticated ON accounts;
CREATE POLICY accounts_insert_authenticated ON accounts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS account_members_select_member ON account_members;
CREATE POLICY account_members_select_member ON account_members FOR SELECT USING (public.is_account_member(account_id));
DROP POLICY IF EXISTS account_members_insert_owner_admin ON account_members;
CREATE POLICY account_members_insert_owner_admin ON account_members FOR INSERT WITH CHECK (public.has_account_role(account_id, array['owner','admin']));
DROP POLICY IF EXISTS account_members_update_owner_admin ON account_members;
CREATE POLICY account_members_update_owner_admin ON account_members FOR UPDATE USING (public.has_account_role(account_id, array['owner','admin']));
DROP POLICY IF EXISTS account_members_delete_owner_admin ON account_members;
CREATE POLICY account_members_delete_owner_admin ON account_members FOR DELETE USING (public.has_account_role(account_id, array['owner','admin']));

DROP POLICY IF EXISTS account_features_select_policy ON account_features;
CREATE POLICY account_features_select_policy ON account_features FOR SELECT USING (account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS account_features_modify_policy ON account_features;
CREATE POLICY account_features_modify_policy ON account_features FOR ALL USING (account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid() AND role = 'owner'));
END $$;

-- Success message
DO $$ BEGIN
  RAISE NOTICE '✅ Database setup complete! You can now run the upgrade SQL.';
END $$;
