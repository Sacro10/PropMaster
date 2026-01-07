# Production Readiness Checklist

## 🎯 If All Green → Market Ready

Use this checklist before going live. Each section must be ✅ before launch.

---

## 1. Security & Authentication

### Row Level Security (RLS)
- [ ] **RLS enabled** on all tables in Supabase
- [ ] **Cross-account access prevented** - Test:
  1. Create two accounts
  2. Try to access Account B's data while logged into Account A
  3. Should receive 403/empty results
- [ ] **Helper functions verified** - `is_account_member()`, `has_account_role()`, `is_unit_tenant()`
- [ ] **Service role key** never exposed to frontend
- [ ] **Anon key** only used in frontend (safe with RLS)

**Test Script:**
```sql
-- Run as Account A user
SELECT * FROM properties WHERE account_id = '<account_b_id>';
-- Should return 0 rows

-- Try to insert into Account B
INSERT INTO properties (account_id, name)
VALUES ('<account_b_id>', 'Hack Test');
-- Should fail with RLS error
```

### Input Validation
- [ ] **Server-side validation** on all API endpoints (Zod schemas)
- [ ] **UUID validation** for all ID parameters
- [ ] **Email validation** where applicable
- [ ] **Plan validation** (only pro/premium allowed for checkout)
- [ ] **SQL injection prevented** (using parameterized queries)
- [ ] **XSS prevention** (React escapes by default, verify no `dangerouslySetInnerHTML`)

**Test:**
```bash
# Invalid UUID
curl -X POST https://your-api/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"accountId": "invalid", "plan": "pro", "userId": "test"}'
# Should return 400 with validation error

# Invalid plan
curl -X POST https://your-api/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"accountId": "valid-uuid", "plan": "hacker", "userId": "valid-uuid"}'
# Should return 400 with validation error
```

### Rate Limiting
- [ ] **Webhook endpoint** rate limited (100/min)
- [ ] **Checkout endpoint** rate limited (5/15min per user)
- [ ] **Portal endpoint** rate limited (10/15min)
- [ ] **General API** rate limited (100/15min per IP)
- [ ] **Rate limit headers** returned (`X-RateLimit-*`)

**Test:**
```bash
# Hit checkout endpoint 6 times rapidly
for i in {1..6}; do
  curl -X POST https://your-api/api/create-checkout-session \
    -H "Content-Type: application/json" \
    -d '{"accountId":"uuid","plan":"pro","userId":"uuid"}'
done
# 6th request should return 429
```

### Secrets Management
- [ ] **No secrets in code** - grep check:
  ```bash
  grep -r "sk_live\|sk_test\|whsec_\|service_role" src/
  # Should return 0 results
  ```
- [ ] **Environment variables** used for all secrets
- [ ] **`.env` files** in `.gitignore`
- [ ] **Production secrets** different from development
- [ ] **Webhook secret** matches Stripe dashboard

---

## 2. Stripe Integration

### Configuration
- [ ] **Live Stripe keys** configured (not test keys)
- [ ] **Live products created** in Stripe Dashboard
- [ ] **Price IDs** match environment variables:
  ```bash
  # Check price IDs start with price_live_
  echo $STRIPE_PRO_PRICE_ID
  echo $STRIPE_PREMIUM_PRICE_ID
  ```
- [ ] **Webhook endpoint** created at https://dashboard.stripe.com/webhooks
- [ ] **Webhook URL** is production API server
- [ ] **Webhook events** subscribed:
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
  - checkout.session.completed
  - invoice.payment_succeeded
  - invoice.payment_failed

### Webhook Security
- [ ] **Signature verification** enabled
- [ ] **Webhook secret** matches Stripe dashboard
- [ ] **Idempotency** working - resend same event:
  ```bash
  stripe trigger customer.subscription.created
  # Check logs show "Event already processed"
  ```
- [ ] **Error handling** - webhook returns 500 on failure (Stripe retries)
- [ ] **Audit logging** - all webhook events logged

### End-to-End Test
- [ ] **Complete subscription flow:**
  1. Create account → Sign up
  2. Go to Settings
  3. Click "Upgrade Now" → Stripe Checkout opens
  4. Enter payment (test card: 4242...)
  5. Complete checkout
  6. Redirected to Settings with success message
  7. **Verify database:**
     - `plan` changed to pro/premium
     - `stripe_customer_id` populated
     - `stripe_subscription_id` populated
     - `subscription_status` = 'active'
     - `max_units` updated to plan limit
  8. **Verify audit log:**
     - `subscription_created` entry exists
     - `account_upgraded` entry exists

