-- =========================================
-- COMPLETE DATABASE SETUP SCRIPT
-- Property Management SaaS Platform
-- =========================================
-- This script sets up the entire database schema including:
-- 1. Initial schema (tables, indexes, functions)
-- 2. Row Level Security policies
-- 3. Plan gating system
--
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

  -- Subscription plan (basic/pro/premium)
  plan text not null default 'basic'
    check (plan in ('basic','pro','premium')),

  -- Stripe integration fields
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text default 'active'
    check (subscription_status in ('active','past_due','canceled','incomplete','trialing')),
  subscription_current_period_end timestamptz,

  -- Billing contact
  billing_email text,

  -- Feature limits (enforced in app + RLS)
  max_properties int default 10, -- basic: 10, pro: 50, premium: unlimited
  max_units int default 100,      -- basic: 100, pro: 500, premium: unlimited

  -- Account status
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Account membership with roles
create table if not exists account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Role-based access control
  role text not null
    check (role in ('owner','manager','tenant','vendor','admin')),

  -- Invitation tracking
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz default now(),
  joined_at timestamptz,

  -- Status
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(account_id, user_id)
);

-- =========================================
-- 2) USER PROFILES (Tenant & Vendor)
-- =========================================

create table if not exists tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Personal information
  full_name text,
  phone text,
  email text, -- May differ from auth email

  -- Emergency contact
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,

  -- Employment info (for screening)
  employer text,
  employment_status text,
  monthly_income numeric(12,2),

  -- Move-in/out tracking
  move_in_date date,
  move_out_date date,

  -- AI screening data
  credit_score int,
  background_check_status text
    check (background_check_status in ('pending','approved','rejected','not_required')),
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

  -- Business information
  business_name text not null,
  phone text not null,
  email text not null,

  -- Address
  address1 text,
  address2 text,
  city text,
  state text,
  zip text,

  -- Business details
  license_number text,
  insurance_policy_number text,
  insurance_expiry date,

  -- Ratings & performance
  avg_rating numeric(3,2) default 0.00,
  total_jobs_completed int default 0,
  on_time_completion_rate numeric(5,2) default 0.00,

  -- Status
  is_active boolean not null default true,
  is_verified boolean not null default false,
  verified_at timestamptz,

  -- Preferences
  preferred_contact_method text default 'email'
    check (preferred_contact_method in ('email','phone','sms','app')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(account_id, user_id)
);

create table if not exists vendor_services (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  vendor_profile_id uuid not null references vendor_profiles(id) on delete cascade,

  service_type text not null
    check (service_type in ('hvac','plumbing','electrical','appliance','general','remodel','landscaping','pest','painting','roofing','flooring')),

  base_rate numeric(12,2),
  emergency_rate numeric(12,2),

  -- Service area (optional)
  service_radius_miles int,

  created_at timestamptz not null default now(),

  unique(account_id, vendor_profile_id, service_type)
);

create table if not exists vendor_availability (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  vendor_profile_id uuid not null references vendor_profiles(id) on delete cascade,

  day_of_week int not null check (day_of_week between 0 and 6), -- 0=Sunday
  start_time time not null,
  end_time time not null,

  is_available boolean not null default true,
  on_call boolean not null default false,

  created_at timestamptz not null default now(),

  unique(account_id, vendor_profile_id, day_of_week)
);

-- =========================================
-- 3) PROPERTIES & UNITS
-- =========================================

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  -- Basic info
  name text not null,

  -- Address
  address1 text not null,
  address2 text,
  city text not null,
  state text not null,
  zip text not null,
  country text not null default 'US',

  -- Property details
  property_type text not null default 'residential'
    check (property_type in ('residential','commercial','mixed')),
  year_built int,
  total_units int default 1,

  -- Financial
  purchase_price numeric(12,2),
  current_value numeric(12,2),

  -- Management
  manager_user_id uuid references auth.users(id) on delete set null,

  -- Images
  primary_image_url text,
  images jsonb default '[]'::jsonb,

  -- Notes
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,

  -- Unit identification
  unit_number text not null,
  floor_number int,

  -- Physical details
  bedrooms int default 0,
  bathrooms numeric(3,1) default 0,
  sqft int,

  -- Rental information
  rent_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,

  -- Status
  status text not null default 'vacant'
    check (status in ('vacant','occupied','maintenance','unavailable')),
  available_date date,

  -- Amenities & features
  features jsonb default '[]'::jsonb, -- ['parking','balcony','washer_dryer']

  -- Images
  images jsonb default '[]'::jsonb,

  -- HVAC filter size (for automated delivery)
  hvac_filter_size text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(property_id, unit_number)
);

