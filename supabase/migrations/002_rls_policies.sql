-- =========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Multi-Tenant Isolation
-- =========================================

-- =========================================
-- ENABLE RLS on all tables
-- =========================================

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

-- =========================================
-- 1) ACCOUNTS
-- =========================================

-- Any account member can view account details
create policy "accounts_select_member"
on accounts for select
using (public.is_account_member(id));

-- Only owners/admins can update account
create policy "accounts_update_owner_admin"
on accounts for update
using (public.has_account_role(id, array['owner','admin']))
with check (public.has_account_role(id, array['owner','admin']));

-- Only authenticated users can create accounts (for new signups)
create policy "accounts_insert_authenticated"
on accounts for insert
with check (auth.uid() is not null);

-- =========================================
-- 2) ACCOUNT_MEMBERS
-- =========================================

-- Members can view all members in their account
create policy "account_members_select_member"
on account_members for select
using (public.is_account_member(account_id));

-- Owners/admins can manage membership
create policy "account_members_insert_owner_admin"
on account_members for insert
with check (public.has_account_role(account_id, array['owner','admin']));

create policy "account_members_update_owner_admin"
on account_members for update
using (public.has_account_role(account_id, array['owner','admin']))
with check (public.has_account_role(account_id, array['owner','admin']));

create policy "account_members_delete_owner_admin"
on account_members for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 3) TENANT_PROFILES
-- =========================================

-- Members can view tenant profiles
create policy "tenant_profiles_select_member"
on tenant_profiles for select
using (public.is_account_member(account_id));

-- Tenants can update their own profile; staff can manage all
create policy "tenant_profiles_insert_staff"
on tenant_profiles for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "tenant_profiles_update_self_or_staff"
on tenant_profiles for update
using (
  user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
)
with check (
  user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
);

create policy "tenant_profiles_delete_staff"
on tenant_profiles for delete
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- 4) VENDOR_PROFILES
-- =========================================

-- Members can view vendor profiles
create policy "vendor_profiles_select_member"
on vendor_profiles for select
using (public.is_account_member(account_id));

-- Staff can create vendor profiles
create policy "vendor_profiles_insert_staff"
on vendor_profiles for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

-- Vendors can update own profile; staff can manage all
create policy "vendor_profiles_update_self_or_staff"
on vendor_profiles for update
using (
  user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
)
with check (
  user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
);

create policy "vendor_profiles_delete_staff"
on vendor_profiles for delete
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- 5) VENDOR_SERVICES & AVAILABILITY
-- =========================================

-- Members can view vendor services
create policy "vendor_services_select_member"
on vendor_services for select
using (public.is_account_member(account_id));

-- Vendor can manage own services; staff can manage all
create policy "vendor_services_manage_self_or_staff"
on vendor_services for all
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = vendor_services.vendor_profile_id
      and vp.user_id = auth.uid()
  )
)
with check (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = vendor_services.vendor_profile_id
      and vp.user_id = auth.uid()
  )
);

-- Same for availability
create policy "vendor_availability_select_member"
on vendor_availability for select
using (public.is_account_member(account_id));

create policy "vendor_availability_manage_self_or_staff"
on vendor_availability for all
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = vendor_availability.vendor_profile_id
      and vp.user_id = auth.uid()
  )
)
with check (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = vendor_availability.vendor_profile_id
      and vp.user_id = auth.uid()
  )
);

-- =========================================
-- 6) PROPERTIES
-- =========================================

-- Members can view properties
create policy "properties_select_member"
on properties for select
using (public.is_account_member(account_id));

-- Staff can manage properties
create policy "properties_insert_staff"
on properties for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "properties_update_staff"
on properties for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "properties_delete_staff"
on properties for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 7) UNITS
-- =========================================

-- Members can view units
create policy "units_select_member"
on units for select
using (public.is_account_member(account_id));

-- Staff can manage units
create policy "units_insert_staff"
on units for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "units_update_staff"
on units for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "units_delete_staff"
on units for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 8) LEASES
-- =========================================

-- Staff can view all leases; tenants can view their own
create policy "leases_select_staff_or_tenant"
on leases for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or tenant_user_id = auth.uid()
  or exists (
    select 1 from lease_tenants lt
    where lt.lease_id = leases.id
      and lt.tenant_user_id = auth.uid()
  )
);

