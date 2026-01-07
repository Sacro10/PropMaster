# Database Testing & Verification Guide

## Overview

This guide walks you through testing the complete Supabase database schema, RLS policies, and seed data to ensure everything works correctly before connecting to your UI.

---

## Prerequisites

- Supabase project created
- Supabase CLI installed (`npm install -g supabase`)
- Database migrations applied

---

## 1. Apply Migrations

### Option A: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the migrations in order:
   - Copy and paste `supabase/migrations/001_initial_schema.sql`
   - Click **Run**
   - Copy and paste `supabase/migrations/002_rls_policies.sql`
   - Click **Run**
   - Copy and paste `supabase/migrations/003_seed_data.sql`
   - Click **Run**

### Option B: Using Supabase CLI

```bash
# Initialize Supabase in your project (if not already done)
supabase init

# Link to your remote project
supabase link --project-ref your-project-ref

# Push migrations to remote database
supabase db push

# Or apply them manually
supabase db execute -f supabase/migrations/001_initial_schema.sql
supabase db execute -f supabase/migrations/002_rls_policies.sql
supabase db execute -f supabase/migrations/003_seed_data.sql
```

### Verify Migration Success

After running migrations, you should see:
- ✅ 22 tables created
- ✅ RLS enabled on all tables
- ✅ 60+ policies created
- ✅ Seed data inserted
- ✅ "SEED DATA COMPLETE!" notice (if using DO block)

---

## 2. Verify Table Structure

### Check Tables Exist

Run this query in the SQL Editor:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

**Expected tables (22 total):**
- account_members
- accounts
- analytics_events
- audit_log
- hvac_filter_deliveries
- hvac_filter_subscriptions
- lease_tenants
- leases
- maintenance_assignments
- maintenance_requests
- maintenance_updates
- messages
- notifications
- owner_disbursements
- payments
- properties
- rental_applications
- showings
- tenant_profiles
- units
- vendor_availability
- vendor_profiles
- vendor_services

### Check Helper Functions

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_type = 'FUNCTION'
order by routine_name;
```

**Expected functions (7 total):**
- account_plan
- get_user_role
- has_account_role
- is_account_member
- is_assigned_vendor
- is_unit_tenant
- user_account_ids

---

## 3. Verify Seed Data

### Check Demo Account

```sql
select * from accounts;
```

**Expected:**
- 1 account: "Demo Portfolio LLC"
- Plan: "basic"
- max_properties: 10
- max_units: 100
- is_active: true

### Check Account Members

```sql
select
  am.role,
  am.user_id,
  am.is_active
from account_members am
join accounts a on a.id = am.account_id
order by am.role;
```

**Expected:**
- 3 members: owner, tenant, vendor
- All active

### Check Properties & Units

```sql
select
  p.name as property_name,
  p.address,
  u.unit_number,
  u.status,
  u.bedrooms,
  u.bathrooms,
  u.rent
from properties p
join units u on u.property_id = p.id
order by u.unit_number;
```

**Expected:**
- 1 property: "Sunset Apartments"
- 2 units: #101 (occupied), #102 (vacant)
- Unit 101: 2bed/2bath, $1800/mo
- Unit 102: 1bed/1bath, $1400/mo

### Check Lease Data

```sql
select
  l.lease_number,
  l.status,
  l.start_date,
  l.end_date,
  l.monthly_rent,
  u.unit_number
from leases l
join units u on u.id = l.unit_id
order by l.start_date desc;
```

**Expected:**
- 1 active lease for Unit 101
- Monthly rent: $1800
- 12-month term

### Check Tenant Profile

```sql
select
  tp.full_name,
  tp.phone,
  tp.email,
  tp.credit_score,
  tp.ai_risk_score,
  tp.background_check_status