-- =========================================
-- 4) LEASES & TENANCY
-- =========================================

create table if not exists leases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,

  -- Tenant information
  tenant_user_id uuid not null references auth.users(id) on delete cascade,

  -- Lease terms
  lease_start date not null,
  lease_end date not null,

  -- Financial terms
  rent numeric(12,2) not null default 0,
  deposit numeric(12,2) not null default 0,

  -- Additional charges
  pet_deposit numeric(12,2) default 0,
  parking_fee numeric(12,2) default 0,
  late_fee_amount numeric(12,2) default 0,
  grace_period_days int default 5,

  -- Lease status
  status text not null default 'draft'
    check (status in ('draft','pending','active','expired','terminated','renewed')),

  -- Renewal tracking
  renewal_status text default 'pending'
    check (renewal_status in ('pending','offered','accepted','declined')),
  renewal_offered_at timestamptz,
  renewal_deadline date,

  -- Move in/out
  move_in_date date,
  move_out_date date,
  move_out_notice_date date,

  -- Documents
  lease_document_url text,
  signed_lease_url text,

  -- Notes
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Co-tenants/roommates (multiple people on one lease)
create table if not exists lease_tenants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lease_id uuid not null references leases(id) on delete cascade,
  tenant_user_id uuid not null references auth.users(id) on delete cascade,

  is_primary boolean not null default false,

  created_at timestamptz not null default now(),

  unique(lease_id, tenant_user_id)
);

-- =========================================
-- 5) MAINTENANCE MANAGEMENT
-- =========================================

create table if not exists maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,

  -- Request details
  created_by_user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  description text not null,

  category text not null
    check (category in ('hvac','plumbing','electrical','appliance','general','remodel','landscaping','pest','painting','roofing','flooring','security','pest_control')),

  priority text not null default 'normal'
    check (priority in ('low','normal','high','emergency')),

  -- Status workflow
  status text not null default 'submitted'
    check (status in ('submitted','reviewed','assigned','scheduled','in_progress','completed','closed','cancelled')),

  -- Permission & access
  entry_allowed boolean not null default false,
  preferred_contact_method text default 'app'
    check (preferred_contact_method in ('app','phone','email','sms')),

  -- Images & attachments
  images jsonb default '[]'::jsonb,

  -- Cost tracking
  estimated_cost numeric(12,2),
  actual_cost numeric(12,2),

  -- Timestamps
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

  -- Vendor assignment
  vendor_profile_id uuid references vendor_profiles(id) on delete set null,

  -- Status tracking
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','in_progress','completed','cancelled')),

  assigned_at timestamptz default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  -- Notes from vendor
  vendor_notes text,
  completion_notes text,

  -- Attachments (before/after photos)
  before_images jsonb default '[]'::jsonb,
  after_images jsonb default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Maintenance updates/comments
create table if not exists maintenance_updates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  request_id uuid not null references maintenance_requests(id) on delete cascade,

  user_id uuid not null references auth.users(id) on delete cascade,

  update_type text not null
    check (update_type in ('comment','status_change','assignment','completion')),

  message text not null,
  images jsonb default '[]'::jsonb,

  created_at timestamptz not null default now()
);

