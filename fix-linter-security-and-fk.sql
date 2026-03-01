-- Supabase linter remediation (security + FK indexing)
-- Generated on 2026-02-27.
--
-- This script addresses:
-- - rls_disabled_in_public (ERROR)
-- - sensitive_columns_exposed (ERROR, via RLS on user_oauth_tokens)
-- - function_search_path_mutable (WARN)
-- - rls_policy_always_true (WARN)
-- - unindexed_foreign_keys (INFO)
--
-- Note on unused_index:
-- Many currently "unused" indexes are needed to satisfy FK coverage checks.
-- Dropping them will re-create unindexed_foreign_keys findings.

BEGIN;

-- ============================================================================
-- 1) Enable RLS on globally readable catalog tables
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS roles_select_authenticated ON public.roles;
    CREATE POLICY roles_select_authenticated ON public.roles
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS role_permissions_select_authenticated ON public.role_permissions;
    CREATE POLICY role_permissions_select_authenticated ON public.role_permissions
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF to_regclass('public.plans') IS NOT NULL THEN
    ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS plans_select_public ON public.plans;
    CREATE POLICY plans_select_public ON public.plans
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF to_regclass('public.plan_entitlements') IS NOT NULL THEN
    ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS plan_entitlements_select_public ON public.plan_entitlements;
    CREATE POLICY plan_entitlements_select_public ON public.plan_entitlements
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$do$;

-- ============================================================================
-- 2) Enable RLS + account-scoped policies on account-owned tables
-- ============================================================================

DO $do$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'activity_events',
    'hvac_delivery_batches',
    'hvac_delivery_schedules',
    'hvac_program_enrollments',
    'emergency_support_config',
    'message_templates',
    'screening_results',
    'automated_reminders',
    'reminder_schedules',
    'reminder_runs',
    'reminder_logs',
    'showing_outcomes',
    'conversations',
    'outbound_messages',
    'conversation_satisfaction'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_select', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (is_account_member(account_id));',
        tbl || '_select',
        tbl
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_insert', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (is_account_member(account_id));',
        tbl || '_insert',
        tbl
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_update', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));',
        tbl || '_update',
        tbl
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_delete', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (is_account_member(account_id));',
        tbl || '_delete',
        tbl
      );
    END IF;
  END LOOP;
END
$do$;

-- ============================================================================
-- 3) Sensitive/account-user scoped tables
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.user_oauth_tokens') IS NOT NULL THEN
    ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS user_oauth_tokens_select ON public.user_oauth_tokens;
    CREATE POLICY user_oauth_tokens_select ON public.user_oauth_tokens
      FOR SELECT USING (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );

    DROP POLICY IF EXISTS user_oauth_tokens_insert ON public.user_oauth_tokens;
    CREATE POLICY user_oauth_tokens_insert ON public.user_oauth_tokens
      FOR INSERT WITH CHECK (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );

    DROP POLICY IF EXISTS user_oauth_tokens_update ON public.user_oauth_tokens;
    CREATE POLICY user_oauth_tokens_update ON public.user_oauth_tokens
      FOR UPDATE USING (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      )
      WITH CHECK (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );

    DROP POLICY IF EXISTS user_oauth_tokens_delete ON public.user_oauth_tokens;
    CREATE POLICY user_oauth_tokens_delete ON public.user_oauth_tokens
      FOR DELETE USING (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );
  END IF;

  IF to_regclass('public.gmail_message_links') IS NOT NULL THEN
    ALTER TABLE public.gmail_message_links ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS gmail_message_links_select ON public.gmail_message_links;
    CREATE POLICY gmail_message_links_select ON public.gmail_message_links
      FOR SELECT USING (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );

    DROP POLICY IF EXISTS gmail_message_links_insert ON public.gmail_message_links;
    CREATE POLICY gmail_message_links_insert ON public.gmail_message_links
      FOR INSERT WITH CHECK (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );

    DROP POLICY IF EXISTS gmail_message_links_update ON public.gmail_message_links;
    CREATE POLICY gmail_message_links_update ON public.gmail_message_links
      FOR UPDATE USING (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      )
      WITH CHECK (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );

    DROP POLICY IF EXISTS gmail_message_links_delete ON public.gmail_message_links;
    CREATE POLICY gmail_message_links_delete ON public.gmail_message_links
      FOR DELETE USING (
        is_account_member(account_id)
        AND (
          user_id = (select auth.uid())
          OR get_user_role(account_id) IN ('owner', 'manager', 'admin')
        )
      );
  END IF;
END
$do$;

-- ============================================================================
-- 4) Tighten permissive INSERT policies
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS analytics_events_insert ON public.analytics_events;
    CREATE POLICY analytics_events_insert ON public.analytics_events
      FOR INSERT WITH CHECK (
        account_id IS NULL OR is_account_member(account_id)
      );
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
    CREATE POLICY audit_log_insert ON public.audit_log
      FOR INSERT WITH CHECK (
        account_id IS NULL OR is_account_member(account_id)
      );
  END IF;

  IF to_regclass('public.rental_applications') IS NOT NULL THEN
    DROP POLICY IF EXISTS rental_applications_insert ON public.rental_applications;
    CREATE POLICY rental_applications_insert ON public.rental_applications
      FOR INSERT WITH CHECK (
        is_account_member(account_id)
        OR applicant_user_id = (select auth.uid())
      );
  END IF;
