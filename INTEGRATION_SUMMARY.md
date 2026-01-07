# Stripe Integration Summary

## What Was Implemented

### ✅ Complete Stripe subscription system with:
- Pro plan ($10/month) and Premium plan ($20/month)
- Basic plan (free) as default
- Stripe Checkout for upgrades
- Stripe Customer Portal for subscription management
- Webhook handler for automatic database sync
- Idempotent and secure webhook processing

---

## File Structure

### Server (`/server`)

```
server/
├── src/
│   ├── index.ts                    # Express server entry point
│   ├── config.ts                   # Environment configuration
│   ├── stripe.ts                   # Stripe client and plan helpers
│   ├── supabase.ts                 # Supabase admin client
│   ├── routes/
│   │   └── checkout.ts             # Checkout & portal endpoints
│   └── webhooks/
│       └── stripe.ts               # Webhook handler (idempotent & secure)
├── package.json                    # Server dependencies
├── tsconfig.json                   # TypeScript config
├── .env.example                    # Environment template
├── .gitignore
├── railway.json                    # Railway deployment config
├── Procfile                        # Process definition
└── README.md                       # Server documentation
```

### Frontend Updates

```
src/
├── lib/
│   ├── stripe.ts                   # Stripe client & plan info
│   └── api/
│       └── subscription.ts         # API client for checkout/portal
└── app/
    ├── components/
    │   └── SubscriptionSettings.tsx  # Subscription management UI
    └── App.tsx                       # Updated with settings page
```

### Configuration Files

```
.env.example                        # Updated with Stripe vars
railway.json                        # Frontend deployment config
STRIPE_SETUP.md                     # Complete setup guide
INTEGRATION_SUMMARY.md              # This file
```

---

## Environment Variables

### Frontend (`.env.local`)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3001
```

### Server (`server/.env`)

```env
PORT=3001
NODE_ENV=development
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PREMIUM_PRICE_ID=price_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
FRONTEND_URL=http://localhost:5173
```

---

## Key Features

### 1. Subscription Plans

| Plan | Price | Max Units | Features |
|------|-------|-----------|----------|
| **Basic** | Free | 3 | Basic features |
| **Pro** | $10/mo | 100 | Advanced features + tenant screening |
| **Premium** | $20/mo | Unlimited | All features + AI + API access |

### 2. Webhook Events Handled

- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Plan change, renewal
- `customer.subscription.deleted` - Cancellation
- `checkout.session.completed` - Successful checkout
- `invoice.payment_succeeded` - Successful payment
- `invoice.payment_failed` - Failed payment

### 3. Database Updates

Webhooks automatically update the `accounts` table:

- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Current subscription
- `subscription_status` - active, canceled, past_due, etc.
- `subscription_current_period_end` - Renewal date
- `plan` - basic, pro, or premium
- `max_properties` - Plan limits
- `max_units` - Plan limits

### 4. Security Features

✅ Webhook signature verification
✅ Idempotency (prevents duplicate processing)
✅ CORS protection
✅ Service role key for database access
✅ Environment variable validation

---

## Local Testing Steps

### 1. Install Dependencies

```bash
npm install
cd server && npm install && cd ..
```

### 2. Set Up Stripe

1. Create Pro and Premium products in [Stripe Dashboard](https://dashboard.stripe.com/test/products)
2. Copy price IDs
3. Copy API keys from [API Keys](https://dashboard.stripe.com/test/apikeys)

### 3. Configure Environment

Create `.env.local` and `server/.env` with your values (see templates above).

### 4. Start Stripe CLI

```bash
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

Copy the webhook secret to `server/.env`.

### 5. Start Servers

**Terminal 1:**
```bash
npm run dev
```

**Terminal 2:**
```bash
cd server && npm run dev
```

