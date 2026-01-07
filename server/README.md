# Property Management API Server

Express.js server for handling Stripe subscriptions, webhooks, and payment processing.

## Features

- ✅ Stripe Checkout session creation
- ✅ Stripe Customer Portal management
- ✅ Webhook handling with signature verification
- ✅ Idempotent webhook processing
- ✅ Automatic subscription sync to Supabase
- ✅ CORS configuration for frontend

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values
# (See STRIPE_SETUP.md for details)

# Start development server with hot reload
npm run dev
```

Server runs on http://localhost:3001

### Production

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start production server
npm start
```

## API Endpoints

### POST /api/create-checkout-session

Creates a Stripe Checkout session for subscription upgrade.

**Request Body:**
```json
{
  "accountId": "uuid",
  "plan": "pro" | "premium",
  "userId": "uuid"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

### POST /api/create-portal-session

Creates a Stripe Customer Portal session for subscription management.

**Request Body:**
```json
{
  "accountId": "uuid"
}
```

**Response:**
```json
{
  "url": "https://billing.stripe.com/..."
}
```

### POST /webhooks/stripe

Stripe webhook endpoint (signature verified).

**Handled Events:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `checkout.session.completed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-07T..."
}
```

## Environment Variables

See `.env.example` for all required variables.

**Critical:**
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access to database
- `STRIPE_PRO_PRICE_ID` - Pro plan price ID
- `STRIPE_PREMIUM_PRICE_ID` - Premium plan price ID

## Project Structure

```
server/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── config.ts             # Environment configuration
│   ├── stripe.ts             # Stripe client & helpers
│   ├── supabase.ts           # Supabase admin client
│   ├── routes/
│   │   └── checkout.ts       # Checkout & portal endpoints
│   └── webhooks/
│       └── stripe.ts         # Webhook handler
├── dist/                     # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── .env                      # Environment variables (not committed)
```

## Database Schema

The server updates the `accounts` table with these fields:

- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Active subscription ID
- `subscription_status` - Status (active, canceled, past_due, etc.)
- `subscription_current_period_end` - Subscription end date
- `plan` - Current plan (basic, pro, premium)
- `max_properties` - Plan property limit
- `max_units` - Plan unit limit

## Testing

### Local Testing

Use Stripe CLI to forward webhooks:

```bash
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

### Test Webhooks

```bash
stripe trigger customer.subscription.created
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
```

### Test Cards

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires authentication: `4000 0025 0000 3155`

## Deployment

See [STRIPE_SETUP.md](../STRIPE_SETUP.md) for full deployment instructions.

### Railway

1. Create new service with root directory: `server`
2. Add environment variables
3. Deploy automatically on push

## Security

- ✅ Webhook signature verification
- ✅ CORS protection
- ✅ Environment variable validation
- ✅ Idempotent event processing
- ✅ Service role key isolation

## Scripts

- `npm run dev` - Development with hot reload (tsx)
- `npm run build` - Compile TypeScript
- `npm start` - Run production build
- `npm run type-check` - Type check without compilation

## Troubleshooting

**Webhooks not working:**
- Check `STRIPE_WEBHOOK_SECRET` is correct
- Verify webhook endpoint in Stripe Dashboard
- Check server logs for signature errors

**Database not updating:**
- Verify `SUPABASE_SERVICE_ROLE_KEY` (not anon key)
- Check account exists with correct ID
- Review server logs for Supabase errors

**CORS errors:**
- Update `FRONTEND_URL` to match your frontend
- Verify no typos in environment variables
