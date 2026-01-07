# Production Deployment Guide

## Overview

This guide covers production-ready deployment of both the frontend and backend services to Railway.

---

## Prerequisites

- [x] Railway account created
- [x] GitHub repository connected
- [x] Live Stripe account with products created
- [x] Supabase project in production
- [x] Domain name (optional, Railway provides subdomains)

---

## Part 1: Backend API Server Deployment

### Step 1: Create Backend Service

1. Log in to [Railway](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Click **"Add a new service"**
6. Name it: **"API Server"**

### Step 2: Configure Backend Build Settings

In the service settings:

**Root Directory:**
```
server
```

**Build Command:** (auto-detected from package.json)
```
npm install && npm run build
```

**Start Command:** (auto-detected from package.json)
```
npm start
```

**Watch Paths:**
```
server/**
```

### Step 3: Set Backend Environment Variables

Add these environment variables in Railway:

```
# Server Config
NODE_ENV=production
PORT=3001

# Stripe Live Keys
STRIPE_SECRET_KEY=sk_live_your_live_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
STRIPE_PRO_PRICE_ID=price_live_pro_monthly
STRIPE_PREMIUM_PRICE_ID=price_live_premium_monthly

# Supabase Production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# Frontend URL (will update after frontend deployment)
FRONTEND_URL=https://your-frontend.up.railway.app
```

⚠️ **Important:** Use your **LIVE** Stripe keys, not test keys!

### Step 4: Generate Backend Domain

1. Go to service **Settings → Networking**
2. Click **"Generate Domain"**
3. Copy the generated URL (e.g., `https://api-server-production.up.railway.app`)
4. **Save this URL** - you'll need it for:
   - Frontend configuration
   - Stripe webhook setup

### Step 5: Deploy Backend

Click **"Deploy"** - Railway will:
1. Clone your repo
2. Install dependencies
3. Build TypeScript
4. Start the server

**Verify deployment:**
```bash
curl https://your-api-server.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-07T...",
  "environment": "production"
}
```

---

## Part 2: Frontend Deployment

### Step 1: Create Frontend Service

1. In same Railway project, click **"+ New"**
2. Select **"Empty Service"**
3. Name it: **"Frontend"**

### Step 2: Configure Frontend Build Settings

**Root Directory:**
```
(leave empty - use project root)
```

**Build Command:**
```
npm install && npm run build
```

**Start Command:**
```
npx vite preview --host 0.0.0.0 --port $PORT
```

**Watch Paths:**
```
src/**
public/**
index.html
package.json
vite.config.ts
```

### Step 3: Set Frontend Environment Variables

```
# Supabase Production
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key

# Stripe Live Publishable Key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_publishable_key

# API Server URL (from Part 1, Step 4)
VITE_API_URL=https://your-api-server.up.railway.app
```

### Step 4: Generate Frontend Domain

1. Go to service **Settings → Networking**
2. Click **"Generate Domain"**
3. Copy the generated URL (e.g., `https://property-mgmt.up.railway.app`)

### Step 5: Update Backend FRONTEND_URL

Go back to **API Server** service:
1. Update `FRONTEND_URL` environment variable
2. Set it to your frontend URL from Step 4
3. Service will auto-redeploy

### Step 6: Deploy Frontend

Click **"Deploy"**

**Verify deployment:**
- Visit your frontend URL
- Should see the homepage
- Try logging in

---

## Part 3: Configure Stripe Webhook

### Step 1: Create Live Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"+ Add endpoint"**
3. Enter endpoint URL:
   ```
   https://your-api-server.up.railway.app/webhooks/stripe
   ```

### Step 2: Select Events

Select these events:
- [x] `customer.subscription.created`
- [x] `customer.subscription.updated`
- [x] `customer.subscription.deleted`
- [x] `checkout.session.completed`
- [x] `invoice.payment_succeeded`
- [x] `invoice.payment_failed`

### Step 3: Get Webhook Secret

1. After creating endpoint, click on it
2. Click **"Reveal"** next to "Signing secret"
3. Copy the `whsec_...` value

### Step 4: Update Railway

Go back to Railway **API Server**:
1. Update `STRIPE_WEBHOOK_SECRET` environment variable
2. Paste the webhook secret
3. Service will auto-redeploy

---

## Part 4: Verification

### Test Subscription Flow End-to-End

1. **Sign up** on your production frontend
2. **Navigate to Settings**
3. **Click "Upgrade Now"** on Pro or Premium
4. **Use test card** (Stripe allows test mode in live):
   - Card: `4242 4242 4242 4242`
   - Or use real card for actual test
5. **Complete checkout**
6. **Verify:**
   - Redirected back to Settings
   - Plan shows as upgraded
   - Database updated in Supabase

### Check Webhook Delivery

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click on your webhook endpoint
3. View **"Events"** tab
4. Should see recent events with ✅ success status

### Check Audit Logs

1. Open Supabase Dashboard
2. Go to **Table Editor → audit_log**
3. Should see entries for:
   - `subscription_created`
   - `payment_succeeded`
   - `account_upgraded`

### Check Server Logs

In Railway:
1. Go to API Server service
2. Click **"Logs"** tab
3. Look for:
   ```
   🚀 Server running on port 3001
   ✅ Ready to handle requests
   Received webhook event: customer.subscription.created
   Account xxxxx updated successfully
   ```

---

## Part 5: Custom Domain (Optional)

### Backend Custom Domain

1. Go to API Server → **Settings → Networking**
2. Click **"Custom Domain"**
3. Add your domain (e.g., `api.yourapp.com`)
4. Add DNS records as shown:
   ```
   Type: CNAME
   Name: api
   Value: your-service.up.railway.app
   ```
5. Update Stripe webhook URL to use custom domain

### Frontend Custom Domain

1. Go to Frontend → **Settings → Networking**
2. Click **"Custom Domain"**
3. Add your domain (e.g., `app.yourapp.com` or `yourapp.com`)
4. Add DNS records:
   ```
   Type: CNAME (or A record for apex domain)
   Name: @ or app
   Value: your-frontend.up.railway.app
   ```
5. Update backend `FRONTEND_URL` to use custom domain

---

## Part 6: Security Hardening

### Enable HTTPS Only

Railway provides SSL by default. Ensure:
- [x] All URLs use `https://`
- [x] Stripe webhook uses `https://`
- [x] No mixed content warnings

### Rotate Secrets Regularly

Set calendar reminders to rotate:
- Stripe API keys (every 90 days)
- Supabase service role key (every 90 days)
- Webhook secrets (if compromised)

### Monitor Error Logs

Set up alerts for:
- Webhook failures
- Payment failures
- Server errors

In Railway:
1. Click **"Observability"**
2. Set up log alerts for error patterns

---

## Part 7: Monitoring & Alerts

### Health Check Monitoring

Use a service like:
- **UptimeRobot** (free)
- **Pingdom**
- **Better Uptime**

Monitor:
- `https://your-api-server.up.railway.app/health`
- `https://your-frontend.up.railway.app`

### Stripe Monitoring

Enable in Stripe Dashboard:
- Email alerts for failed payments
- Webhook delivery failures
- Subscription cancellations

### Database Monitoring

In Supabase:
1. Enable database alerts
2. Monitor connection pool usage
3. Set up performance insights

---

## Part 8: Backup & Recovery

### Database Backups

Supabase provides:
- Daily automatic backups (Pro plan)
- Point-in-time recovery

Enable:
1. Go to Supabase → **Settings → Database**
2. Enable **"Point-in-time Recovery"**

### Environment Variable Backup

Save all environment variables securely:
1. Use a password manager (1Password, Bitwarden)
2. Store in encrypted vault
3. Never commit to git

### Rollback Plan

If deployment fails:
1. Railway keeps previous deployment
2. Click **"Rollback"** in deployments tab
3. Or redeploy from specific commit

---

## Part 9: Performance Optimization

### Enable Caching

Add to frontend:
```javascript
// In vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          stripe: ['@stripe/stripe-js'],
        },
      },
    },
  },
});
```

### Enable Compression

Railway enables gzip compression by default.

### Database Connection Pooling

Supabase handles this automatically with connection pooler.

### CDN (Optional)

For static assets:
1. Use Cloudflare (free)
2. Point DNS to Cloudflare
3. Enable caching rules

---

## Part 10: Going Live Checklist

Before announcing to users:

**Backend:**
- [x] Live Stripe keys configured
- [x] Webhook secret set correctly
- [x] Health check returns 200
- [x] CORS allows frontend domain
- [x] Rate limiting enabled
- [x] Error logging working
- [x] Audit logging working

**Frontend:**
- [x] Live Stripe publishable key set
- [x] API URL points to production backend
- [x] Supabase production URL set
- [x] No console errors
- [x] All routes accessible

**Stripe:**
- [x] Live products created
- [x] Price IDs match environment variables
- [x] Webhook endpoint verified
- [x] Test subscription completed successfully

**Database:**
- [x] RLS policies enabled
- [x] Migrations run successfully
- [x] Audit log table exists
- [x] Backups enabled

**Security:**
- [x] All secrets in environment variables
- [x] No secrets in code or git
- [x] HTTPS enforced
- [x] Input validation working
- [x] Rate limiting active

**Monitoring:**
- [x] Health check monitoring set up
- [x] Error alerts configured
- [x] Webhook monitoring enabled
- [x] Log aggregation working

---

## Troubleshooting

### Backend Won't Start

**Check logs in Railway:**
```
Missing required environment variable
```
→ Add missing environment variable

**Port already in use:**
→ Railway sets `$PORT` automatically, ensure you use `process.env.PORT`

### Webhooks Not Working

**Check webhook logs in Stripe:**
- 400 error → Signature verification failed (check `STRIPE_WEBHOOK_SECRET`)
- 500 error → Check Railway logs for errors
- Timeout → Check server is running and reachable

### Database Connection Errors

**Check:**
- `SUPABASE_SERVICE_ROLE_KEY` is correct (not anon key)
- Supabase URL is correct
- Database is not paused (Pro plan required to prevent pausing)

### CORS Errors

**Check:**
- `FRONTEND_URL` matches exactly (no trailing slash)
- Frontend URL is HTTPS
- CORS origin in server code matches

---

## Cost Estimate

**Railway:**
- Free tier: $5/month credit
- Pro: $20/month (recommended for production)
- Estimated cost: ~$10-15/month for both services

**Supabase:**
- Free tier: Good for development
- Pro: $25/month (recommended for production)

**Stripe:**
- Free to use
- 2.9% + 30¢ per successful transaction

**Total estimated monthly cost:**
- Development: $0
- Production: ~$45-60/month + transaction fees

---

## Support

- **Railway:** https://railway.app/help
- **Stripe:** https://support.stripe.com
- **Supabase:** https://supabase.com/docs

---

**Your app is now production-ready! 🚀**