-- =========================================
-- 6) PAYMENTS & FINANCIALS
-- =========================================

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lease_id uuid references leases(id) on delete set null,
  tenant_user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,

  -- Payment details
  amount numeric(12,2) not null,
  payment_type text not null default 'rent'
    check (payment_type in ('rent','deposit','pet_deposit','late_fee','parking','utility','other')),

  -- Due date tracking
  due_date date not null,
  paid_at timestamptz,

  -- Status
  status text not null default 'pending'
    check (status in ('pending','processing','paid','late','failed','refunded','cancelled')),

  -- Payment method
  payment_method text default 'manual'
    check (payment_method in ('manual','stripe','ach','check','cash','money_order')),

  -- Stripe integration
  stripe_payment_intent_id text,
  stripe_charge_id text,

  -- Check/manual payment details
  check_number text,
  transaction_id text,

  -- Late fees
  late_fee_assessed numeric(12,2) default 0,
  late_fee_waived boolean default false,

  -- Notes
  notes text,
  receipt_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists owner_disbursements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  -- Disbursement details
  amount numeric(12,2) not null,

  period_start date not null,
  period_end date not null,

  -- Status
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','cancelled')),

  disbursed_at timestamptz,

  -- Payment details
  payment_method text default 'manual'
    check (payment_method in ('manual','stripe','ach','wire','check')),

  stripe_transfer_id text,

  -- Breakdown
  total_rent_collected numeric(12,2) not null default 0,
  total_expenses numeric(12,2) not null default 0,
  management_fee numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,

  breakdown jsonb default '{}'::jsonb,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================
-- 7) COMMUNICATION
-- =========================================

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  -- Participants
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid references auth.users(id) on delete set null,

  -- Context
  unit_id uuid references units(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  maintenance_request_id uuid references maintenance_requests(id) on delete set null,

  -- Message content
  subject text,
  body text not null,

  -- Attachments
  attachments jsonb default '[]'::jsonb,

  -- Status
  is_read boolean not null default false,
  read_at timestamptz,

  -- Threading
  parent_message_id uuid references messages(id) on delete set null,
  thread_id uuid,

  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  user_id uuid not null references auth.users(id) on delete cascade,

  -- Notification details
  type text not null
    check (type in ('payment_due','payment_received','maintenance_update','lease_expiring','message','system','announcement')),

  title text not null,
  message text not null,

  -- Action URL (deep link)
  action_url text,

  -- Related entities
  related_entity_type text,
  related_entity_id uuid,

  payload jsonb not null default '{}'::jsonb,

  -- Status
  is_read boolean not null default false,
  read_at timestamptz,

  -- Delivery channels
  sent_via_email boolean default false,
  sent_via_sms boolean default false,
  sent_via_push boolean default false,

  created_at timestamptz not null default now()
);

-- =========================================
-- 8) PROPERTY SHOWINGS & APPLICATIONS
-- =========================================

create table if not exists showings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,

  -- Showing details
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30,

  -- Applicant information
  applicant_name text not null,
  applicant_email text,
  applicant_phone text,

  -- Status
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),

  -- Access method
  access_method text default 'lockbox'
    check (access_method in ('lockbox','smartlock','agent_present','property_manager','self_guided')),

  access_code text,
  access_instructions text,

  -- Follow-up
  feedback text,
  interested boolean,
  application_submitted boolean default false,

  -- Notes
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rental_applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,

  -- Applicant info
  applicant_user_id uuid references auth.users(id) on delete set null,

  full_name text not null,
  email text not null,
  phone text not null,

  -- Application details
  desired_move_in_date date,

  -- Employment
  employer text,
  occupation text,
  monthly_income numeric(12,2),

  -- Screening
  ai_risk_score int check (ai_risk_score between 0 and 100),
  credit_score int,
  background_check_status text
    check (background_check_status in ('pending','in_progress','passed','failed','waived')),

  -- Status
  status text not null default 'submitted'
    check (status in ('submitted','under_review','approved','rejected','withdrawn','expired')),

  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,

  -- Decision
  rejection_reason text,
  approval_notes text,

  application_data jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================
-- 9) HVAC FILTER SUBSCRIPTION PROGRAM
-- =========================================

