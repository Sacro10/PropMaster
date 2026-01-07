# Stripe Subscription Integration Guide

This guide covers how to set up, test, and deploy the Stripe subscription integration for the Property Management Automation App.

## Architecture Overview

The integration consists of two services:

1. **Frontend (Vite)** - Main application with subscription UI
2. **Server (Express)** - Handles Stripe webhooks and checkout sessions

Both can be deployed together on Railway.

---

## 1. Stripe Setup

### Create Stripe Products and Prices

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/products)
2. Create two products:

   **Pro Plan**
   - Name: Pro
   - Price: $10/month (recurring)
   - Copy the Price ID (starts with `price_...`)

   **Premium Plan**
   - Name: Premium
   - Price: $20/month (recurring)
   - Copy the Price ID (starts with `price_...`)

3. Save these Price IDs - you'll need them for environment variables

### Get API Keys

1. Go to [API Keys](https://dashboard.stripe.com/test/apikeys)
2. Copy your:
   - **Publishable key** (starts with `pk_test_...`)
   - **Secret key** (starts with `sk_test_...`)

---

## 2. Local Development Setup

### Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### Configure Environment Variables

#### Frontend `.env.local`

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
VITE_API_URL=http://localhost:3001
```

#### Server `.env`

Create `server/.env`:

```env
PORT=3001
NODE_ENV=development

# Stripe Keys
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Stripe Price IDs
STRIPE_PRO_PRICE_ID=price_pro_monthly_id
STRIPE_PREMIUM_PRICE_ID=price_premium_monthly_id

# Supabase Admin Access
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
```

**Important**: Get the `SUPABASE_SERVICE_ROLE_KEY` from:
Supabase Dashboard → Settings → API → service_role key (secret)

---

## 3. Local Testing with Stripe CLI

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Linux
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin
```

### Login to Stripe

```bash
stripe login
```

### Forward Webhooks to Local Server

```bash
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

This will output a webhook signing secret like:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

**Copy this secret** and add it to `server/.env` as `STRIPE_WEBHOOK_SECRET`.

### Start Development Servers

Open 3 terminal windows:

**Terminal 1 - Frontend:**
```bash
npm run dev
```
Frontend will run on http://localhost:5173

**Terminal 2 - Server:**
```bash
cd server
npm run dev
```
Server will run on http://localhost:3001

**Terminal 3 - Stripe CLI:**
```bash
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

### Test the Flow

1. Navigate to http://localhost:5173
2. Sign up or log in
3. Go to Settings (click your profile menu)
4. Click "Upgrade Now" on Pro or Premium plan
5. Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
6. Complete checkout
7. Watch Terminal 3 - you should see webhook events
8. Verify in the database that your account was updated

### Trigger Test Webhook Events

```bash
# Test successful subscription creation
stripe trigger customer.subscription.created

# Test subscription update
stripe trigger customer.subscription.updated

# Test subscription deletion
stripe trigger customer.subscription.deleted

# Test payment success
stripe trigger invoice.payment_succeeded

# Test payment failure
stripe trigger invoice.payment_failed
```

---

## 4. Railway Deployment

### Option A: Monorepo (Recommended)

Deploy both frontend and server from the same repository.

#### Step 1: Create Railway Project

1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

#### Step 2: Create Server Service

1. In Railway, click "+ New"
2. Select "Empty Service"
3. Name it "API Server"
4. Go to Settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

5. Add Environment Variables:
   ```
   NODE_ENV=production
   PORT=3001
   STRIPE_SECRET_KEY=sk_live_your_live_secret_key
   STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
   STRIPE_PRO_PRICE_ID=price_pro_monthly_id
   STRIPE_PREMIUM_PRICE_ID=price_premium_monthly_id
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   FRONTEND_URL=https://your-frontend.railway.app
   ```

6. Generate a domain:
   - Settings → Networking → Generate Domain
   - Copy the URL (e.g., `https://api-server-production.up.railway.app`)

#### Step 3: Create Frontend Service

1. Click "+ New" → "Empty Service"
2. Name it "Frontend"
3. Go to Settings:
   - **Root Directory**: Leave empty (project root)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx vite preview --host 0.0.0.0 --port $PORT`

4. Add Environment Variables:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_publishable_key
   VITE_API_URL=https://your-api-server.railway.app
   ```
   (Use the server URL from Step 2)

5. Generate a domain for frontend

#### Step 4: Configure Stripe Webhook

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "+ Add endpoint"
3. Endpoint URL: `https://your-api-server.railway.app/webhooks/stripe`
4. Select events to listen to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the "Signing secret" (starts with `whsec_`)
7. Update Railway server environment variable:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_production_secret_here
   ```

#### Step 5: Update Frontend Environment

Update the frontend service environment variables with the actual server URL:
```
VITE_API_URL=https://your-api-server.railway.app
```

Redeploy both services.

### Option B: Separate Repositories

If you prefer separate repos:

1. Move `server/` folder to its own repository
2. Deploy server repository to Railway (follow Step 2 above)
3. Deploy frontend repository to Railway (follow Step 3 above)

---

## 5. Testing in Production

### Test with Real Payment

1. Visit your production frontend URL
2. Sign up with a real email
3. Go to Settings
4. Upgrade to Pro or Premium
5. Use a **test card** (even in live mode, you can use test mode):
   - Card: `4242 4242 4242 4242`
   - Or use a real card for actual testing

### Test Webhook Delivery

1. Go to [Stripe Webhooks Dashboard](https://dashboard.stripe.com/webhooks)
2. Click on your webhook endpoint
3. View recent webhook attempts
4. Check for any failures

### Verify Database Updates

1. Open Supabase Dashboard → Table Editor
2. Check the `accounts` table
3. Verify the following fields are updated:
   - `stripe_customer_id`
   - `stripe_subscription_id`
   - `subscription_status` (should be "active")
   - `plan` (should be "pro" or "premium")
   - `max_properties` and `max_units` (should match plan limits)

---

## 6. Subscription Management

### Customer Portal

Users can manage their subscription via the Stripe Customer Portal:

1. Go to Settings page
2. Click "Manage Subscription" button
3. They can:
   - Update payment method
   - View invoices
   - Cancel subscription
   - Upgrade/downgrade plan

### Cancellation Flow

When a user cancels:
1. Subscription continues until period end
2. Webhook event `customer.subscription.deleted` is sent
3. Server updates account to `plan: 'basic'`
4. User loses access to premium features at period end

### Failed Payment Handling

When payment fails:
1. Stripe retries automatically
2. Webhook event `invoice.payment_failed` is sent
3. Server updates `subscription_status` to `past_due`
4. You can check status in your code to limit feature access

---

## 7. Environment Variables Reference

### Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbG...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_test_...` or `pk_live_...` |
| `VITE_API_URL` | Backend server URL | `http://localhost:3001` |

### Server

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` or `production` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_PRO_PRICE_ID` | Pro plan price ID | `price_...` |
| `STRIPE_PREMIUM_PRICE_ID` | Premium plan price ID | `price_...` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) | `eyJhbG...` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |

---

## 8. Webhook Security Features

The webhook handler includes:

✅ **Signature Verification** - Validates requests come from Stripe
✅ **Idempotency** - Prevents duplicate event processing
✅ **Error Handling** - Returns 500 on errors so Stripe retries
✅ **Account Isolation** - Updates only the correct account
✅ **Safe Downgrades** - Handles subscription cancellations gracefully

---

## 9. Troubleshooting

### Webhook Not Receiving Events

- Check Railway logs: `railway logs` or view in Railway dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
- Check webhook endpoint URL is correct in Stripe Dashboard
- Test with `stripe trigger` commands

### Checkout Fails

- Check browser console for errors
- Verify `VITE_API_URL` is correct
- Check server logs for errors
- Ensure `STRIPE_PRO_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID` are correct

### Database Not Updating

- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct (not anon key)
- Check server logs for Supabase errors
- Verify `accounts` table has correct schema
- Check webhook events in Stripe Dashboard

### CORS Errors

- Verify `FRONTEND_URL` environment variable on server
- Check server is actually running
- Verify no typos in URLs

---

## 10. Going Live Checklist

Before switching to live mode:

- [ ] Create live products and prices in Stripe Dashboard
- [ ] Update `STRIPE_PRO_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID` with live IDs
- [ ] Switch to live API keys (`pk_live_...` and `sk_live_...`)
- [ ] Create live webhook endpoint in Stripe Dashboard
- [ ] Update `STRIPE_WEBHOOK_SECRET` with live webhook secret
- [ ] Test with a real card (small amount)
- [ ] Verify webhooks are working in production
- [ ] Test customer portal
- [ ] Monitor Railway logs for any errors

---

## Support

- **Stripe Docs**: https://stripe.com/docs
- **Stripe Testing**: https://stripe.com/docs/testing
- **Railway Docs**: https://docs.railway.app
- **Supabase Docs**: https://supabase.com/docs

---

## Security Notes

⚠️ **Never commit the following to version control:**
- `.env` or `.env.local` files
- Service role keys
- Stripe secret keys
- Webhook secrets

✅ **Safe to commit:**
- `.env.example` files (with placeholder values)
- Publishable keys (they're meant to be public)
- Anon keys (protected by RLS policies)