from tenant_profiles tp;
```

**Expected:**
- 1 tenant: "Jane Doe"
- Credit score: 720
- AI risk score: 95 (low risk)
- Background check: approved

### Check Vendor Data

```sql
select
  vp.company_name,
  vp.contact_name,
  vp.phone,
  vp.email,
  vp.rating,
  vs.service_type
from vendor_profiles vp
left join vendor_services vs on vs.vendor_id = vp.id
order by vs.service_type;
```

**Expected:**
- 1 vendor: "Cool Air HVAC Services"
- Rating: 4.8/5.0
- 2 services: HVAC, Appliance Repair

### Check Maintenance Request

```sql
select
  mr.title,
  mr.priority,
  mr.status,
  mr.category,
  u.unit_number,
  ma.status as assignment_status
from maintenance_requests mr
join units u on u.id = mr.unit_id
left join maintenance_assignments ma on ma.request_id = mr.id;
```

**Expected:**
- 1 request: "AC not cooling properly"
- Priority: high
- Status: in_progress
- Category: hvac
- Assigned to vendor

### Check Payments

```sql
select
  p.amount,
  p.status,
  p.payment_type,
  p.payment_method,
  p.due_date,
  u.unit_number
from payments p
join leases l on l.id = p.lease_id
join units u on u.id = l.unit_id
order by p.due_date;
```

**Expected:**
- 2 payments: January (paid), February (pending)
- Amounts: $1800 each
- Payment type: rent

### Check Messages

```sql
select
  m.subject,
  m.status,
  m.sender_role,
  m.recipient_role
from messages m
order by m.created_at;
```

**Expected:**
- 2 messages between owner and tenant
- 1 unread, 1 read

---

## 4. Test RLS Policies

### Set Up Test Users

For testing RLS, you need to create actual auth users and set their context. Here's how:

#### Create Test Users (via Supabase Dashboard)

1. Go to **Authentication** → **Users**
2. Create 3 users:
   - **Owner**: `owner@demo.com` / `password123`
   - **Tenant**: `tenant@demo.com` / `password123`
   - **Vendor**: `vendor@demo.com` / `password123`

3. Note their user IDs

#### Link Users to Account

```sql
-- Get the demo account ID
select id from accounts where name = 'Demo Portfolio LLC';
-- Copy this ID

-- Insert account memberships
insert into account_members (account_id, user_id, role, is_active)
values
  ('PASTE_ACCOUNT_ID', 'PASTE_OWNER_USER_ID', 'owner', true),
  ('PASTE_ACCOUNT_ID', 'PASTE_TENANT_USER_ID', 'tenant', true),
  ('PASTE_ACCOUNT_ID', 'PASTE_VENDOR_USER_ID', 'vendor', true);
```

### Test as Owner

```sql
-- Set user context to owner
set local role authenticated;
set local request.jwt.claims to '{"sub": "OWNER_USER_ID"}';

-- Owner should see all properties
select * from properties;
-- Expected: 1 property visible

-- Owner should see all maintenance requests
select * from maintenance_requests;
-- Expected: 1 request visible

-- Owner should be able to update account
update accounts set billing_email = 'new-billing@demo.com' where name = 'Demo Portfolio LLC';
-- Expected: Success
```

### Test as Tenant

```sql
-- Set user context to tenant
set local role authenticated;
set local request.jwt.claims to '{"sub": "TENANT_USER_ID"}';

-- Tenant should see properties (view only)
select * from properties;
-- Expected: 1 property visible

-- Tenant should only see their own lease
select * from leases;
-- Expected: 1 lease (their own)

-- Tenant should only see their own payments
select * from payments;
-- Expected: 2 payments (their own)

-- Tenant should NOT be able to see other tenant profiles
select * from tenant_profiles where user_id != 'TENANT_USER_ID';
-- Expected: 0 rows

-- Tenant should NOT be able to update account settings
update accounts set plan = 'premium' where name = 'Demo Portfolio LLC';
-- Expected: Error - policy violation
```

### Test as Vendor

```sql
-- Set user context to vendor
set local role authenticated;
set local request.jwt.claims to '{"sub": "VENDOR_USER_ID"}';

