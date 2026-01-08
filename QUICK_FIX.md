# Quick Fix - Complete Your Database Setup

## The Problem

You ran the upgrade SQL, but the database schema doesn't exist yet. The app is trying to call SQL functions that haven't been created.

## The Solution - Run the Complete Setup

### Step 1: Run the Complete Database Setup

1. **Open Supabase SQL Editor:**
   - https://app.supabase.com/project/orgefuaujqiluulzhzeg/sql/new

2. **Copy the COMPLETE setup script:**
   - Open file: `setup-database-complete.sql`
   - Select ALL (Cmd+A or Ctrl+A)
   - Copy (Cmd+C or Ctrl+C)

3. **Paste and Run:**
   - Paste into SQL Editor
   - Click **"Run"**
   - Wait 5-10 seconds

✅ You should see: "Success. No rows returned"

---

### Step 2: Run the Upgrade Again

After the schema is created, run the upgrade:

```sql
-- Upgrade to Premium
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

-- Verify it worked
SELECT
  a.id as account_id,
  a.name as account_name,
  a.plan,
  a.subscription_status,
  a.max_units,
  u.email as owner_email
FROM accounts a
JOIN account_members am ON a.id = am.account_id
JOIN auth.users u ON am.user_id = u.id
WHERE u.email = 'nibabenjamen64@gmail.com'
AND am.role = 'owner';
```

✅ You should see your account with `plan = "premium"`

---

### Step 3: Refresh Your App

1. **Hard refresh your browser:**
   - Mac: Cmd + Shift + R
   - Windows: Ctrl + Shift + R

2. **Or clear cache and refresh:**
   - Regular refresh may use cached data

✅ You should now see "PREMIUM PLAN" in the header!

---

## Why This Happened

The app needs these SQL functions to work:
- `rpc_check_feature()` - Check if you have access to a feature
- `rpc_check_plan()` - Check your plan tier
- `rpc_get_account_plan()` - Get your full plan info

These are created by `setup-database-complete.sql`, not by the upgrade script.

---

## Quick Checklist

- [ ] Run `setup-database-complete.sql` in Supabase SQL Editor
- [ ] Run the upgrade SQL for nibabenjamen64@gmail.com
- [ ] Verify you see `plan: "premium"` in the results
- [ ] Hard refresh your browser
- [ ] Confirm you see "PREMIUM PLAN" badge

---

**That's it!** The entire process takes under 2 minutes.