create table if not exists hvac_filter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,

  -- Subscription details
  filter_size text not null,
  filter_type text not null default 'standard'
    check (filter_type in ('standard','pleated','hepa','allergen')),

  quantity int not null default 1,

  -- Schedule
  frequency text not null default 'monthly'
    check (frequency in ('monthly','bimonthly','quarterly')),

  next_delivery_date date not null,

  -- Status
  status text not null default 'active'
    check (status in ('active','paused','cancelled')),

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

  -- Delivery details
  scheduled_for date not null,
  delivered_at timestamptz,

  status text not null default 'scheduled'
    check (status in ('scheduled','in_transit','delivered','failed','cancelled')),

  -- Tracking
  tracking_number text,
  carrier text,

  delivery_instructions text,
  delivery_photo_url text,

  -- Notes
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================
-- 10) ANALYTICS & REPORTING
-- =========================================

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  user_id uuid references auth.users(id) on delete set null,

  event_type text not null,
  event_name text not null,

  properties jsonb default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- =========================================
-- 11) AUDIT LOG
-- =========================================

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  actor_user_id uuid references auth.users(id) on delete set null,

  entity_type text not null,
  entity_id uuid,

  action text not null
    check (action in ('create','update','delete','view','export')),

  changes jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,

  ip_address inet,
  user_agent text,

  created_at timestamptz not null default now()
);

-- =========================================
-- INDEXES for Performance
-- =========================================

-- Account members
create index if not exists idx_account_members_user on account_members(user_id);
create index if not exists idx_account_members_account_role on account_members(account_id, role);

-- Properties & Units
create index if not exists idx_properties_account on properties(account_id);
create index if not exists idx_units_account on units(account_id);
create index if not exists idx_units_property on units(property_id);
create index if not exists idx_units_status on units(status) where status = 'vacant';

-- Leases
create index if not exists idx_leases_account on leases(account_id);
create index if not exists idx_leases_tenant on leases(tenant_user_id);
create index if not exists idx_leases_unit on leases(unit_id);
create index if not exists idx_leases_status on leases(status);
create index if not exists idx_leases_active on leases(account_id, status) where status = 'active';

-- Maintenance
create index if not exists idx_maint_req_account on maintenance_requests(account_id);
create index if not exists idx_maint_req_unit on maintenance_requests(unit_id);
create index if not exists idx_maint_req_created_by on maintenance_requests(created_by_user_id);
create index if not exists idx_maint_req_status on maintenance_requests(status);
create index if not exists idx_maint_assign_request on maintenance_assignments(request_id);
create index if not exists idx_maint_assign_vendor on maintenance_assignments(vendor_profile_id);

-- Payments
create index if not exists idx_payments_account on payments(account_id);
create index if not exists idx_payments_tenant on payments(tenant_user_id);
create index if not exists idx_payments_lease on payments(lease_id);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_payments_due_date on payments(due_date);