-- Vendor should see assigned maintenance requests
select * from maintenance_requests mr
where exists (
  select 1 from maintenance_assignments ma
  where ma.request_id = mr.id
  and ma.vendor_id in (
    select id from vendor_profiles where user_id = 'VENDOR_USER_ID'
  )
);
-- Expected: 1 request (assigned to them)

-- Vendor should NOT see other maintenance requests
select * from maintenance_requests mr
where not exists (
  select 1 from maintenance_assignments ma
  where ma.request_id = mr.id
  and ma.vendor_id in (
    select id from vendor_profiles where user_id = 'VENDOR_USER_ID'
  )
);
-- Expected: 0 rows

-- Vendor should be able to update their own profile
update vendor_profiles set phone = '555-9999' where user_id = 'VENDOR_USER_ID';
-- Expected: Success

-- Vendor should NOT be able to update other vendor profiles
update vendor_profiles set phone = '555-8888' where user_id != 'VENDOR_USER_ID';
-- Expected: 0 rows updated
```

---

## 5. Test Multi-Tenant Isolation

### Create Second Account

```sql
-- Create another account
insert into accounts (name, plan, billing_email)
values ('Rival Realty LLC', 'pro', 'billing@rival.com')
returning id;
-- Note the returned ID
```

### Create User in Second Account

```sql
-- Create another owner
insert into account_members (account_id, user_id, role, is_active)
values
  ('RIVAL_ACCOUNT_ID', 'NEW_USER_ID', 'owner', true);
```

### Verify Isolation

```sql
-- Set context to rival account owner
set local role authenticated;
set local request.jwt.claims to '{"sub": "NEW_USER_ID"}';

-- Should NOT see Demo Portfolio properties
select * from properties
where account_id != 'RIVAL_ACCOUNT_ID';
-- Expected: 0 rows

-- Should NOT see Demo Portfolio tenants
select * from tenant_profiles
where account_id != 'RIVAL_ACCOUNT_ID';
-- Expected: 0 rows

-- Should NOT see Demo Portfolio maintenance requests
select * from maintenance_requests mr
join units u on u.id = mr.unit_id
join properties p on p.id = u.property_id
where p.account_id != 'RIVAL_ACCOUNT_ID';
-- Expected: 0 rows
```

**✅ If all queries return 0 rows, multi-tenant isolation is working!**

---

## 6. Test Helper Functions

### Test `is_account_member()`

```sql
-- Set context to demo owner
set local role authenticated;
set local request.jwt.claims to '{"sub": "DEMO_OWNER_USER_ID"}';

-- Should return true for demo account
select public.is_account_member('DEMO_ACCOUNT_ID');
-- Expected: true

-- Should return false for rival account
select public.is_account_member('RIVAL_ACCOUNT_ID');
-- Expected: false
```

### Test `has_account_role()`

```sql
-- Owner should have owner role
select public.has_account_role('DEMO_ACCOUNT_ID', array['owner']);
-- Expected: true

-- Owner should NOT have tenant role
select public.has_account_role('DEMO_ACCOUNT_ID', array['tenant']);
-- Expected: false

-- Owner should match when checking multiple roles
select public.has_account_role('DEMO_ACCOUNT_ID', array['owner', 'manager']);
-- Expected: true
```

### Test `get_user_role()`

```sql
-- Get role for current user
select public.get_user_role('DEMO_ACCOUNT_ID');
-- Expected: 'owner' (for owner user)
```

### Test `account_plan()`

```sql
-- Get plan for demo account
select public.account_plan('DEMO_ACCOUNT_ID');
-- Expected: 'basic'
```

### Test `is_unit_tenant()`

```sql
-- Set context to tenant
set local role authenticated;
set local request.jwt.claims to '{"sub": "TENANT_USER_ID"}';

