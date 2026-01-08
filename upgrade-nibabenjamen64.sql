-- Upgrade nibabenjamen64@gmail.com to Premium Plan
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/orgefuaujqiluulzhzeg

BEGIN;

-- Update account to Premium
UPDATE accounts
SET
  plan = 'premium',
  subscription_status = 'active',
  max_properties = 999999,
  max_units = 999999,
  updated_at = NOW()
WHERE id = (
  SELECT account_id
  FROM account_members
  WHERE user_id = (
    SELECT id
    FROM auth.users
    WHERE email = 'nibabenjamen64@gmail.com'
  )
  AND role = 'owner'
  LIMIT 1
);

-- Update user profile to Premium for frontend gating
UPDATE user_profiles
SET
  subscription_tier = 'premium',
  updated_at = NOW()
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'nibabenjamen64@gmail.com'
);

-- Verify the update worked
SELECT
  a.id as account_id,
  a.name as account_name,
  a.plan,
  a.subscription_status,
  a.max_properties,
  a.max_units,
  u.email as owner_email,
  a.updated_at,
  up.subscription_tier
FROM accounts a
JOIN account_members am ON a.id = am.account_id
JOIN auth.users u ON am.user_id = u.id
JOIN user_profiles up ON up.id = u.id
WHERE u.email = 'nibabenjamen64@gmail.com'
AND am.role = 'owner';

COMMIT;