**Terminal 3:**
```bash
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

### 6. Test Upgrade Flow

1. Go to http://localhost:5173
2. Sign in
3. Navigate to Settings
4. Click "Upgrade Now" on Pro or Premium
5. Use test card: `4242 4242 4242 4242`
6. Complete checkout
7. Verify database updates in Supabase

---

## Railway Deployment

### Two-Service Setup (Recommended)

**Service 1: API Server**
- Root Directory: `server`
- Build: `npm install && npm run build`
- Start: `npm start`
- Environment: See `server/.env.example`
- Generate domain, note URL

**Service 2: Frontend**
- Root Directory: (empty/root)
- Build: `npm install && npm run build`
- Start: `npx vite preview --host 0.0.0.0 --port $PORT`
- Environment: See `.env.example`
- Set `VITE_API_URL` to server URL

### Post-Deployment

1. Create live webhook in [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Endpoint: `https://your-server.railway.app/webhooks/stripe`
3. Copy signing secret
4. Update `STRIPE_WEBHOOK_SECRET` on Railway
5. Test with real card or test card

---

## API Endpoints

### POST `/api/create-checkout-session`

Creates Stripe Checkout session.

**Body:**
```json
{
  "accountId": "uuid",
  "plan": "pro" | "premium",
  "userId": "uuid"
}
```

**Returns:**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

### POST `/api/create-portal-session`

Creates Customer Portal session.

**Body:**
```json
{
  "accountId": "uuid"
}
```

**Returns:**
```json
{
  "url": "https://billing.stripe.com/..."
}
```

### POST `/webhooks/stripe`

Webhook endpoint (signature verified).

### GET `/health`

Health check.

---

## User Flow

### Upgrade Flow

1. User clicks "Upgrade Now" on Pro/Premium plan
2. Frontend calls `POST /api/create-checkout-session`
3. Server creates Stripe Checkout session
4. User redirects to Stripe Checkout
5. User enters payment info
6. Stripe processes payment
7. Stripe sends `checkout.session.completed` webhook
8. Server updates database with subscription
9. User redirects back to Settings page
10. UI shows updated plan

### Management Flow

1. User clicks "Manage Subscription"
2. Frontend calls `POST /api/create-portal-session`
3. Server creates Customer Portal session
4. User redirects to Stripe Customer Portal
5. User can:
   - Update payment method
   - View invoices
   - Cancel subscription
   - Change plan
6. Stripe sends webhook events
7. Server updates database
8. User redirects back to Settings

### Cancellation Flow

1. User cancels in Customer Portal
2. Stripe sends `customer.subscription.deleted` webhook
3. Server downgrades account to Basic plan
4. User loses access to premium features

---

## Dependencies Added

### Frontend

```json
{
  "@stripe/stripe-js": "^2.4.0"
}
```

### Server

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "stripe": "^14.14.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.16",
    "tsx": "^4.7.1",
    "typescript": "^5.3.3"
  }
}
```

---

## Next Steps

1. **Install dependencies:**
   ```bash
   npm install
   cd server && npm install
   ```

2. **Set up Stripe:**
   - Create products and prices
   - Get API keys
   - Configure environment variables

3. **Test locally:**
   - Follow local testing steps above
   - Use Stripe CLI for webhooks

4. **Deploy to Railway:**
   - Follow Railway deployment guide
   - Configure live webhook
   - Test in production

5. **Go live:**
   - Switch to live Stripe keys
   - Update price IDs to live products
   - Test with real payment

---

## Documentation

- **[STRIPE_SETUP.md](./STRIPE_SETUP.md)** - Complete setup and deployment guide
- **[server/README.md](./server/README.md)** - Server API documentation
- **[.env.example](./.env.example)** - Frontend environment template
- **[server/.env.example](./server/.env.example)** - Server environment template

---

## Support Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Railway Documentation](https://docs.railway.app)
- [Supabase Documentation](https://supabase.com/docs)

---

## Troubleshooting

**Issue: Webhooks not working**
- Verify webhook secret matches Stripe Dashboard
- Check server logs for errors
- Test with `stripe trigger` commands

**Issue: Database not updating**
- Verify service role key (not anon key)
- Check server has network access to Supabase
- Review webhook event logs in Stripe

**Issue: Checkout fails**
- Check `VITE_API_URL` is correct
- Verify price IDs are correct
- Check browser console for errors

**Issue: CORS errors**
- Update `FRONTEND_URL` on server
- Verify URLs match exactly

---

## Security Checklist

- [ ] Never commit `.env` files
- [ ] Use service role key only on server
- [ ] Verify webhook signatures
- [ ] Use HTTPS in production
- [ ] Rotate keys if exposed
- [ ] Enable Stripe webhook signature verification
- [ ] Review Railway environment variables
- [ ] Test with test keys first
