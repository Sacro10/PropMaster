# Stripe Integration - Quick Start

Get Stripe subscriptions running in 5 minutes.

## Prerequisites

- ✅ App already set up (see [QUICK_START.md](./QUICK_START.md))
- ✅ Node.js 18+ installed
- ✅ Stripe account (free at https://stripe.com)

---

## Step 1: Install Dependencies (1 min)

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

---

## Step 2: Create Stripe Products (2 min)

1. Go to https://dashboard.stripe.com/test/products
2. Click "Add product"

**Pro Plan:**
- Name: `Pro`
- Pricing: `Recurring` → `$10` → `Monthly`
- Click "Save product"
- **Copy the Price ID** (starts with `price_...`)

**Premium Plan:**
- Name: `Premium`
- Pricing: `Recurring` → `$20` → `Monthly`
- Click "Save product"
- **Copy the Price ID** (starts with `price_...`)

---

## Step 3: Get Stripe API Keys (30 sec)

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Publishable key** (`pk_test_...`)
3. Click "Reveal test key" and copy **Secret key** (`sk_test_...`)

---

## Step 4: Configure Environment (1 min)

### Update Frontend `.env.local`

Add these lines to your existing `.env.local`:

```env
# Add to existing .env.local
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_URL=http://localhost:3001
```

### Create Server Environment

Create `server/.env`:

```env
PORT=3001
NODE_ENV=development

STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_temporary_will_replace
STRIPE_PRO_PRICE_ID=price_your_pro_id
STRIPE_PREMIUM_PRICE_ID=price_your_premium_id

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FRONTEND_URL=http://localhost:5173
```

**Get Service Role Key:**
Supabase Dashboard → Settings → API → `service_role` key (secret)

---

## Step 5: Install Stripe CLI (1 min)

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Windows:**
```bash
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

**Linux:**
```bash
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin
```

Login:
```bash
stripe login
```

---

## Step 6: Start Everything (1 min)

Open **3 terminal windows**:

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Server:**
```bash
cd server
npm run dev
```

**Terminal 3 - Stripe Webhooks:**
```bash
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

**Important:** In Terminal 3, you'll see:
```
> Ready! Your webhook signing secret is whsec_xxxxx
```

**Copy that secret** and update `server/.env`:
```env
STRIPE_WEBHOOK_SECRET=whsec_the_secret_from_terminal_3
```

Restart the server (Terminal 2: Ctrl+C, then `npm run dev`)

---

## Step 7: Test It! (1 min)

1. Open http://localhost:5173
2. Sign in
3. Click your profile → **Settings**
4. Click **Upgrade Now** on Pro or Premium
5. Use test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - ZIP: `12345`
6. Complete checkout
7. You'll be redirected back with updated plan! 🎉

---

## ✅ Verify It Worked

### Check UI
- Settings page shows your new plan (Pro/Premium)
- "Current Plan" badge updated
- "Manage Subscription" button appears

### Check Database
1. Supabase Dashboard → Table Editor → `accounts`
2. Find your account
3. Verify:
   - ✅ `plan` = "pro" or "premium"
   - ✅ `stripe_customer_id` = filled
   - ✅ `stripe_subscription_id` = filled
   - ✅ `subscription_status` = "active"

### Check Webhooks
Look at Terminal 3 - you should see events like:
```
checkout.session.completed [evt_xxx]
customer.subscription.created [evt_xxx]
```

---

## Test Customer Portal

1. In Settings, click **Manage Subscription**
2. You'll see the Stripe Customer Portal
3. Try:
   - ✅ View invoice
   - ✅ Update payment method
   - ✅ Cancel subscription
   - ✅ Change plan

---

## 🐛 Troubleshooting

**Server won't start:**
- Check `server/.env` exists
- Verify all environment variables are filled

**Checkout button does nothing:**
- Check Terminal 2 (server) for errors
- Verify `VITE_API_URL=http://localhost:3001` in `.env.local`
- Check server is running on port 3001

**Database doesn't update:**
- Verify you're using **service role** key (not anon key)
- Check Terminal 3 shows webhook events
- Verify `STRIPE_WEBHOOK_SECRET` is correct
- Restart server after updating webhook secret

**"Missing environment variable" error:**
- Double-check variable names (no typos)
- Make sure `.env.local` is in project root
- Make sure `server/.env` is in server folder

---

## 🧪 Test Cards

- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **Requires 3D Secure:** `4000 0025 0000 3155`

Always use:
- Expiry: Any future date (e.g., 12/34)
- CVC: Any 3 digits (e.g., 123)
- ZIP: Any 5 digits (e.g., 12345)

---

## 🚀 Next Steps

You're done with local setup!

**To deploy to production:**
1. Read [STRIPE_SETUP.md](./STRIPE_SETUP.md) - full deployment guide
2. Create live Stripe products ($10 and $20)
3. Deploy to Railway (see guide)
4. Switch to live API keys

---

## 📚 Documentation

- **Quick setup:** This file
- **Full setup guide:** [STRIPE_SETUP.md](./STRIPE_SETUP.md)
- **Server API docs:** [server/README.md](./server/README.md)
- **Implementation summary:** [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md)

---

## 🎯 File Checklist

After setup, you should have:

```
✅ .env.local                    (updated with Stripe keys)
✅ server/.env                   (created with all vars)
✅ node_modules/                 (frontend dependencies)
✅ server/node_modules/          (server dependencies)
```

**Never commit:**
- `.env.local`
- `server/.env`
- Any files with real API keys

---

**Congrats! Your subscription system is live! 🎉**

Users can now:
- ✅ Upgrade to Pro ($10/mo) or Premium ($20/mo)
- ✅ Manage their subscription
- ✅ Cancel anytime
- ✅ See plan limits enforced
