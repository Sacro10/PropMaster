-- Upgrade nibabenjamen64@gmail.com to Premium Plan
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/orgefuaujqiluulzhzeg

-- Update account to Premium
UPDATE accounts
SET
  plan = 'premium',
  subscription_status = 'active',
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

-- Verify the update worked
SELECT
  a.id as account_id,
  a.name as account_name,
  a.plan,
  a.subscription_status,
  a.max_units,
  u.email as owner_email,
  a.updated_at
FROM accounts a
JOIN account_members am ON a.id = am.account_id
JOIN auth.users u ON am.user_id = u.id
WHERE u.email = 'nibabenjamen64@gmail.com'
AND am.role = 'owner';
