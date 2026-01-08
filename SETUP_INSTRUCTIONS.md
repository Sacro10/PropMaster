# Complete Database Setup & Premium Upgrade

Follow these 3 simple steps to set up your database and upgrade to Premium:

---

## Step 1: Set Up Database Schema

1. **Go to Supabase SQL Editor:**
   - Visit: https://app.supabase.com/project/orgefuaujqiluulzhzeg/sql/new

2. **Copy the complete setup script:**
   - Open the file: `setup-database-complete.sql`
   - Select all (Cmd+A or Ctrl+A)
   - Copy (Cmd+C or Ctrl+C)

3. **Paste and run in Supabase:**
   - Paste the entire script into the SQL Editor
   - Click **"Run"** button
   - Wait for it to complete (should take 5-10 seconds)

✅ **Success:** You should see "Success. No rows returned" or similar message

---

## Step 2: Upgrade Your Account to Premium

1. **In the same SQL Editor window:**
   - Clear the current query
   - Paste this SQL:

```sql
-- Upgrade nibabenjamen64@gmail.com to Premium Plan

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

-- Verify the upgrade worked
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
```

2. **Click "Run"**

✅ **Success:** You should see your account details with:
   - `plan`: **premium**
   - `subscription_status`: **active**
   - `max_units`: **999999**

---

## Step 3: Refresh Your App

1. **Go back to your browser with the app**
2. **Refresh the page** (Cmd+R or Ctrl+R)
3. **Look for "PREMIUM PLAN" in the header**

---

## What You Now Have Access To

✅ **Unlimited units** (no more restrictions!)
✅ **AI risk scoring** - Advanced tenant screening
✅ **Integrated accounting** - Full financial management
✅ **HVAC filter program** - Automated maintenance
✅ **Electronic showings** - Digital property tours
✅ **24/7 emergency support** - Round-the-clock assistance
✅ **Advanced analytics** - Deep insights and reporting
✅ **Advanced exports** - Custom data exports
✅ **Custom reports** - Tailored reporting tools
✅ **API access** - Full API integration capabilities

---

## Troubleshooting

**If Step 1 fails:**
- Make sure you're logged into Supabase
- Check that you're in the correct project (orgefuaujqiluulzhzeg)
- Try running the script again

**If Step 2 shows no results:**
- Make sure you completed Step 1 first
- Check that you're signed up with nibabenjamen64@gmail.com
- Verify you have an account created in the app

**If you don't see Premium in the app:**
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear browser cache
- Try logging out and back in

---

**Need help?** Just let me know!
