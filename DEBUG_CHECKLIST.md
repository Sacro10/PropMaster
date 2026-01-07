# Deployment Debug Checklist

Run through this checklist to find what's broken.

## 1. Backend Health Check

**Test:**
```bash
curl https://your-api-server.up.railway.app/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-07T...",
  "environment": "production"
}
```

**If fails:**
- [ ] Check Railway → API Server → Deployments → Latest build succeeded?
- [ ] Check Railway → API Server → Logs for errors
- [ ] Verify domain was generated (Settings → Networking)

---

## 2. Backend Environment Variables

**Check Railway → API Server → Variables has ALL of these:**

```
✓ NODE_ENV=production
✓ PORT (auto-set by Railway, don't add manually)
✓ STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
✓ STRIPE_WEBHOOK_SECRET=whsec_...
✓ STRIPE_PRO_PRICE_ID=price_...
✓ STRIPE_PREMIUM_PRICE_ID=price_...
✓ SUPABASE_URL=https://....supabase.co
✓ SUPABASE_SERVICE_ROLE_KEY=eyJhbG... (LONG JWT token)
✓ FRONTEND_URL=https://your-frontend.up.railway.app
```

**Common mistakes:**
- ❌ Using `VITE_` prefix (that's frontend only!)
- ❌ Using anon key instead of service role key
- ❌ Trailing slash in FRONTEND_URL
- ❌ Wrong Stripe keys (test vs live mismatch)

---

## 3. Frontend Health Check

**Test:**
```bash
curl https://your-frontend.up.railway.app
```

**Expected:** HTML page (200 OK)

**If fails:**
- [ ] Check Railway → Frontend → Deployments → Build succeeded?
- [ ] Check build command is: `npm install && npm run build`
- [ ] Check start command is: `npx vite preview --host 0.0.0.0 --port $PORT`

---

## 4. Frontend Environment Variables

**Check Railway → Frontend → Variables has ALL of these:**

```
✓ VITE_SUPABASE_URL=https://....supabase.co
✓ VITE_SUPABASE_ANON_KEY=eyJhbG... (public key, OK to expose)
✓ VITE_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
✓ VITE_API_URL=https://your-api-server.up.railway.app
```

**Common mistakes:**
- ❌ Missing `VITE_` prefix
- ❌ Using service role key instead of anon key
- ❌ API_URL doesn't match backend domain

---

## 5. Stripe Configuration

### A. Check Products Exist

1. Go to https://dashboard.stripe.com/test/products
2. Should see "Pro" ($10/month) and "Premium" ($20/month)
3. Click each → Copy Price ID (starts with `price_...`)
4. Verify these match `STRIPE_PRO_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID` in Railway

### B. Check Webhook Endpoint

1. Go to https://dashboard.stripe.com/test/webhooks
2. Should see endpoint: `https://your-api-server.up.railway.app/webhooks/stripe`
3. Status should be "Enabled"
4. Click endpoint → "Signing secret" → Copy `whsec_...`
5. Verify matches `STRIPE_WEBHOOK_SECRET` in Railway

### C. Check Webhook Events

Required events (should be checked):
- [x] customer.subscription.created
- [x] customer.subscription.updated
- [x] customer.subscription.deleted
- [x] checkout.session.completed
- [x] invoice.payment_succeeded
- [x] invoice.payment_failed

---

## 6. Test CORS

**In browser console on your frontend:**
```javascript
fetch('https://your-api-server.up.railway.app/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

**Expected:** `{status: "ok", ...}`

**If CORS error:**
1. Check `FRONTEND_URL` in backend matches frontend domain exactly
2. Both must use HTTPS
3. No trailing slashes

---

## 7. Test Database Connection

**Check Supabase:**
1. Go to Supabase Dashboard → Table Editor
2. Click `accounts` table
3. Should see your test account(s)
4. Check columns exist:
   - `stripe_customer_id`
   - `stripe_subscription_id`
   - `subscription_status`
   - `plan`

**If columns missing:**
Run migrations in Supabase SQL Editor (see supabase/migrations/)

---

## 8. Test Signup Flow

1. Visit frontend URL
2. Click "Get Started" or "Sign Up"
3. Enter email + password
4. Submit

**Expected:** Redirected to dashboard

**If fails:**
- Check browser console for errors
- Check Supabase → Authentication → Users (should see new user)
- Check Supabase → Table Editor → accounts (should see new account)

---

## 9. Test Checkout Flow

### Step-by-step test:

1. **Login to your app**
2. **Go to Settings page**
   - URL should be: `https://your-frontend.up.railway.app/app/settings`
3. **Click "Upgrade Now" on Pro plan**

**Expected:** Stripe Checkout opens

**If nothing happens:**
- Open browser DevTools → Console
- Look for errors (likely CORS or API error)

**If Stripe opens:**
4. **Enter test card:** `4242 4242 4242 4242`
5. **Complete checkout**

**Expected:** Redirected back to Settings with success message

**If checkout works but plan doesn't update:**
- Check Railway → API Server → Logs
- Should see: "Received webhook event: checkout.session.completed"
- If NOT: Webhook not configured correctly (see step 5B)

---

## 10. Verify Database Updated

After successful checkout:

```sql
-- Run in Supabase SQL Editor
SELECT
  id,
  name,
  plan,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status
FROM accounts
WHERE stripe_customer_id IS NOT NULL;
```

**Expected:**
- `plan` = "pro" (or "premium")
- `stripe_customer_id` = "cus_..."
- `stripe_subscription_id` = "sub_..."
- `subscription_status` = "active"

**If NULL:**
- Webhook not working (see step 5B)
- Check Railway logs for webhook errors

---

## 11. Check Audit Log

```sql
-- Run in Supabase SQL Editor
SELECT
  action,
  resource_type,
  metadata,
  created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:** Entries like:
- `subscription_created`
- `payment_succeeded`
- `account_upgraded`

**If empty:**
- Webhooks processed but audit log not working
- Check Railway logs for "Failed to create audit log" errors

---

## Common Error Messages & Fixes

### "Validation failed"
**Cause:** Invalid data sent to API
**Fix:** Check you're sending UUIDs, not strings like "uuid"

### "Account not found"
**Cause:** Account doesn't exist in database
**Fix:** Sign up through frontend first

### "No active subscription found"
**Cause:** Trying to open portal without subscription
**Fix:** Create subscription first

### "Webhook signature verification failed"
**Cause:** `STRIPE_WEBHOOK_SECRET` doesn't match Stripe
**Fix:** Copy secret from Stripe Dashboard → Webhooks → Click endpoint

### "Too many requests"
**Cause:** Rate limiting working correctly!
**Fix:** Wait 15 minutes or use different IP

### "Missing required environment variable"
**Cause:** Railway environment variable not set
**Fix:** Add it in Railway → Variables

---

## Quick Test Script

Run this locally to test your production API:

```bash
#!/bin/bash

# Set your URLs
API_URL="https://your-api-server.up.railway.app"
FRONTEND_URL="https://your-frontend.up.railway.app"

echo "Testing backend health..."
curl -s $API_URL/health | jq

echo -e "\nTesting CORS..."
curl -s -H "Origin: $FRONTEND_URL" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS $API_URL/api/create-checkout-session \
  -v 2>&1 | grep -i "access-control"

echo -e "\nTesting rate limiting..."
for i in {1..3}; do
  echo "Request $i:"
  curl -s -w "\nHTTP Status: %{http_code}\n" \
    -X POST $API_URL/api/create-checkout-session \
    -H "Content-Type: application/json" \
    -d '{"accountId":"test","plan":"pro","userId":"test"}' | head -5
done

echo -e "\nAll tests complete!"
```

Save as `test-deployment.sh`, make executable (`chmod +x`), and run.

---

## Still Stuck?

**Provide these details:**

1. **Railway backend logs** (last 50 lines)
2. **Browser console errors** (screenshot)
3. **Which step fails** (be specific)
4. **Error message** (exact text)

Then I can help debug specifically!