-- Should return true for their unit
select public.is_unit_tenant('UNIT_101_ID');
-- Expected: true

-- Should return false for vacant unit
select public.is_unit_tenant('UNIT_102_ID');
-- Expected: false
```

### Test `is_assigned_vendor()`

```sql
-- Set context to vendor
set local role authenticated;
set local request.jwt.claims to '{"sub": "VENDOR_USER_ID"}';

-- Should return true for assigned request
select public.is_assigned_vendor('MAINTENANCE_REQUEST_ID');
-- Expected: true
```

### Test `user_account_ids()`

```sql
-- Set context to demo owner
set local role authenticated;
set local request.jwt.claims to '{"sub": "DEMO_OWNER_USER_ID"}';

-- Should return demo account ID
select public.user_account_ids();
-- Expected: array with DEMO_ACCOUNT_ID
```

---

## 7. Test Feature Limits

### Check Basic Plan Limits

```sql
select
  a.name,
  a.plan,
  a.max_properties,
  a.max_units,
  count(distinct p.id) as current_properties,
  count(distinct u.id) as current_units
from accounts a
left join properties p on p.account_id = a.id
left join units u on u.property_id = p.id
where a.name = 'Demo Portfolio LLC'
group by a.id;
```

**Expected:**
- Plan: basic
- max_properties: 10
- max_units: 100
- current_properties: 1
- current_units: 2

### Test Limit Enforcement (Application Level)

This would be enforced in your application code:

```typescript
// Example check before creating property
const { data: account } = await supabase
  .from('accounts')
  .select('plan, max_properties')
  .single()

const { count } = await supabase
  .from('properties')
  .select('*', { count: 'exact', head: true })

if (count >= account.max_properties) {
  throw new Error('Property limit reached. Upgrade to Pro for more.')
}
```

---

## 8. Test Indexes

### Check Index Usage

```sql
-- Explain query to verify index usage
explain analyze
select * from properties
where account_id = 'DEMO_ACCOUNT_ID';
```

**Look for:**
- "Index Scan" (good) vs "Seq Scan" (bad)
- Low execution time (< 1ms for small datasets)

### List All Indexes

```sql
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

**Expected:**
- Primary key indexes on all tables
- Foreign key indexes (account_id, property_id, unit_id, etc.)
- Custom indexes on status fields

---

## 9. Test Triggers

### Test `updated_at` Trigger

```sql
-- Update a property
update properties
set name = 'Sunset Apartments (Updated)'
where name = 'Sunset Apartments';

-- Check that updated_at changed
select name, created_at, updated_at
from properties
where name like 'Sunset%';
```

**Expected:**
- updated_at > created_at
- updated_at approximately equal to now()

---

## 10. Common Issues & Fixes

### Issue: RLS blocking all queries

**Symptom:** Queries return 0 rows even though data exists

**Fix:**
```sql
-- Check if RLS is enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';

-- Temporarily disable RLS for testing
alter table properties disable row level security;

-- Re-enable after fixing policies
alter table properties enable row level security;
```

### Issue: Helper functions not working

**Symptom:** Policies fail with function errors

**Fix:**
```sql
-- Check function exists
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
and routine_name = 'is_account_member';

-- Test function directly
select public.is_account_member('ACCOUNT_ID');

-- Recreate function if needed (run 001_initial_schema.sql again)
```

### Issue: Foreign key violations

**Symptom:** Cannot insert data due to FK constraints

**Fix:**
```sql
-- Check existing relationships
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints as tc
join information_schema.key_column_usage as kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage as ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name = 'your_table';

-- Ensure parent records exist before inserting child records
```

### Issue: Seed data not inserted

**Symptom:** Tables are empty after running 003_seed_data.sql