-- Messages & Notifications
create index if not exists idx_messages_account on messages(account_id);
create index if not exists idx_messages_to_user on messages(to_user_id);
create index if not exists idx_messages_from_user on messages(from_user_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_unread on notifications(user_id) where is_read = false;

-- Vendor profiles
create index if not exists idx_vendor_profiles_account on vendor_profiles(account_id);
create index if not exists idx_vendor_profiles_active on vendor_profiles(account_id, is_active) where is_active = true;

-- Audit log
create index if not exists idx_audit_log_account on audit_log(account_id);
create index if not exists idx_audit_log_entity on audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_created on audit_log(created_at desc);

-- =========================================
-- HELPER FUNCTIONS for RLS
-- =========================================

-- Check if current user is a member of the account
create or replace function public.is_account_member(p_account_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = auth.uid()
      and am.is_active = true
  );
$$;

-- Check if current user has specific role(s) in the account
create or replace function public.has_account_role(p_account_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = auth.uid()
      and am.role = any(p_roles)
      and am.is_active = true
  );
$$;

-- Get the user's role in an account
create or replace function public.get_user_role(p_account_id uuid)
returns text
language sql
stable
security definer
as $$
  select am.role
  from public.account_members am
  where am.account_id = p_account_id
    and am.user_id = auth.uid()
    and am.is_active = true
  limit 1;
$$;

-- Get account plan (basic/pro/premium)
create or replace function public.account_plan(p_account_id uuid)
returns text
language sql
stable
security definer
as $$
  select a.plan
  from public.accounts a
  where a.id = p_account_id
    and a.is_active = true;
$$;

-- Check if user is tenant of a specific unit (via active lease)
create or replace function public.is_unit_tenant(p_unit_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.leases l
    where l.unit_id = p_unit_id
      and l.tenant_user_id = auth.uid()
      and l.status = 'active'
  );
$$;

-- Check if user is vendor assigned to a maintenance request
create or replace function public.is_assigned_vendor(p_request_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.maintenance_assignments ma
    join public.vendor_profiles vp on vp.id = ma.vendor_profile_id
    where ma.request_id = p_request_id
      and vp.user_id = auth.uid()
  );
$$;

-- Get user's account IDs (for multi-account support)
create or replace function public.user_account_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select am.account_id
  from public.account_members am
  where am.user_id = auth.uid()
    and am.is_active = true;
$$;

-- =========================================
-- TRIGGERS for updated_at timestamps
-- =========================================

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at trigger to relevant tables
create trigger update_accounts_updated_at before update on accounts
  for each row execute function update_updated_at_column();

create trigger update_account_members_updated_at before update on account_members
  for each row execute function update_updated_at_column();

create trigger update_tenant_profiles_updated_at before update on tenant_profiles
  for each row execute function update_updated_at_column();

create trigger update_vendor_profiles_updated_at before update on vendor_profiles
  for each row execute function update_updated_at_column();

create trigger update_properties_updated_at before update on properties
  for each row execute function update_updated_at_column();

create trigger update_units_updated_at before update on units
  for each row execute function update_updated_at_column();

create trigger update_leases_updated_at before update on leases
  for each row execute function update_updated_at_column();

create trigger update_maintenance_requests_updated_at before update on maintenance_requests
  for each row execute function update_updated_at_column();

create trigger update_maintenance_assignments_updated_at before update on maintenance_assignments
  for each row execute function update_updated_at_column();

create trigger update_payments_updated_at before update on payments
  for each row execute function update_updated_at_column();

create trigger update_owner_disbursements_updated_at before update on owner_disbursements
  for each row execute function update_updated_at_column();

create trigger update_showings_updated_at before update on showings
  for each row execute function update_updated_at_column();

create trigger update_rental_applications_updated_at before update on rental_applications
  for each row execute function update_updated_at_column();

create trigger update_hvac_filter_subscriptions_updated_at before update on hvac_filter_subscriptions
  for each row execute function update_updated_at_column();

create trigger update_hvac_filter_deliveries_updated_at before update on hvac_filter_deliveries
  for each row execute function update_updated_at_column();

-- =========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Multi-Tenant Isolation
-- =========================================

-- ENABLE RLS on all tables
alter table accounts enable row level security;
alter table account_members enable row level security;
alter table tenant_profiles enable row level security;
alter table vendor_profiles enable row level security;
alter table vendor_services enable row level security;
alter table vendor_availability enable row level security;
alter table properties enable row level security;
alter table units enable row level security;
alter table leases enable row level security;
alter table lease_tenants enable row level security;
alter table maintenance_requests enable row level security;
alter table maintenance_assignments enable row level security;
alter table maintenance_updates enable row level security;
alter table payments enable row level security;
alter table owner_disbursements enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table showings enable row level security;
alter table rental_applications enable row level security;
alter table hvac_filter_subscriptions enable row level security;
alter table hvac_filter_deliveries enable row level security;
alter table analytics_events enable row level security;
alter table audit_log enable row level security;

-- 1) ACCOUNTS
create policy "accounts_select_member" on accounts for select using (public.is_account_member(id));
create policy "accounts_update_owner_admin" on accounts for update using (public.has_account_role(id, array['owner','admin'])) with check (public.has_account_role(id, array['owner','admin']));
create policy "accounts_insert_authenticated" on accounts for insert with check (auth.uid() is not null);

