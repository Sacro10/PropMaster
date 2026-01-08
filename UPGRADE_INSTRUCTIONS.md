# Upgrade Your Account to Premium

Since you don't have the service role key set up yet, here's the easiest way to upgrade:

## Quick Method: Use Supabase Dashboard

1. **Go to your Supabase project:**
   - Visit: https://app.supabase.com/project/orgefuaujqiluulzhzeg

2. **Open SQL Editor:**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run this SQL:**

```sql
-- Find and upgrade your account to Premium
UPDATE accounts
SET
  plan = 'premium',
  subscription_status = 'active',
  max_units = 999999,
  updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT am.account_id
  FROM account_members am
  JOIN auth.users u ON am.user_id = u.id
  WHERE am.role = 'owner'
  ORDER BY am.created_at ASC
  LIMIT 1
);

-- Verify the upgrade
SELECT
  a.id,
  a.name,
  a.plan,
  a.subscription_status,
  a.max_units,
  u.email as owner_email
FROM accounts a
JOIN account_members am ON a.id = am.account_id
JOIN auth.users u ON am.user_id = u.id
WHERE am.role = 'owner'
AND a.plan = 'premium';
```

4. **Click "Run"**

5. **Check the results:**
   - You should see your account with:
     - plan: `premium`
     - subscription_status: `active`
     - max_units: `999999`

6. **Refresh your app:**
   - Go back to your browser
   - Refresh the page (Cmd+R or Ctrl+R)
   - You should now see "PREMIUM PLAN" in the header

## What You Get with Premium:

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

## Alternative: If You Have Service Role Key

If you want to add the service role key for future use:

1. **Get your service role key:**
   - Go to https://app.supabase.com/project/orgefuaujqiluulzhzeg/settings/api
   - Copy the "service_role" key (starts with "eyJhbG...")

2. **Add to .env file:**
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

3. **Run the upgrade script:**
   ```bash
   ./upgrade-to-premium.sh
   ```

---

**Need Help?** Just refresh your browser after running the SQL and you're all set! 🎉