**Fix:**
```sql
-- Check for errors in DO block
-- Run seed script manually and look for error messages

-- Verify variables captured correctly
do $
declare
  v_account_id uuid;
begin
  insert into accounts (name, plan)
  values ('Test Account', 'basic')
  returning id into v_account_id;

  raise notice 'Account ID: %', v_account_id;

  if v_account_id is null then
    raise exception 'Failed to create account';
  end if;
end $;
```

---

## 11. Performance Testing

### Test Query Performance

```sql
-- Enable timing
\timing on

-- Test property lookup (should be < 1ms)
select * from properties where account_id = 'DEMO_ACCOUNT_ID';

-- Test maintenance request join (should be < 5ms)
select
  mr.*,
  u.unit_number,
  p.name as property_name
from maintenance_requests mr
join units u on u.id = mr.unit_id
join properties p on p.id = u.property_id
where p.account_id = 'DEMO_ACCOUNT_ID';

-- Test complex aggregation (should be < 10ms)
select
  p.name,
  count(distinct u.id) as total_units,
  count(distinct case when u.status = 'occupied' then u.id end) as occupied_units,
  sum(case when u.status = 'occupied' then u.rent else 0 end) as monthly_revenue
from properties p
left join units u on u.property_id = p.id
where p.account_id = 'DEMO_ACCOUNT_ID'
group by p.id;
```

### Add Indexes if Slow

```sql
-- Example: Add index if filtering by status is slow
create index if not exists idx_units_status
on units(status);

-- Example: Add composite index for common queries
create index if not exists idx_payments_lease_status
on payments(lease_id, status);
```

---

## 12. Integration Testing Checklist

Use this checklist when testing from your application:

### Authentication Flow
- [ ] User can sign up
- [ ] User can sign in
- [ ] User gets added to account_members automatically
- [ ] User session persists across page reloads
- [ ] User can sign out

### Data Access (Owner Role)
- [ ] Can view all properties
- [ ] Can create new property
- [ ] Can update property details
- [ ] Can delete property
- [ ] Can view all units
- [ ] Can create new unit
- [ ] Can view all tenants
- [ ] Can create new lease
- [ ] Can view all maintenance requests
- [ ] Can assign vendor to maintenance request
- [ ] Can view all payments
- [ ] Can mark payment as paid
- [ ] Can send messages to tenants/vendors

### Data Access (Tenant Role)
- [ ] Can view their lease
- [ ] Can view their unit
- [ ] Can view their payments
- [ ] Cannot view other tenants' data
- [ ] Can create maintenance request for their unit
- [ ] Cannot create maintenance request for other units
- [ ] Can view messages sent to them
- [ ] Can send messages to owner/manager
- [ ] Cannot view account billing details

### Data Access (Vendor Role)
- [ ] Can view their profile
- [ ] Can update their profile
- [ ] Can view assigned maintenance requests
- [ ] Cannot view unassigned requests
- [ ] Can add updates to assigned requests
- [ ] Cannot view other vendors' data
- [ ] Can view messages sent to them
- [ ] Can send messages to owner/manager

### Multi-Tenant Isolation
- [ ] User A cannot see User B's accounts
- [ ] User A cannot see User B's properties
- [ ] User A cannot see User B's tenants
- [ ] User A cannot see User B's maintenance requests
- [ ] User A cannot see User B's payments
- [ ] User A cannot see User B's messages

### Feature Limits
- [ ] Basic plan limited to 10 properties
- [ ] Pro plan limited to 50 properties
- [ ] Premium plan shows unlimited
- [ ] App prevents creating beyond limit
- [ ] Upgrade prompt shown when limit reached

---

## 13. Next Steps

After verifying database functionality:

1. **Connect UI to Database**
   - Update existing components to fetch real data
   - Replace mock data with Supabase queries
   - Add loading states and error handling

2. **Implement Stripe Integration**
   - Create Stripe customer on signup
   - Handle subscription webhooks
   - Update account plan based on subscription
   - Enforce feature limits

