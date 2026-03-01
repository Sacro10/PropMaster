-- Supabase linter remediation for:
-- - auth_rls_initplan
-- - duplicate_index
-- - unindexed_foreign_keys
-- Generated on 2026-02-27.

BEGIN;

-- ============================================================================
-- 1) RLS policy initplan fixes
-- Replace direct auth.uid() calls in policy expressions with (select auth.uid())
-- so Postgres can initialize once per statement instead of per-row.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.tenant_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_profiles_select ON public.tenant_profiles;
    CREATE POLICY tenant_profiles_select ON public.tenant_profiles FOR SELECT USING (
      is_account_member(account_id) AND (
        user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );

    DROP POLICY IF EXISTS tenant_profiles_update ON public.tenant_profiles;
    CREATE POLICY tenant_profiles_update ON public.tenant_profiles FOR UPDATE USING (
      is_account_member(account_id) AND (
        user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.tenant_payment_methods') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_payment_methods_select ON public.tenant_payment_methods;
    CREATE POLICY tenant_payment_methods_select ON public.tenant_payment_methods FOR SELECT USING (
      is_account_member(account_id) AND (
        tenant_user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );

    DROP POLICY IF EXISTS tenant_payment_methods_insert ON public.tenant_payment_methods;
    CREATE POLICY tenant_payment_methods_insert ON public.tenant_payment_methods FOR INSERT WITH CHECK (
      is_account_member(account_id) AND tenant_user_id = (select auth.uid())
    );

    DROP POLICY IF EXISTS tenant_payment_methods_update ON public.tenant_payment_methods;
    CREATE POLICY tenant_payment_methods_update ON public.tenant_payment_methods FOR UPDATE USING (
      is_account_member(account_id) AND tenant_user_id = (select auth.uid())
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.vendor_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS vendor_profiles_select ON public.vendor_profiles;
    CREATE POLICY vendor_profiles_select ON public.vendor_profiles FOR SELECT USING (
      is_account_member(account_id) AND (
        user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );

    DROP POLICY IF EXISTS vendor_profiles_update ON public.vendor_profiles;
    CREATE POLICY vendor_profiles_update ON public.vendor_profiles FOR UPDATE USING (
      is_account_member(account_id) AND (
        user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.leases') IS NOT NULL THEN
    DROP POLICY IF EXISTS leases_select ON public.leases;
    CREATE POLICY leases_select ON public.leases FOR SELECT USING (
      is_account_member(account_id) AND (
        tenant_user_id = (select auth.uid()) OR
        id IN (SELECT lease_id FROM lease_tenants WHERE tenant_user_id = (select auth.uid())) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.lease_tenants') IS NOT NULL THEN
    DROP POLICY IF EXISTS lease_tenants_select ON public.lease_tenants;
    CREATE POLICY lease_tenants_select ON public.lease_tenants FOR SELECT USING (
      is_account_member(account_id) AND (
        tenant_user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.maintenance_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS maintenance_requests_select ON public.maintenance_requests;
    CREATE POLICY maintenance_requests_select ON public.maintenance_requests FOR SELECT USING (
      is_account_member(account_id) AND (
        created_by_user_id = (select auth.uid()) OR
        is_unit_tenant(unit_id) OR
        is_assigned_vendor(id) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );

    DROP POLICY IF EXISTS maintenance_requests_update ON public.maintenance_requests;
    CREATE POLICY maintenance_requests_update ON public.maintenance_requests FOR UPDATE USING (
      is_account_member(account_id) AND (
        created_by_user_id = (select auth.uid()) OR
        is_assigned_vendor(id) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL THEN
    DROP POLICY IF EXISTS payments_select ON public.payments;
    CREATE POLICY payments_select ON public.payments FOR SELECT USING (
      is_account_member(account_id) AND (
        tenant_user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS messages_select ON public.messages;
    CREATE POLICY messages_select ON public.messages FOR SELECT USING (
      is_account_member(account_id) AND (
        from_user_id = (select auth.uid()) OR
        to_user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'admin')
      )
    );

    DROP POLICY IF EXISTS messages_insert ON public.messages;
    CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (
      is_account_member(account_id) AND from_user_id = (select auth.uid())
    );

    DROP POLICY IF EXISTS messages_update ON public.messages;
    CREATE POLICY messages_update ON public.messages FOR UPDATE USING (
      to_user_id = (select auth.uid())
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS notifications_select ON public.notifications;
    CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (
      user_id = (select auth.uid())
    );

    DROP POLICY IF EXISTS notifications_update ON public.notifications;
    CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (
      user_id = (select auth.uid())
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.rental_applications') IS NOT NULL THEN
    DROP POLICY IF EXISTS rental_applications_select ON public.rental_applications;
    CREATE POLICY rental_applications_select ON public.rental_applications FOR SELECT USING (
      is_account_member(account_id) OR applicant_user_id = (select auth.uid())
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
    CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT USING (
      (select auth.uid()) = id
    );

    DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
    CREATE POLICY user_profiles_insert ON public.user_profiles FOR INSERT WITH CHECK (
      (select auth.uid()) = id OR (select auth.uid()) IS NULL
    );

    DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
    CREATE POLICY user_profiles_update ON public.user_profiles FOR UPDATE USING (
      (select auth.uid()) = id
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    DROP POLICY IF EXISTS users_select_self ON public.users;
    CREATE POLICY users_select_self ON public.users FOR SELECT USING (
      id = (select auth.uid())
    );
  END IF;
END
$do$;

-- ============================================================================
-- 2) Drop duplicate indexes
-- Keep *_id variants defined in supabase-schema.sql.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_expenses_account;
DROP INDEX IF EXISTS public.idx_expenses_category;
DROP INDEX IF EXISTS public.idx_expenses_date;
DROP INDEX IF EXISTS public.idx_expenses_property;
DROP INDEX IF EXISTS public.idx_expenses_maintenance_request;
DROP INDEX IF EXISTS public.idx_maintenance_assignments_account;
DROP INDEX IF EXISTS public.idx_maintenance_assignments_request;
DROP INDEX IF EXISTS public.idx_maintenance_assignments_vendor;

-- ============================================================================
-- 3) Add missing FK indexes
-- Adds a single-column index only when there is no existing non-partial index
-- whose first key column already matches the FK column.
-- ============================================================================

DO $do$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('idx_account_members_invited_by', 'account_members', 'invited_by'),
        ('idx_analytics_events_user_id', 'analytics_events', 'user_id'),
        ('idx_audit_log_actor_user_id', 'audit_log', 'actor_user_id'),
        ('idx_automated_reminders_template_id', 'automated_reminders', 'template_id'),
        ('idx_conversation_satisfaction_user_id', 'conversation_satisfaction', 'user_id'),
        ('idx_conversations_property_id', 'conversations', 'property_id'),
        ('idx_conversations_unit_id', 'conversations', 'unit_id'),
        ('idx_expenses_unit_id', 'expenses', 'unit_id'),
        ('idx_expenses_vendor_profile_id', 'expenses', 'vendor_profile_id'),
        ('idx_gmail_message_links_user_id', 'gmail_message_links', 'user_id'),
        ('idx_hvac_delivery_schedules_batch_id', 'hvac_delivery_schedules', 'batch_id'),
        ('idx_hvac_filter_deliveries_account_id', 'hvac_filter_deliveries', 'account_id'),
        ('idx_hvac_filter_deliveries_subscription_id', 'hvac_filter_deliveries', 'subscription_id'),
        ('idx_invoices_subscription_id', 'invoices', 'subscription_id'),
        ('idx_lease_tenants_account_id', 'lease_tenants', 'account_id'),
        ('idx_lease_tenants_tenant_user_id', 'lease_tenants', 'tenant_user_id'),
        ('idx_maintenance_attachments_request_id', 'maintenance_attachments', 'request_id'),
        ('idx_maintenance_attachments_uploaded_by', 'maintenance_attachments', 'uploaded_by'),
        ('idx_maintenance_comments_request_id', 'maintenance_comments', 'request_id'),
        ('idx_maintenance_comments_user_id', 'maintenance_comments', 'user_id'),
        ('idx_maintenance_updates_account_id', 'maintenance_updates', 'account_id'),
        ('idx_maintenance_updates_request_id', 'maintenance_updates', 'request_id'),
        ('idx_maintenance_updates_user_id', 'maintenance_updates', 'user_id'),
        ('idx_messages_maintenance_request_id', 'messages', 'maintenance_request_id'),
        ('idx_messages_parent_message_id', 'messages', 'parent_message_id'),
        ('idx_messages_property_id', 'messages', 'property_id'),
        ('idx_messages_unit_id', 'messages', 'unit_id'),
        ('idx_outbound_messages_recipient_id', 'outbound_messages', 'recipient_id'),
        ('idx_outbound_messages_recipient_user_id', 'outbound_messages', 'recipient_user_id'),
        ('idx_owner_disbursements_account_id', 'owner_disbursements', 'account_id'),
        ('idx_owner_disbursements_owner_id', 'owner_disbursements', 'owner_id'),
        ('idx_owner_disbursements_property_id', 'owner_disbursements', 'property_id'),
        ('idx_payments_unit_id', 'payments', 'unit_id'),
        ('idx_property_owners_owner_id', 'property_owners', 'owner_id'),
        ('idx_reminder_logs_account_id', 'reminder_logs', 'account_id'),
        ('idx_reminder_runs_account_id', 'reminder_runs', 'account_id'),
        ('idx_reminder_runs_schedule_id', 'reminder_runs', 'schedule_id'),
        ('idx_reminder_schedules_account_id', 'reminder_schedules', 'account_id'),
        ('idx_reminder_schedules_template_id', 'reminder_schedules', 'template_id'),
        ('idx_rental_applications_applicant_user_id', 'rental_applications', 'applicant_user_id'),
        ('idx_rental_applications_reviewed_by', 'rental_applications', 'reviewed_by'),
        ('idx_rental_applications_unit_id', 'rental_applications', 'unit_id'),
        ('idx_showing_outcomes_account_id', 'showing_outcomes', 'account_id'),
        ('idx_subscriptions_plan_id', 'subscriptions', 'plan_id'),
        ('idx_subscriptions_user_id', 'subscriptions', 'user_id'),
        ('idx_tenant_invites_created_by', 'tenant_invites', 'created_by'),
        ('idx_tenant_invites_property_id', 'tenant_invites', 'property_id'),
        ('idx_tenants_user_id', 'tenants', 'user_id'),
        ('idx_unit_hvac_status_created_by', 'unit_hvac_status', 'created_by'),
        ('idx_user_roles_role_id', 'user_roles', 'role_id'),
        ('idx_user_roles_user_id', 'user_roles', 'user_id'),
        ('idx_vendor_availability_account_id', 'vendor_availability', 'account_id'),
        ('idx_vendor_invites_created_by', 'vendor_invites', 'created_by'),
        ('idx_vendors_user_id', 'vendors', 'user_id'),
        ('idx_vendors_properties_property_id', 'vendors_properties', 'property_id')
    ) AS v(index_name, table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = rec.table_name
        AND c.column_name = rec.column_name
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid
      WHERE ns.nspname = 'public'
        AND t.relname = rec.table_name
        AND a.attname = rec.column_name
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND i.indisvalid
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND i.indnatts >= 1
        AND i.indkey[0] = a.attnum
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I);',
        rec.index_name,
        rec.table_name,
        rec.column_name
      );
    END IF;
  END LOOP;
END
$do$;

COMMIT;
