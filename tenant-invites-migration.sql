-- Migration: tenant invites + tenant payment methods
-- Safe to run on existing DB (uses IF NOT EXISTS / policy guards)

CREATE TABLE IF NOT EXISTS tenant_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  lease_start DATE,
  lease_end DATE,
  rent NUMERIC(10, 2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('card', 'ach')),
  label TEXT NOT NULL,
  brand TEXT,
  last4 TEXT,
  bank_name TEXT,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_invites_account_id ON tenant_invites(account_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_unit_id ON tenant_invites(unit_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_token ON tenant_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_tenant_payment_methods_account_id ON tenant_payment_methods(account_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payment_methods_user_id ON tenant_payment_methods(tenant_user_id);

ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_payment_methods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_invites_select'
  ) THEN
    CREATE POLICY tenant_invites_select ON tenant_invites FOR SELECT USING (
      is_account_member(account_id) AND get_user_role(account_id) IN ('owner', 'manager', 'admin')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_invites_insert'
  ) THEN
    CREATE POLICY tenant_invites_insert ON tenant_invites FOR INSERT WITH CHECK (
      is_account_member(account_id) AND get_user_role(account_id) IN ('owner', 'manager', 'admin')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_invites_update'
  ) THEN
    CREATE POLICY tenant_invites_update ON tenant_invites FOR UPDATE USING (
      is_account_member(account_id) AND get_user_role(account_id) IN ('owner', 'manager', 'admin')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_payment_methods_select'
  ) THEN
    CREATE POLICY tenant_payment_methods_select ON tenant_payment_methods FOR SELECT USING (
      is_account_member(account_id) AND (
        tenant_user_id = (select auth.uid()) OR
        get_user_role(account_id) IN ('owner', 'manager', 'admin')
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_payment_methods_insert'
  ) THEN
    CREATE POLICY tenant_payment_methods_insert ON tenant_payment_methods FOR INSERT WITH CHECK (
      is_account_member(account_id) AND tenant_user_id = (select auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_payment_methods_update'
  ) THEN
    CREATE POLICY tenant_payment_methods_update ON tenant_payment_methods FOR UPDATE USING (
      is_account_member(account_id) AND tenant_user_id = (select auth.uid())
    );
  END IF;
END $$;
