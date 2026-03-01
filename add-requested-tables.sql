-- Add requested tables and compatibility views
-- Run this in the Supabase SQL Editor for the project.

-- Ensure extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Allow tenant invites without a unit (unit selected during onboarding)
ALTER TABLE IF EXISTS tenant_invites
  ALTER COLUMN unit_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Users (public mirror of auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION sync_auth_user_to_public_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, created_at, last_sign_in_at, raw_user_meta_data)
  VALUES (NEW.id, NEW.email, NEW.phone, NEW.created_at, NEW.last_sign_in_at, NEW.raw_user_meta_data)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    last_sign_in_at = EXCLUDED.last_sign_in_at,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_sync ON auth.users;
CREATE TRIGGER on_auth_user_sync
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION sync_auth_user_to_public_users();

INSERT INTO public.users (id, email, phone, created_at, last_sign_in_at, raw_user_meta_data)
SELECT id, email, phone, created_at, last_sign_in_at, raw_user_meta_data
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;

-- ---------------------------------------------------------------------------
-- Roles and permissions (RBAC support)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, resource, action)
);

-- ---------------------------------------------------------------------------
-- Owners, tenants, vendors (core entities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  entity_type TEXT DEFAULT 'individual',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  lease_start DATE,
  lease_end DATE,
  rent_amount NUMERIC(10, 2),
  deposit_amount NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors_properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, property_id)
);

-- ---------------------------------------------------------------------------
-- Vendor invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_invites_account_id ON vendor_invites(account_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invites_token ON vendor_invites(invite_token);

-- ---------------------------------------------------------------------------
-- Maintenance comments and attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  content_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Billing: plans, entitlements, subscriptions, invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  interval TEXT DEFAULT 'month' CHECK (interval IN ('day', 'week', 'month', 'year')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  feature_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT,
  status TEXT DEFAULT 'open',
  amount_due NUMERIC(10, 2),
  amount_paid NUMERIC(10, 2),
  currency TEXT DEFAULT 'usd',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  hosted_invoice_url TEXT,
  invoice_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_owners_account ON owners(account_id);
CREATE INDEX IF NOT EXISTS idx_tenants_account ON tenants(account_id);
CREATE INDEX IF NOT EXISTS idx_tenants_unit ON tenants(unit_id);
CREATE INDEX IF NOT EXISTS idx_vendors_account ON vendors(account_id);
CREATE INDEX IF NOT EXISTS idx_vendors_properties_account ON vendors_properties(account_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_comments_account ON maintenance_comments(account_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_attachments_account ON maintenance_attachments(account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);

-- ---------------------------------------------------------------------------
-- RLS policies (account-scoped tables only)
-- ---------------------------------------------------------------------------
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owners' AND policyname = 'owners_select') THEN
    CREATE POLICY owners_select ON owners FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owners' AND policyname = 'owners_insert') THEN
    CREATE POLICY owners_insert ON owners FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owners' AND policyname = 'owners_update') THEN
    CREATE POLICY owners_update ON owners FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owners' AND policyname = 'owners_delete') THEN
    CREATE POLICY owners_delete ON owners FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_select') THEN
    CREATE POLICY tenants_select ON tenants FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_insert') THEN
    CREATE POLICY tenants_insert ON tenants FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_update') THEN
    CREATE POLICY tenants_update ON tenants FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_delete') THEN
    CREATE POLICY tenants_delete ON tenants FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors' AND policyname = 'vendors_select') THEN
    CREATE POLICY vendors_select ON vendors FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors' AND policyname = 'vendors_insert') THEN
    CREATE POLICY vendors_insert ON vendors FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors' AND policyname = 'vendors_update') THEN
    CREATE POLICY vendors_update ON vendors FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors' AND policyname = 'vendors_delete') THEN
    CREATE POLICY vendors_delete ON vendors FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors_properties' AND policyname = 'vendors_properties_select') THEN
    CREATE POLICY vendors_properties_select ON vendors_properties FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors_properties' AND policyname = 'vendors_properties_insert') THEN
    CREATE POLICY vendors_properties_insert ON vendors_properties FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors_properties' AND policyname = 'vendors_properties_update') THEN
    CREATE POLICY vendors_properties_update ON vendors_properties FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors_properties' AND policyname = 'vendors_properties_delete') THEN
    CREATE POLICY vendors_properties_delete ON vendors_properties FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_comments' AND policyname = 'maintenance_comments_select') THEN
    CREATE POLICY maintenance_comments_select ON maintenance_comments FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_comments' AND policyname = 'maintenance_comments_insert') THEN
    CREATE POLICY maintenance_comments_insert ON maintenance_comments FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_comments' AND policyname = 'maintenance_comments_update') THEN
    CREATE POLICY maintenance_comments_update ON maintenance_comments FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_comments' AND policyname = 'maintenance_comments_delete') THEN
    CREATE POLICY maintenance_comments_delete ON maintenance_comments FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_attachments' AND policyname = 'maintenance_attachments_select') THEN
    CREATE POLICY maintenance_attachments_select ON maintenance_attachments FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_attachments' AND policyname = 'maintenance_attachments_insert') THEN
    CREATE POLICY maintenance_attachments_insert ON maintenance_attachments FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_attachments' AND policyname = 'maintenance_attachments_delete') THEN
    CREATE POLICY maintenance_attachments_delete ON maintenance_attachments FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_select') THEN
    CREATE POLICY user_roles_select ON user_roles FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_insert') THEN
    CREATE POLICY user_roles_insert ON user_roles FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_delete') THEN
    CREATE POLICY user_roles_delete ON user_roles FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_select') THEN
    CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_insert') THEN
    CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_update') THEN
    CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_delete') THEN
    CREATE POLICY subscriptions_delete ON subscriptions FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'invoices_select') THEN
    CREATE POLICY invoices_select ON invoices FOR SELECT USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'invoices_insert') THEN
    CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'invoices_update') THEN
    CREATE POLICY invoices_update ON invoices FOR UPDATE USING (is_account_member(account_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'invoices_delete') THEN
    CREATE POLICY invoices_delete ON invoices FOR DELETE USING (is_account_member(account_id));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_select_self') THEN
    CREATE POLICY users_select_self ON users FOR SELECT USING (id = (select auth.uid()));
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Updated_at triggers (uses update_updated_at_column() from main schema)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_owners_updated_at ON owners;
CREATE TRIGGER update_owners_updated_at BEFORE UPDATE ON owners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_plans_updated_at ON plans;
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_maintenance_comments_updated_at ON maintenance_comments;
CREATE TRIGGER update_maintenance_comments_updated_at BEFORE UPDATE ON maintenance_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