- [ ] **Portal session test:**
  1. Click "Manage Subscription"
  2. Stripe portal opens
  3. Can view invoice
  4. Can update payment method
  5. Can cancel subscription
  6. After cancel, database updates to `plan: basic`

---

## 3. Database & RLS

### Schema
- [ ] **All migrations run** successfully:
  ```bash
  # Check Supabase migration status
  # Should show all migrations applied
  ```
- [ ] **Audit log table** exists and writable
- [ ] **Stripe fields** present in `accounts` table
- [ ] **Indexes** created on foreign keys
- [ ] **Constraints** enforced (e.g., plan enum, status enum)

### RLS Policies Test Matrix

| Table | Operation | Account A → Account A | Account A → Account B | Expected |
|-------|-----------|----------------------|---------------------|----------|
| accounts | SELECT | ✅ Returns data | ❌ Returns empty | PASS if ❌ |
| properties | SELECT | ✅ Returns data | ❌ Returns empty | PASS if ❌ |
| units | SELECT | ✅ Returns data | ❌ Returns empty | PASS if ❌ |
| leases | SELECT | ✅ Returns data | ❌ Returns empty | PASS if ❌ |
| payments | SELECT | ✅ Returns data | ❌ Returns empty | PASS if ❌ |
| maintenance_requests | INSERT | ✅ Succeeds | ❌ Fails RLS | PASS if ❌ |
| properties | UPDATE | ✅ Succeeds | ❌ Fails RLS | PASS if ❌ |
| accounts | UPDATE | ✅ Succeeds (if owner) | ❌ Fails RLS | PASS if ❌ |

**Test Script:**
```javascript
// As User in Account A
const { data, error } = await supabase
  .from('properties')
  .select('*')
  .eq('account_id', '<account_b_id>');

console.log(data); // Should be empty array
console.log(error); // Should be null (not error, just filtered)
```

### Backup & Recovery
- [ ] **Daily backups** enabled in Supabase
- [ ] **Point-in-time recovery** enabled (Pro plan)
- [ ] **Backup restoration tested** (use staging DB)

---

## 4. Error Handling & Logging

### Centralized Error Handling
- [ ] **User-safe messages** - no stack traces exposed:
  ```bash
  # Trigger error
  curl https://your-api/api/create-checkout-session \
    -H "Content-Type: application/json" \
    -d '{"accountId":"nonexistent","plan":"pro","userId":"uuid"}'
  # Response should NOT include stack trace or internal details
  ```
- [ ] **Development vs Production** - stack traces only in dev
- [ ] **Error codes** consistent
- [ ] **Async errors** caught by asyncHandler wrapper

### Audit Logging
- [ ] **Critical operations logged:**
  - Subscription created/updated/canceled
  - Payment succeeded/failed
  - Account upgraded/downgraded
  - Webhook received/processed/failed
- [ ] **Audit log** includes:
  - Timestamp
  - Account ID
  - User ID
  - Action
  - Resource type & ID
  - Metadata (old/new values)
  - IP address
  - User agent

**Verify:**
```sql
SELECT
  action,
  resource_type,
  metadata,
  created_at
FROM audit_log
WHERE account_id = '<your_test_account>'
ORDER BY created_at DESC
LIMIT 10;
```

### Application Logging
- [ ] **Structured logging** - JSON format
- [ ] **Log levels** appropriate (info, warn, error)
- [ ] **Sensitive data** not logged (credit cards, passwords)
- [ ] **Request IDs** for tracing (optional but recommended)

---

## 5. Performance & Scalability

### Response Times
- [ ] **Health check** < 100ms:
  ```bash
  time curl https://your-api/health
  ```
- [ ] **Checkout session** < 2s
- [ ] **Portal session** < 2s
- [ ] **Webhook processing** < 5s

### Database Performance
- [ ] **Indexes** on frequently queried columns:
  - `accounts.stripe_customer_id`
  - `account_members.user_id`
  - `account_members.account_id`
  - `properties.account_id`
  - `units.property_id`
  - `leases.unit_id`
- [ ] **Query plans** analyzed (no sequential scans on large tables)
- [ ] **Connection pooling** enabled (Supabase default)

### Caching
- [ ] **Frontend assets** cached (Vite build includes hashes)
- [ ] **API responses** appropriate cache headers
- [ ] **Idempotency cache** working (24hr TTL)

---

## 6. Monitoring & Alerts