-- Staff can manage leases
create policy "leases_insert_staff"
on leases for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "leases_update_staff"
on leases for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "leases_delete_staff"
on leases for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 9) LEASE_TENANTS (co-tenants)
-- =========================================

-- Staff can view all; tenants can view their lease's co-tenants
create policy "lease_tenants_select_staff_or_tenant"
on lease_tenants for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or tenant_user_id = auth.uid()
  or exists (
    select 1 from leases l
    where l.id = lease_tenants.lease_id
      and l.tenant_user_id = auth.uid()
  )
);

-- Staff can manage co-tenants
create policy "lease_tenants_manage_staff"
on lease_tenants for all
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- 10) MAINTENANCE_REQUESTS
-- =========================================

-- Members can view requests in their account
create policy "maint_requests_select_member"
on maintenance_requests for select
using (public.is_account_member(account_id));

-- Tenants can create requests for their unit; staff can create any
create policy "maint_requests_insert_tenant_or_staff"
on maintenance_requests for insert
with check (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or (
    created_by_user_id = auth.uid()
    and public.is_unit_tenant(unit_id)
  )
);

-- Creator can update (to add details); staff can update any
create policy "maint_requests_update_creator_or_staff"
on maintenance_requests for update
using (
  created_by_user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
)
with check (
  created_by_user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
);

-- Only staff can delete
create policy "maint_requests_delete_staff"
on maintenance_requests for delete
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- 11) MAINTENANCE_ASSIGNMENTS
-- =========================================

-- Staff and assigned vendor can view
create policy "maint_assignments_select_staff_or_vendor"
on maintenance_assignments for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = maintenance_assignments.vendor_profile_id
      and vp.user_id = auth.uid()
  )
);

-- Staff can create assignments
create policy "maint_assignments_insert_staff"
on maintenance_assignments for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

-- Staff can update; vendor can update their own assignment status
create policy "maint_assignments_update_staff_or_vendor"
on maintenance_assignments for update
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = maintenance_assignments.vendor_profile_id
      and vp.user_id = auth.uid()
  )
)
with check (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1 from vendor_profiles vp
    where vp.id = maintenance_assignments.vendor_profile_id
      and vp.user_id = auth.uid()
  )
);

-- Only staff can delete
create policy "maint_assignments_delete_staff"
on maintenance_assignments for delete
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- 12) MAINTENANCE_UPDATES
-- =========================================

-- Members can view updates for requests they have access to
create policy "maint_updates_select_member"
on maintenance_updates for select
using (public.is_account_member(account_id));

-- Members can add updates; must be for a request they can access
create policy "maint_updates_insert_member"
on maintenance_updates for insert
with check (
  public.is_account_member(account_id)
  and user_id = auth.uid()
);

-- =========================================
-- 13) PAYMENTS
-- =========================================

-- Staff can view all payments; tenants can view their own
create policy "payments_select_staff_or_tenant"
on payments for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or tenant_user_id = auth.uid()
);

-- Staff can manage payments
create policy "payments_insert_staff"
on payments for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "payments_update_staff"
on payments for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "payments_delete_staff"
on payments for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 14) OWNER_DISBURSEMENTS
-- =========================================

-- Only staff can view/manage disbursements
create policy "disbursements_select_staff"
on owner_disbursements for select
using (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "disbursements_insert_staff"
on owner_disbursements for insert
with check (public.has_account_role(account_id, array['owner','admin']));

create policy "disbursements_update_staff"
on owner_disbursements for update
using (public.has_account_role(account_id, array['owner','admin']))
with check (public.has_account_role(account_id, array['owner','admin']));

create policy "disbursements_delete_staff"
on owner_disbursements for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 15) MESSAGES
-- =========================================

-- Users can view messages sent to them or sent by them
create policy "messages_select_participant"
on messages for select
using (
  from_user_id = auth.uid()
  or to_user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','manager','admin'])
);

-- Members can send messages within their account
create policy "messages_insert_member"
on messages for insert
with check (
  public.is_account_member(account_id)
  and from_user_id = auth.uid()
);

-- Users can update messages they sent (e.g., mark as edited)
create policy "messages_update_sender"
on messages for update
using (from_user_id = auth.uid())
with check (from_user_id = auth.uid());