-- 2) ACCOUNT_MEMBERS
create policy "account_members_select_member" on account_members for select using (public.is_account_member(account_id));
create policy "account_members_insert_owner_admin" on account_members for insert with check (public.has_account_role(account_id, array['owner','admin']));
create policy "account_members_update_owner_admin" on account_members for update using (public.has_account_role(account_id, array['owner','admin'])) with check (public.has_account_role(account_id, array['owner','admin']));
create policy "account_members_delete_owner_admin" on account_members for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 3) TENANT_PROFILES
create policy "tenant_profiles_select_member" on tenant_profiles for select using (public.is_account_member(account_id));
create policy "tenant_profiles_insert_staff" on tenant_profiles for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "tenant_profiles_update_self_or_staff" on tenant_profiles for update using (user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin'])) with check (user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin']));
create policy "tenant_profiles_delete_staff" on tenant_profiles for delete using (public.has_account_role(account_id, array['owner','manager','admin']));

-- 4) VENDOR_PROFILES
create policy "vendor_profiles_select_member" on vendor_profiles for select using (public.is_account_member(account_id));
create policy "vendor_profiles_insert_staff" on vendor_profiles for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "vendor_profiles_update_self_or_staff" on vendor_profiles for update using (user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin'])) with check (user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin']));
create policy "vendor_profiles_delete_staff" on vendor_profiles for delete using (public.has_account_role(account_id, array['owner','manager','admin']));

-- 5) VENDOR_SERVICES & AVAILABILITY
create policy "vendor_services_select_member" on vendor_services for select using (public.is_account_member(account_id));
create policy "vendor_services_manage_self_or_staff" on vendor_services for all using (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = vendor_services.vendor_profile_id and vp.user_id = auth.uid())) with check (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = vendor_services.vendor_profile_id and vp.user_id = auth.uid()));

create policy "vendor_availability_select_member" on vendor_availability for select using (public.is_account_member(account_id));
create policy "vendor_availability_manage_self_or_staff" on vendor_availability for all using (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = vendor_availability.vendor_profile_id and vp.user_id = auth.uid())) with check (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = vendor_availability.vendor_profile_id and vp.user_id = auth.uid()));

-- 6) PROPERTIES
create policy "properties_select_member" on properties for select using (public.is_account_member(account_id));
create policy "properties_insert_staff" on properties for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "properties_update_staff" on properties for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "properties_delete_staff" on properties for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 7) UNITS
create policy "units_select_member" on units for select using (public.is_account_member(account_id));
create policy "units_insert_staff" on units for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "units_update_staff" on units for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "units_delete_staff" on units for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 8) LEASES
create policy "leases_select_staff_or_tenant" on leases for select using (public.has_account_role(account_id, array['owner','manager','admin']) or tenant_user_id = auth.uid() or exists (select 1 from lease_tenants lt where lt.lease_id = leases.id and lt.tenant_user_id = auth.uid()));
create policy "leases_insert_staff" on leases for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "leases_update_staff" on leases for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "leases_delete_staff" on leases for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 9) LEASE_TENANTS
create policy "lease_tenants_select_staff_or_tenant" on lease_tenants for select using (public.has_account_role(account_id, array['owner','manager','admin']) or tenant_user_id = auth.uid() or exists (select 1 from leases l where l.id = lease_tenants.lease_id and l.tenant_user_id = auth.uid()));
create policy "lease_tenants_manage_staff" on lease_tenants for all using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));

-- 10) MAINTENANCE_REQUESTS
create policy "maint_requests_select_member" on maintenance_requests for select using (public.is_account_member(account_id));
create policy "maint_requests_insert_tenant_or_staff" on maintenance_requests for insert with check (public.has_account_role(account_id, array['owner','manager','admin']) or (created_by_user_id = auth.uid() and public.is_unit_tenant(unit_id)));
create policy "maint_requests_update_creator_or_staff" on maintenance_requests for update using (created_by_user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin'])) with check (created_by_user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin']));
create policy "maint_requests_delete_staff" on maintenance_requests for delete using (public.has_account_role(account_id, array['owner','manager','admin']));