### Health Monitoring
- [ ] **Uptime monitoring** configured:
  - Backend health endpoint
  - Frontend homepage
  - Alert on downtime > 1min
- [ ] **Response time monitoring**
- [ ] **Error rate tracking**

### Stripe Monitoring
- [ ] **Webhook delivery** monitored in Stripe Dashboard
- [ ] **Failed payments** email alerts enabled
- [ ] **Subscription cancellations** tracked

### Application Monitoring
- [ ] **Error logs** monitored
- [ ] **Audit log** reviewed weekly
- [ ] **Rate limit hits** tracked
- [ ] **Failed webhooks** alerted

### Metrics to Track
- [ ] Active subscriptions count
- [ ] Monthly recurring revenue (MRR)
- [ ] Churn rate
- [ ] Failed payment rate
- [ ] Webhook success rate
- [ ] API error rate
- [ ] Average response time

---

## 7. Frontend Verification

### Build & Deployment
- [ ] **Production build** succeeds:
  ```bash
  npm run build
  # No errors, warnings OK
  ```
- [ ] **Bundle size** reasonable (< 500KB main bundle)
- [ ] **Source maps** excluded from production
- [ ] **Console logs** removed/disabled:
  ```bash
  # Check production bundle
  grep -r "console.log" dist/
  # Should be minimal/none
  ```

### Environment Configuration
- [ ] **API URL** points to production backend
- [ ] **Supabase URL** is production
- [ ] **Stripe publishable key** is LIVE key (`pk_live_...`)
- [ ] **No test keys** in production build

### User Experience
- [ ] **All routes** accessible
- [ ] **Authentication** works (signup, login, logout)
- [ ] **Protected routes** redirect to login
- [ ] **Settings page** loads subscription info
- [ ] **Upgrade flow** completes successfully
- [ ] **Portal link** opens Stripe portal
- [ ] **No console errors** in browser
- [ ] **Mobile responsive** tested
- [ ] **Loading states** shown during async operations
- [ ] **Error messages** user-friendly

---

## 8. Deployment Configuration

### Railway Backend
- [ ] **Build command** correct
- [ ] **Start command** correct
- [ ] **Root directory** = `server`
- [ ] **Environment variables** all set
- [ ] **Health check** passing
- [ ] **Logs** accessible and readable
- [ ] **Domain** generated or custom domain configured
- [ ] **HTTPS** enabled

### Railway Frontend
- [ ] **Build command** correct
- [ ] **Start command** = `npx vite preview --host 0.0.0.0 --port $PORT`
- [ ] **Root directory** = (empty)
- [ ] **Environment variables** all set
- [ ] **Domain** generated or custom domain configured
- [ ] **HTTPS** enabled

### CORS Configuration
- [ ] **Frontend URL** matches `FRONTEND_URL` env var exactly
- [ ] **No trailing slash** issues
- [ ] **CORS preflight** succeeds:
  ```bash
  curl -X OPTIONS https://your-api/api/create-checkout-session \
    -H "Origin: https://your-frontend.com" \
    -H "Access-Control-Request-Method: POST" \
    -v
  # Should see Access-Control-Allow-Origin header
  ```

---

## 9. Legal & Compliance

### Terms & Privacy
- [ ] **Terms of Service** page created
- [ ] **Privacy Policy** page created
- [ ] **Stripe ToS** linked during checkout
- [ ] **Data handling** documented
- [ ] **Cookie consent** (if using analytics)

### Payment Processing
- [ ] **PCI compliance** - handled by Stripe (no card data touches your server)
- [ ] **Refund policy** documented
- [ ] **Subscription terms** clear (monthly billing, cancellation policy)

---

## 10. Documentation

### User Documentation
- [ ] **Help/FAQ** page
- [ ] **Subscription management** guide
- [ ] **Contact/support** information

### Developer Documentation
- [ ] **README** updated with production deployment steps
- [ ] **API documentation** (if exposing API)
- [ ] **Environment variables** documented
- [ ] **Troubleshooting** guide

---

## 11. Final Pre-Launch Tests

### End-to-End User Journey
Test as if you're a real user:

1. **Sign Up**
   - [ ] Can create account
   - [ ] Receives welcome email (if implemented)
   - [ ] Redirected to dashboard

2. **Free Tier Usage**
   - [ ] Can create properties (up to limit)
   - [ ] Can create units (up to 3 for basic)
   - [ ] Can access basic features
   - [ ] Cannot access premium features (shows upgrade prompt)