-- Users can delete their own messages
create policy "messages_delete_sender_or_staff"
on messages for delete
using (
  from_user_id = auth.uid()
  or public.has_account_role(account_id, array['owner','admin'])
);

-- =========================================
-- 16) NOTIFICATIONS
-- =========================================

-- Users can only view their own notifications
create policy "notifications_select_self"
on notifications for select
using (user_id = auth.uid());

-- System can create notifications (via service role)
-- Users cannot create notifications directly

-- Users can update their own notifications (mark as read)
create policy "notifications_update_self"
on notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Users can delete their own notifications
create policy "notifications_delete_self"
on notifications for delete
using (user_id = auth.uid());

-- =========================================
-- 17) SHOWINGS
-- =========================================

-- Staff can view all showings
create policy "showings_select_staff"
on showings for select
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- Staff can manage showings
create policy "showings_insert_staff"
on showings for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "showings_update_staff"
on showings for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "showings_delete_staff"
on showings for delete
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- =========================================
-- 18) RENTAL_APPLICATIONS
-- =========================================

-- Staff can view all applications; applicants can view their own
create policy "applications_select_staff_or_applicant"
on rental_applications for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or applicant_user_id = auth.uid()
);

-- Authenticated users can submit applications
create policy "applications_insert_authenticated"
on rental_applications for insert
with check (auth.uid() is not null);

-- Staff can update applications; applicants can update their own (before review)
create policy "applications_update_staff_or_applicant"
on rental_applications for update
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or (applicant_user_id = auth.uid() and status = 'submitted')
)
with check (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or (applicant_user_id = auth.uid() and status = 'submitted')
);

-- Applicants can withdraw; staff can delete
create policy "applications_delete_staff_or_applicant"
on rental_applications for delete
using (
  public.has_account_role(account_id, array['owner','admin'])
  or applicant_user_id = auth.uid()
);

-- =========================================
-- 19) HVAC FILTER SUBSCRIPTIONS
-- =========================================

-- Staff and unit tenants can view subscriptions
create policy "hvac_subs_select_staff_or_tenant"
on hvac_filter_subscriptions for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or public.is_unit_tenant(unit_id)
);

-- Staff can manage subscriptions
create policy "hvac_subs_insert_staff"
on hvac_filter_subscriptions for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "hvac_subs_update_staff"
on hvac_filter_subscriptions for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "hvac_subs_delete_staff"
on hvac_filter_subscriptions for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 20) HVAC FILTER DELIVERIES
-- =========================================

-- Staff and unit tenants can view deliveries
create policy "hvac_deliveries_select_staff_or_tenant"
on hvac_filter_deliveries for select
using (
  public.has_account_role(account_id, array['owner','manager','admin'])
  or exists (
    select 1
    from hvac_filter_subscriptions s
    where s.id = hvac_filter_deliveries.subscription_id
      and public.is_unit_tenant(s.unit_id)
  )
);

-- Staff can manage deliveries
create policy "hvac_deliveries_insert_staff"
on hvac_filter_deliveries for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "hvac_deliveries_update_staff"
on hvac_filter_deliveries for update
using (public.has_account_role(account_id, array['owner','manager','admin']))
with check (public.has_account_role(account_id, array['owner','manager','admin']));

create policy "hvac_deliveries_delete_staff"
on hvac_filter_deliveries for delete
using (public.has_account_role(account_id, array['owner','admin']));

-- =========================================
-- 21) ANALYTICS_EVENTS
-- =========================================

-- Staff can view analytics
create policy "analytics_select_staff"
on analytics_events for select
using (public.has_account_role(account_id, array['owner','manager','admin']));

-- Members can insert events (for tracking)
create policy "analytics_insert_member"
on analytics_events for insert
with check (public.is_account_member(account_id));

-- =========================================
-- 22) AUDIT_LOG
-- =========================================

-- Staff can view audit logs
create policy "audit_select_staff"
on audit_log for select
using (public.has_account_role(account_id, array['owner','admin']));

-- System inserts audit logs (via triggers or service role)
-- Staff can manually insert audit entries
create policy "audit_insert_staff"
on audit_log for insert
with check (public.has_account_role(account_id, array['owner','manager','admin']));

-- No updates or deletes allowed on audit log (append-only)