END
$do$;

-- ============================================================================
-- 5) Lock function search_path (mutable search_path warnings)
-- ============================================================================

DO $do$
DECLARE
  proc_sig REGPROCEDURE;
BEGIN
  FOR proc_sig IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (
        ARRAY[
          'get_overdue_payments',
          'get_monthly_occupancy',
          'get_property_performance',
          'sync_auth_user_to_public_users',
          'calculate_avg_response_time',
          'expire_old_access_codes',
          'get_tenant_screening_metrics',
          'get_monthly_revenue'
        ]
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public;',
      proc_sig
    );
  END LOOP;
END
$do$;

-- ============================================================================
-- 6) Add missing FK indexes (only when no covering leading-column index exists)
-- ============================================================================

DO $do$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('idx_activity_events_user_id', 'activity_events', 'user_id'),
        ('idx_analytics_events_account_id', 'analytics_events', 'account_id'),
        ('idx_audit_log_account_id', 'audit_log', 'account_id'),
        ('idx_expenses_account_id', 'expenses', 'account_id'),
        ('idx_expenses_category_id', 'expenses', 'category_id'),
        ('idx_expenses_property_id', 'expenses', 'property_id'),
        ('idx_gmail_message_links_message_id', 'gmail_message_links', 'message_id'),
        ('idx_hvac_delivery_schedules_account_id', 'hvac_delivery_schedules', 'account_id'),
        ('idx_hvac_delivery_schedules_enrollment_id', 'hvac_delivery_schedules', 'enrollment_id'),
        ('idx_hvac_filter_subscriptions_account_id', 'hvac_filter_subscriptions', 'account_id'),
        ('idx_hvac_filter_subscriptions_unit_id', 'hvac_filter_subscriptions', 'unit_id'),
        ('idx_hvac_program_enrollments_account_id', 'hvac_program_enrollments', 'account_id'),
        ('idx_hvac_program_enrollments_unit_id', 'hvac_program_enrollments', 'unit_id'),
        ('idx_invoices_account_id', 'invoices', 'account_id'),
        ('idx_maintenance_assignments_account_id', 'maintenance_assignments', 'account_id'),
        ('idx_maintenance_assignments_request_id', 'maintenance_assignments', 'request_id'),
        ('idx_maintenance_assignments_vendor_profile_id', 'maintenance_assignments', 'vendor_profile_id'),
        ('idx_maintenance_attachments_account_id', 'maintenance_attachments', 'account_id'),
        ('idx_maintenance_comments_account_id', 'maintenance_comments', 'account_id'),
        ('idx_maintenance_requests_created_by_user_id', 'maintenance_requests', 'created_by_user_id'),
        ('idx_maintenance_requests_property_id', 'maintenance_requests', 'property_id'),
        ('idx_maintenance_requests_unit_id', 'maintenance_requests', 'unit_id'),
        ('idx_notifications_account_id', 'notifications', 'account_id'),
        ('idx_outbound_messages_conversation_id', 'outbound_messages', 'conversation_id'),
        ('idx_outbound_messages_message_id', 'outbound_messages', 'message_id'),
        ('idx_outbound_messages_reminder_id', 'outbound_messages', 'reminder_id'),
        ('idx_owner_entities_account_id', 'owner_entities', 'account_id'),
        ('idx_owners_account_id', 'owners', 'account_id'),
        ('idx_payments_lease_id', 'payments', 'lease_id'),
        ('idx_properties_manager_user_id', 'properties', 'manager_user_id'),
        ('idx_property_owners_account_id', 'property_owners', 'account_id'),
        ('idx_reminder_logs_reminder_id', 'reminder_logs', 'reminder_id'),
        ('idx_reminder_runs_reminder_id', 'reminder_runs', 'reminder_id'),
        ('idx_reminder_schedules_reminder_id', 'reminder_schedules', 'reminder_id'),
        ('idx_rental_applications_property_id', 'rental_applications', 'property_id'),
        ('idx_screening_results_account_id', 'screening_results', 'account_id'),
        ('idx_screening_results_application_id', 'screening_results', 'application_id'),
        ('idx_showings_property_id', 'showings', 'property_id'),
        ('idx_showings_unit_id', 'showings', 'unit_id'),
        ('idx_subscriptions_account_id', 'subscriptions', 'account_id'),
        ('idx_tenant_invites_unit_id', 'tenant_invites', 'unit_id'),
        ('idx_tenant_payment_methods_account_id', 'tenant_payment_methods', 'account_id'),
        ('idx_tenants_account_id', 'tenants', 'account_id'),
        ('idx_unit_hvac_status_account_id', 'unit_hvac_status', 'account_id'),
        ('idx_unit_hvac_status_unit_id', 'unit_hvac_status', 'unit_id'),
        ('idx_user_oauth_tokens_user_id', 'user_oauth_tokens', 'user_id'),
        ('idx_vendor_invites_account_id', 'vendor_invites', 'account_id'),
        ('idx_vendor_services_vendor_profile_id', 'vendor_services', 'vendor_profile_id'),
        ('idx_vendors_account_id', 'vendors', 'account_id'),
        ('idx_vendors_properties_account_id', 'vendors_properties', 'account_id')
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