-- 11) MAINTENANCE_ASSIGNMENTS
create policy "maint_assignments_select_staff_or_vendor" on maintenance_assignments for select using (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = maintenance_assignments.vendor_profile_id and vp.user_id = auth.uid()));
create policy "maint_assignments_insert_staff" on maintenance_assignments for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "maint_assignments_update_staff_or_vendor" on maintenance_assignments for update using (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = maintenance_assignments.vendor_profile_id and vp.user_id = auth.uid())) with check (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from vendor_profiles vp where vp.id = maintenance_assignments.vendor_profile_id and vp.user_id = auth.uid()));
create policy "maint_assignments_delete_staff" on maintenance_assignments for delete using (public.has_account_role(account_id, array['owner','manager','admin']));

-- 12) MAINTENANCE_UPDATES
create policy "maint_updates_select_member" on maintenance_updates for select using (public.is_account_member(account_id));
create policy "maint_updates_insert_member" on maintenance_updates for insert with check (public.is_account_member(account_id) and user_id = auth.uid());

-- 13) PAYMENTS
create policy "payments_select_staff_or_tenant" on payments for select using (public.has_account_role(account_id, array['owner','manager','admin']) or tenant_user_id = auth.uid());
create policy "payments_insert_staff" on payments for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "payments_update_staff" on payments for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "payments_delete_staff" on payments for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 14) OWNER_DISBURSEMENTS
create policy "disbursements_select_staff" on owner_disbursements for select using (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "disbursements_insert_staff" on owner_disbursements for insert with check (public.has_account_role(account_id, array['owner','admin']));
create policy "disbursements_update_staff" on owner_disbursements for update using (public.has_account_role(account_id, array['owner','admin'])) with check (public.has_account_role(account_id, array['owner','admin']));
create policy "disbursements_delete_staff" on owner_disbursements for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 15) MESSAGES
create policy "messages_select_participant" on messages for select using (from_user_id = auth.uid() or to_user_id = auth.uid() or public.has_account_role(account_id, array['owner','manager','admin']));
create policy "messages_insert_member" on messages for insert with check (public.is_account_member(account_id) and from_user_id = auth.uid());
create policy "messages_update_sender" on messages for update using (from_user_id = auth.uid()) with check (from_user_id = auth.uid());
create policy "messages_delete_sender_or_staff" on messages for delete using (from_user_id = auth.uid() or public.has_account_role(account_id, array['owner','admin']));

-- 16) NOTIFICATIONS
create policy "notifications_select_self" on notifications for select using (user_id = auth.uid());
create policy "notifications_update_self" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete_self" on notifications for delete using (user_id = auth.uid());

-- 17) SHOWINGS
create policy "showings_select_staff" on showings for select using (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "showings_insert_staff" on showings for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "showings_update_staff" on showings for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "showings_delete_staff" on showings for delete using (public.has_account_role(account_id, array['owner','manager','admin']));

-- 18) RENTAL_APPLICATIONS
create policy "applications_select_staff_or_applicant" on rental_applications for select using (public.has_account_role(account_id, array['owner','manager','admin']) or applicant_user_id = auth.uid());
create policy "applications_insert_authenticated" on rental_applications for insert with check (auth.uid() is not null);
create policy "applications_update_staff_or_applicant" on rental_applications for update using (public.has_account_role(account_id, array['owner','manager','admin']) or (applicant_user_id = auth.uid() and status = 'submitted')) with check (public.has_account_role(account_id, array['owner','manager','admin']) or (applicant_user_id = auth.uid() and status = 'submitted'));
create policy "applications_delete_staff_or_applicant" on rental_applications for delete using (public.has_account_role(account_id, array['owner','admin']) or applicant_user_id = auth.uid());