3. **Upgrade to Pro**
   - [ ] Click "Upgrade Now"
   - [ ] Stripe checkout opens
   - [ ] Enter payment info
   - [ ] Complete purchase
   - [ ] Redirected back with success
   - [ ] Plan shows as "Pro"
   - [ ] Can now create up to 100 units
   - [ ] Premium features still locked

4. **Use Pro Features**
   - [ ] Access tenant screening
   - [ ] Access maintenance routing
   - [ ] Access standard reporting

5. **Manage Subscription**
   - [ ] Click "Manage Subscription"
   - [ ] Stripe portal opens
   - [ ] Can view invoice
   - [ ] Can update payment method
   - [ ] Can change plan (upgrade to Premium)
   - [ ] After upgrade, Premium features unlock

6. **Cancel Subscription**
   - [ ] Cancel in Stripe portal
   - [ ] Subscription continues until period end
   - [ ] After period end, downgrades to basic
   - [ ] Loses access to paid features
   - [ ] Data retained

### Load Testing (Optional but Recommended)
- [ ] **Concurrent users** tested (simulate 10+ simultaneous signups)
- [ ] **Webhook flood** handled (trigger multiple events rapidly)
- [ ] **Database connections** don't max out

---

## 12. Security Audit

### Penetration Testing
- [ ] **SQL injection** attempts blocked
- [ ] **XSS attempts** sanitized
- [ ] **CSRF protection** (Stripe handles this)
- [ ] **Authentication bypass** impossible
- [ ] **Account enumeration** prevented
- [ ] **Rate limiting** prevents brute force

### Vulnerability Scanning
- [ ] **Dependencies** up to date:
  ```bash
  npm audit
  # Fix any high/critical vulnerabilities
  ```
- [ ] **Node version** supported (>=18.0.0)
- [ ] **TypeScript** compilation strict mode enabled

---

## 13. Rollback Plan

### Preparation
- [ ] **Previous deployment** accessible in Railway
- [ ] **Database migration** reversible
- [ ] **Rollback procedure** documented:
  1. Go to Railway deployment history
  2. Click "Rollback" on last stable version
  3. Verify health check passes
  4. Verify webhook still works

### Recovery Contacts
- [ ] **Railway support** contact info saved
- [ ] **Stripe support** contact info saved
- [ ] **Supabase support** contact info saved
- [ ] **On-call engineer** designated (you!)

---

## ✅ Final Go/No-Go Decision

### Critical (Must be ✅)
- [ ] RLS prevents cross-account access
- [ ] Input validation on all endpoints
- [ ] Rate limiting active
- [ ] Webhook signature verification working
- [ ] Live Stripe keys configured correctly
- [ ] End-to-end subscription flow works
- [ ] Database backups enabled
- [ ] Error handling prevents info leakage
- [ ] Audit logging captures critical events
- [ ] Health monitoring configured

### Important (Should be ✅)
- [ ] Custom domain configured
- [ ] Performance metrics acceptable
- [ ] Legal pages published
- [ ] User documentation complete
- [ ] Rollback plan tested

### Nice to Have
- [ ] Load testing completed
- [ ] A/B testing setup
- [ ] Analytics integrated
- [ ] Email notifications configured

---

## 🚀 Launch Checklist

When all above items are ✅:

1. [ ] **Final backup** - Export current database state
2. [ ] **Deploy to production** - Frontend + Backend
3. [ ] **Verify health checks** - All green
4. [ ] **Test subscription flow** - One last time with real card
5. [ ] **Monitor for 1 hour** - Watch logs, webhooks, errors
6. [ ] **Announce launch** - Social media, blog, email list
7. [ ] **Monitor for 24 hours** - Be ready to respond to issues
8. [ ] **Celebrate!** 🎉

---

## Post-Launch Monitoring (First Week)

**Daily checks:**
- [ ] Webhook delivery success rate
- [ ] Error rate in logs
- [ ] Failed payment rate
- [ ] Database performance
- [ ] User signup rate
- [ ] Subscription conversion rate

**Weekly checks:**
- [ ] Security audit log review
- [ ] Performance metrics review
- [ ] User feedback review
- [ ] Cost analysis (Railway, Supabase, Stripe)

---

## Emergency Contacts

**Railway:** https://railway.app/help
**Stripe:** https://support.stripe.com (24/7 for payment issues)
**Supabase:** https://supabase.com/support

**Your contact:** [Add your email/phone]

---

**If all items above are ✅ green, your app is PRODUCTION READY! 🚀🎉**