3. **Add Real-time Features**
   - Real-time maintenance request updates
   - Real-time message notifications
   - Real-time payment status changes

4. **Add Email Notifications**
   - Send email on new maintenance request
   - Send email on lease expiration
   - Send email on payment due/overdue
   - Send email on message received

5. **Deploy to Production**
   - Set up production Supabase project
   - Run migrations on production database
   - Update environment variables
   - Test RLS policies in production
   - Monitor performance and errors

---

## 14. Useful SQL Queries

### Get Account Summary

```sql
select
  a.name as account_name,
  a.plan,
  count(distinct p.id) as properties_count,
  count(distinct u.id) as units_count,
  count(distinct case when u.status = 'occupied' then u.id end) as occupied_units,
  count(distinct tp.id) as tenants_count,
  count(distinct vp.id) as vendors_count,
  count(distinct mr.id) as maintenance_requests_count,
  sum(case when pay.status = 'pending' then pay.amount else 0 end) as pending_payments_total
from accounts a
left join properties p on p.account_id = a.id
left join units u on u.property_id = p.id
left join tenant_profiles tp on tp.account_id = a.id
left join vendor_profiles vp on vp.account_id = a.id
left join maintenance_requests mr on mr.unit_id = u.id
left join leases l on l.unit_id = u.id
left join payments pay on pay.lease_id = l.id and pay.status = 'pending'
where a.id = 'DEMO_ACCOUNT_ID'
group by a.id;
```

### Get Overdue Payments

```sql
select
  pay.id,
  pay.amount,
  pay.due_date,
  pay.status,
  u.unit_number,
  p.name as property_name,
  tp.full_name as tenant_name
from payments pay
join leases l on l.id = pay.lease_id
join units u on u.id = l.unit_id
join properties p on p.id = u.property_id
join lease_tenants lt on lt.lease_id = l.id
join tenant_profiles tp on tp.id = lt.tenant_id
where pay.status = 'pending'
  and pay.due_date < current_date
  and p.account_id = 'DEMO_ACCOUNT_ID'
order by pay.due_date;
```

### Get Active Maintenance Requests

```sql
select
  mr.id,
  mr.title,
  mr.priority,
  mr.status,
  mr.category,
  mr.created_at,
  u.unit_number,
  p.name as property_name,
  vp.company_name as assigned_vendor,
  ma.status as assignment_status
from maintenance_requests mr
join units u on u.id = mr.unit_id
join properties p on p.id = u.property_id
left join maintenance_assignments ma on ma.request_id = mr.id
left join vendor_profiles vp on vp.id = ma.vendor_id
where mr.status in ('pending', 'in_progress')
  and p.account_id = 'DEMO_ACCOUNT_ID'
order by
  case mr.priority
    when 'critical' then 1
    when 'high' then 2
    when 'medium' then 3
    when 'low' then 4
  end,
  mr.created_at;
```

### Get Revenue Report

```sql
select
  date_trunc('month', pay.payment_date) as month,
  count(distinct pay.id) as payments_count,
  sum(case when pay.status = 'paid' then pay.amount else 0 end) as revenue,
  sum(case when pay.status = 'pending' then pay.amount else 0 end) as pending
from payments pay
join leases l on l.id = pay.lease_id
join units u on u.id = l.unit_id
join properties p on p.id = u.property_id
where p.account_id = 'DEMO_ACCOUNT_ID'
  and pay.payment_date >= date_trunc('year', current_date)
group by date_trunc('month', pay.payment_date)
order by month desc;
```

---

## Summary

This testing guide provides:

- ✅ Step-by-step migration application
- ✅ Verification queries for all tables
- ✅ RLS policy testing procedures
- ✅ Multi-tenant isolation tests
- ✅ Helper function validation
- ✅ Performance testing queries
- ✅ Common issues and fixes
- ✅ Integration testing checklist
- ✅ Useful reporting queries

Follow this guide to ensure your database is production-ready before connecting your UI!