-- 19) HVAC FILTER SUBSCRIPTIONS
create policy "hvac_subs_select_staff_or_tenant" on hvac_filter_subscriptions for select using (public.has_account_role(account_id, array['owner','manager','admin']) or public.is_unit_tenant(unit_id));
create policy "hvac_subs_insert_staff" on hvac_filter_subscriptions for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "hvac_subs_update_staff" on hvac_filter_subscriptions for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "hvac_subs_delete_staff" on hvac_filter_subscriptions for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 20) HVAC FILTER DELIVERIES
create policy "hvac_deliveries_select_staff_or_tenant" on hvac_filter_deliveries for select using (public.has_account_role(account_id, array['owner','manager','admin']) or exists (select 1 from hvac_filter_subscriptions s where s.id = hvac_filter_deliveries.subscription_id and public.is_unit_tenant(s.unit_id)));
create policy "hvac_deliveries_insert_staff" on hvac_filter_deliveries for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "hvac_deliveries_update_staff" on hvac_filter_deliveries for update using (public.has_account_role(account_id, array['owner','manager','admin'])) with check (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "hvac_deliveries_delete_staff" on hvac_filter_deliveries for delete using (public.has_account_role(account_id, array['owner','admin']));

-- 21) ANALYTICS_EVENTS
create policy "analytics_select_staff" on analytics_events for select using (public.has_account_role(account_id, array['owner','manager','admin']));
create policy "analytics_insert_member" on analytics_events for insert with check (public.is_account_member(account_id));

-- 22) AUDIT_LOG
create policy "audit_select_staff" on audit_log for select using (public.has_account_role(account_id, array['owner','admin']));
create policy "audit_insert_staff" on audit_log for insert with check (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- PLAN GATING SYSTEM
-- =========================================

-- Account features override table
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

CREATE INDEX idx_account_features_account ON account_features(account_id);
CREATE INDEX idx_account_features_key ON account_features(feature_key);

CREATE TRIGGER set_account_features_updated_at
  BEFORE UPDATE ON account_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function to get all features for a plan
CREATE OR REPLACE FUNCTION get_plan_features(plan_name TEXT)
RETURNS TEXT[] AS $$
BEGIN
  RETURN CASE plan_name
    WHEN 'basic' THEN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management'
    ]
    WHEN 'pro' THEN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management',
      'tenant_screening',
      'maintenance_routing',
      'marketing_tools',
      'standard_reporting',
      'lease_renewals',
      'communication_hub'
    ]
    WHEN 'premium' THEN ARRAY[
      'tenant_portal',
      'basic_maintenance_requests',
      'basic_rent_collection',
      'property_management',
      'tenant_screening',
      'maintenance_routing',
      'marketing_tools',
      'standard_reporting',
      'lease_renewals',
      'communication_hub',
      'ai_risk_scoring',
      'integrated_accounting',
      'hvac_filter_program',
      'electronic_showings',
      'emergency_support_24_7',
      'advanced_analytics',
      'advanced_exports',
      'custom_reports',
      'api_access'
    ]
    ELSE ARRAY[]::TEXT[]
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Feature entitlement check function
CREATE OR REPLACE FUNCTION has_feature(
  p_account_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_account_plan TEXT;
  v_override_enabled BOOLEAN;
  v_plan_features TEXT[];
BEGIN
  -- First check for explicit override
  SELECT enabled INTO v_override_enabled
  FROM account_features
  WHERE account_id = p_account_id
    AND feature_key = p_feature_key;

  IF FOUND THEN
    RETURN v_override_enabled;
  END IF;

  -- If no override, check plan-based features
  SELECT plan INTO v_account_plan
  FROM accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_plan_features := get_plan_features(v_account_plan);
  RETURN p_feature_key = ANY(v_plan_features);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS on account_features
ALTER TABLE account_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_features_select_policy ON account_features
  FOR SELECT
  USING (account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid()));

CREATE POLICY account_features_modify_policy ON account_features
  FOR ALL
  USING (account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid() AND role = 'owner'));

-- =========================================
-- COMPLETE! Database schema is now ready.
-- =========================================
