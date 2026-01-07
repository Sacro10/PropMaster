# Production Deployment Checklist

## Overview

Complete checklist for deploying your Property Management SaaS to production with Supabase, Stripe, and best practices for security, performance, and reliability.

---

## Phase 1: Pre-Deployment Setup

### 1.1 Supabase Production Setup

- [ ] Create production Supabase project
- [ ] Choose appropriate region (closest to users)
- [ ] Enable database backups (daily recommended)
- [ ] Set up point-in-time recovery (PITR)
- [ ] Configure connection pooling (Supavisor)
- [ ] Note down production credentials:
  - Project URL
  - Anon/public key
  - Service role key (keep secret!)
  - Database connection string

### 1.2 Database Migration

- [ ] Run migrations in order on production database:
  ```bash
  supabase link --project-ref your-prod-project-ref
  supabase db push
  ```
- [ ] Verify all tables created (22 tables)
- [ ] Verify all RLS policies enabled (60+ policies)
- [ ] Verify all helper functions created (7 functions)
- [ ] **Do NOT** run seed data in production (use it for staging/testing only)

### 1.3 RLS Policy Verification

- [ ] Enable RLS on all tables
- [ ] Test policies with different user roles
- [ ] Verify multi-tenant isolation works
- [ ] Test that service role key bypasses RLS (for admin operations)
- [ ] Document any temporary policy exceptions

### 1.4 Database Indexes & Performance

- [ ] Verify all indexes created
- [ ] Run VACUUM ANALYZE on all tables
- [ ] Enable pg_stat_statements extension for monitoring
- [ ] Set up query performance monitoring
- [ ] Configure connection pooling limits
- [ ] Set appropriate timeout values

### 1.5 Environment Variables

Create production `.env.local`:

```bash
# Supabase (Production)
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key

# Stripe (Production)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Environment
VITE_ENVIRONMENT=production
VITE_APP_URL=https://yourdomain.com

# Optional: Analytics
VITE_ANALYTICS_ID=...
```

**Security checklist:**
- [ ] Never commit `.env.local` to git
- [ ] Use separate keys for dev/staging/production
- [ ] Store secrets in secure vault (1Password, AWS Secrets Manager, etc.)
- [ ] Use environment variables in CI/CD pipeline
- [ ] Rotate keys every 90 days

---

## Phase 2: Stripe Integration

### 2.1 Stripe Account Setup

- [ ] Create Stripe account (or activate existing)
- [ ] Complete business verification
- [ ] Enable payment methods (card, ACH, etc.)
- [ ] Set up tax collection (if required)
- [ ] Configure billing portal
- [ ] Set company info and branding

### 2.2 Create Stripe Products

Create three subscription products:

**Basic Plan:**
- [ ] Name: "Basic Plan"
- [ ] Price: $0/month (or $9/month)
- [ ] Billing: Monthly
- [ ] Features: 10 properties, 100 units
- [ ] Copy Product ID: `prod_basic_xxx`
- [ ] Copy Price ID: `price_basic_xxx`

**Pro Plan:**
- [ ] Name: "Pro Plan"
- [ ] Price: $49/month (example)
- [ ] Billing: Monthly/Yearly
- [ ] Features: 50 properties, 500 units
- [ ] Copy Product ID: `prod_pro_xxx`
- [ ] Copy Price ID: `price_pro_xxx`

**Premium Plan:**
- [ ] Name: "Premium Plan"
- [ ] Price: $149/month (example)
- [ ] Billing: Monthly/Yearly
- [ ] Features: Unlimited properties, unlimited units
- [ ] Copy Product ID: `prod_premium_xxx`
- [ ] Copy Price ID: `price_premium_xxx`

### 2.3 Stripe Webhooks

- [ ] Set up webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Subscribe to events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `checkout.session.completed`
- [ ] Copy webhook signing secret
- [ ] Test webhook delivery
- [ ] Implement webhook handler (see code below)

### 2.4 Stripe Webhook Handler

Create API endpoint for handling webhooks:

```typescript
// app/api/webhooks/stripe/route.ts (Next.js example)
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabaseClient'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: Request) {
  const body = await req.text()
  const signature = headers().get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      const subscription = event.data.object as Stripe.Subscription
      await updateSubscription(subscription)
      break

    case 'customer.subscription.deleted':
      const deletedSub = event.data.object as Stripe.Subscription
      await cancelSubscription(deletedSub)
      break

    case 'invoice.paid':
      const invoice = event.data.object as Stripe.Invoice
      await recordPayment(invoice)
      break

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object as Stripe.Invoice
      await handleFailedPayment(failedInvoice)
      break

    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
}

async function updateSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string
  const status = subscription.status
  const priceId = subscription.items.data[0].price.id

  // Map price ID to plan
  const planMap: Record<string, string> = {
    'price_basic_xxx': 'basic',
    'price_pro_xxx': 'pro',
    'price_premium_xxx': 'premium',
  }

  const plan = planMap[priceId] || 'basic'

  // Update account in Supabase
  const { error } = await supabase
    .from('accounts')
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: status,
      plan: plan,
      subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId)

  if (error) {
    console.error('Error updating subscription:', error)
    throw error
  }
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  await supabase
    .from('accounts')
    .update({
      subscription_status: 'canceled',
      plan: 'basic', // Downgrade to free tier
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId)
}

async function recordPayment(invoice: Stripe.Invoice) {
  // Log successful payment
  console.log(`Payment successful for invoice ${invoice.id}`)
  // Optionally store in your database
}

async function handleFailedPayment(invoice: Stripe.Invoice) {
  // Send notification to customer
  // Update subscription status
  console.error(`Payment failed for invoice ${invoice.id}`)
}
```

### 2.5 Test Stripe Integration

- [ ] Test checkout flow (dev mode)
- [ ] Test subscription upgrade
- [ ] Test subscription downgrade
- [ ] Test subscription cancellation
- [ ] Test webhook delivery
- [ ] Test failed payment handling
- [ ] Switch to live mode
- [ ] Test with real card (small amount)

---

## Phase 3: Application Configuration

### 3.1 Vite Build Configuration

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false, // Disable in production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
})
```

### 3.2 TypeScript Configuration

Verify `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 3.3 Build & Test Locally

- [ ] Run TypeScript check: `npm run tsc --noEmit`
- [ ] Run build: `npm run build`
- [ ] Verify build output in `dist/`
- [ ] Test production build locally: `npm run preview`
- [ ] Check bundle size (should be < 500KB gzipped)
- [ ] Test all routes work
- [ ] Test authentication flow
- [ ] Test data fetching
- [ ] Check console for errors

---

## Phase 4: Security Hardening

### 4.1 Supabase Security Settings

- [ ] Enable email confirmation for new users
- [ ] Set password requirements (min length, complexity)
- [ ] Enable rate limiting on auth endpoints
- [ ] Configure JWT expiration (1 hour recommended)
- [ ] Set up refresh token rotation
- [ ] Disable unused auth providers
- [ ] Enable CAPTCHA for signup/signin (optional)

### 4.2 Database Security

- [ ] Verify RLS enabled on all tables
- [ ] Audit all RLS policies
- [ ] Limit database connections
- [ ] Enable SSL/TLS for database connections
- [ ] Rotate database password
- [ ] Restrict database access to specific IPs (optional)
- [ ] Enable audit logging
- [ ] Set up alerting for suspicious queries

### 4.3 API Security

- [ ] Use HTTPS everywhere
- [ ] Enable CORS with specific origins
- [ ] Implement rate limiting
- [ ] Add request size limits
- [ ] Sanitize user inputs
- [ ] Validate all data before database insertion
- [ ] Use parameterized queries (Supabase does this by default)
- [ ] Implement CSRF protection

### 4.4 Frontend Security

- [ ] Sanitize all user-generated content (prevent XSS)
- [ ] Use Content Security Policy (CSP) headers
- [ ] Disable browser autofill for sensitive fields
- [ ] Implement session timeout
- [ ] Clear sensitive data from memory on logout
- [ ] Don't expose API keys in client code (only anon key is safe)

### 4.5 Environment Variables Security

- [ ] Never commit `.env` files
- [ ] Use different keys for each environment
- [ ] Store secrets in CI/CD secret store
- [ ] Rotate keys regularly
- [ ] Use environment variable validation at runtime

---

## Phase 5: Performance Optimization

### 5.1 Database Performance

- [ ] Add indexes on frequently queried columns
- [ ] Enable query result caching
- [ ] Use connection pooling
- [ ] Optimize slow queries (use EXPLAIN ANALYZE)
- [ ] Implement pagination for large datasets
- [ ] Use database functions for complex logic
- [ ] Set appropriate vacuum/analyze schedules

### 5.2 Frontend Performance

- [ ] Enable code splitting
- [ ] Lazy load routes and components
- [ ] Optimize images (use WebP, compress, lazy load)
- [ ] Minimize bundle size
- [ ] Enable Vite preload for critical resources
- [ ] Implement virtual scrolling for long lists
- [ ] Use React.memo for expensive components
- [ ] Debounce search inputs

### 5.3 API Performance

- [ ] Implement caching (Redis/Cloudflare)
- [ ] Use CDN for static assets
- [ ] Enable compression (gzip/brotli)
- [ ] Optimize API response sizes
- [ ] Batch database queries where possible
- [ ] Use Supabase real-time sparingly (costs)

### 5.4 Monitoring Setup

- [ ] Set up error tracking (Sentry, Rollbar)
- [ ] Add performance monitoring (Lighthouse CI)
- [ ] Monitor database performance (pg_stat_statements)
- [ ] Track API response times
- [ ] Monitor user session duration
- [ ] Set up uptime monitoring (Pingdom, UptimeRobot)

---

## Phase 6: Testing

### 6.1 Unit Tests

- [ ] Test auth helper functions
- [ ] Test database query builders
- [ ] Test utility functions
- [ ] Test form validation logic
- [ ] Test business logic functions

### 6.2 Integration Tests

- [ ] Test signup → email confirmation → login flow
- [ ] Test create account → add property → add unit flow
- [ ] Test tenant invite → acceptance → lease creation flow
- [ ] Test maintenance request → assignment → completion flow
- [ ] Test payment due → reminder → payment → receipt flow
- [ ] Test Stripe checkout → webhook → account upgrade flow

### 6.3 E2E Tests (Playwright/Cypress)

- [ ] Test complete user journey (signup to first property)
- [ ] Test multi-tenant isolation
- [ ] Test role-based access control
- [ ] Test subscription upgrade/downgrade
- [ ] Test mobile responsiveness

### 6.4 Load Testing

- [ ] Test with 100 concurrent users
- [ ] Test with 1000 database records
- [ ] Test large data exports
- [ ] Test real-time updates under load
- [ ] Identify and fix bottlenecks

---

## Phase 7: Deployment

### 7.1 Choose Hosting Platform

**Recommended options:**

**Vercel (Easiest):**
- [ ] Create Vercel account
- [ ] Connect GitHub repository
- [ ] Set environment variables in Vercel dashboard
- [ ] Enable automatic deployments from main branch
- [ ] Configure custom domain

**Netlify:**
- [ ] Create Netlify account
- [ ] Connect GitHub repository
- [ ] Configure build settings (build command, publish directory)
- [ ] Set environment variables
- [ ] Enable automatic deployments

**AWS Amplify:**
- [ ] Create AWS account
- [ ] Set up Amplify app
- [ ] Connect GitHub repository
- [ ] Configure build settings
- [ ] Set environment variables

**Self-hosted (Docker):**
- [ ] Build Docker image
- [ ] Push to registry (Docker Hub, ECR)
- [ ] Deploy to server (EC2, DigitalOcean, etc.)
- [ ] Set up reverse proxy (Nginx)
- [ ] Configure SSL certificate (Let's Encrypt)

### 7.2 DNS & Domain Setup

- [ ] Purchase domain (Namecheap, Google Domains, etc.)
- [ ] Configure DNS records:
  - A record: `@` → Your server IP or hosting provider
  - CNAME record: `www` → Your domain
  - TXT record: For email verification (if using SendGrid, etc.)
- [ ] Set up SSL certificate (automatic with Vercel/Netlify)
- [ ] Configure HTTPS redirect
- [ ] Test domain propagation

### 7.3 Deploy to Production

**Vercel deployment:**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Manual build and deploy:**

```bash
# Build production bundle
npm run build

# Preview production build locally
npm run preview

# Deploy dist/ folder to hosting provider
# (Vercel, Netlify, AWS S3, etc.)
```

### 7.4 Post-Deployment Verification

- [ ] Visit production URL
- [ ] Test signup flow
- [ ] Test login flow
- [ ] Test creating first account
- [ ] Test creating first property
- [ ] Test all protected routes
- [ ] Test logout
- [ ] Check browser console for errors
- [ ] Check network tab for failed requests
- [ ] Test on mobile devices
- [ ] Test on different browsers (Chrome, Firefox, Safari, Edge)

---

## Phase 8: Monitoring & Maintenance

### 8.1 Error Tracking

**Set up Sentry:**

```bash
npm install @sentry/react @sentry/vite-plugin
```

```typescript
// src/main.tsx
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: import.meta.env.VITE_ENVIRONMENT,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})
```

### 8.2 Analytics Setup

**Set up PostHog (or similar):**

```bash
npm install posthog-js
```

```typescript
// src/lib/analytics.ts
import posthog from 'posthog-js'

posthog.init('your-posthog-key', {
  api_host: 'https://app.posthog.com',
  loaded: (posthog) => {
    if (import.meta.env.DEV) posthog.opt_out_capturing()
  },
})

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  posthog.capture(eventName, properties)
}
```

### 8.3 Logging

- [ ] Set up structured logging
- [ ] Log all authentication events
- [ ] Log all subscription changes
- [ ] Log all failed payments
- [ ] Log all RLS policy violations
- [ ] Set up log retention policy
- [ ] Create alerts for critical errors

### 8.4 Backup Strategy

- [ ] Enable daily database backups (Supabase)
- [ ] Test backup restoration process
- [ ] Store backups in separate location
- [ ] Document backup restoration steps
- [ ] Set up automated backup verification

### 8.5 Update Schedule

- [ ] Weekly: Review error logs
- [ ] Weekly: Check performance metrics
- [ ] Monthly: Update dependencies
- [ ] Monthly: Review and rotate API keys
- [ ] Quarterly: Security audit
- [ ] Quarterly: Performance optimization
- [ ] Yearly: Disaster recovery test

---

## Phase 9: Launch Preparation

### 9.1 Legal & Compliance

- [ ] Create Terms of Service
- [ ] Create Privacy Policy
- [ ] Add GDPR compliance (if EU users)
- [ ] Add CCPA compliance (if CA users)
- [ ] Add cookie consent banner
- [ ] Create data deletion policy
- [ ] Set up data export functionality

### 9.2 Email Setup

**Set up transactional email (SendGrid/Mailgun):**

- [ ] Create account
- [ ] Verify domain
- [ ] Set up SPF/DKIM records
- [ ] Create email templates:
  - Welcome email
  - Email confirmation
  - Password reset
  - Lease expiration reminder
  - Payment due reminder
  - Payment received confirmation
  - Maintenance request created
  - Maintenance request updated
  - Message received notification
- [ ] Test all email templates
- [ ] Set up email bounce handling
- [ ] Monitor email deliverability

### 9.3 Documentation

- [ ] User guide for landlords
- [ ] User guide for tenants
- [ ] FAQ page
- [ ] Video tutorials
- [ ] API documentation (if applicable)
- [ ] Changelog/Release notes

### 9.4 Support Setup

- [ ] Set up support email (support@yourdomain.com)
- [ ] Create help center (Intercom, Zendesk, etc.)
- [ ] Set up live chat (optional)
- [ ] Create support ticket system
- [ ] Document common issues and solutions

---

## Phase 10: Go Live

### 10.1 Soft Launch (Beta)

- [ ] Invite 10-20 beta testers
- [ ] Collect feedback
- [ ] Fix critical bugs
- [ ] Optimize based on real usage
- [ ] Monitor performance under real load

### 10.2 Public Launch

- [ ] Announce on social media
- [ ] Send email to waitlist
- [ ] Post on Product Hunt / Hacker News
- [ ] Publish blog post
- [ ] Monitor server load
- [ ] Be ready for quick bug fixes

### 10.3 Launch Day Checklist

- [ ] All team members on standby
- [ ] Error monitoring active
- [ ] Uptime monitoring active
- [ ] Support channels monitored
- [ ] Database backups verified
- [ ] Rollback plan ready
- [ ] Communication plan for downtime

---

## Phase 11: Post-Launch

### 11.1 First Week

- [ ] Monitor error rates daily
- [ ] Respond to all support tickets within 24 hours
- [ ] Fix critical bugs immediately
- [ ] Track user conversion rates
- [ ] Collect user feedback
- [ ] Document common issues

### 11.2 First Month

- [ ] Analyze user behavior with analytics
- [ ] Identify and fix top 10 bugs
- [ ] Optimize slow queries
- [ ] Improve onboarding flow based on data
- [ ] Add most requested features
- [ ] Publish product updates

### 11.3 Ongoing

- [ ] Weekly: Review metrics and KPIs
- [ ] Monthly: Release updates and new features
- [ ] Monthly: Security review
- [ ] Quarterly: Major feature release
- [ ] Quarterly: User survey
- [ ] Yearly: Architecture review

---

## Emergency Procedures

### Database Emergency

**If database is down:**
1. Check Supabase status page
2. Check database connection settings
3. Check if RLS is blocking all queries
4. Restore from backup if corrupted
5. Contact Supabase support

**If data is corrupted:**
1. Stop all write operations
2. Create emergency backup
3. Restore from last known good backup
4. Replay transactions if possible
5. Document incident for post-mortem

### Security Breach

**If API keys are exposed:**
1. Immediately rotate all keys
2. Review access logs
3. Identify affected users
4. Notify users if data accessed
5. Document breach
6. Implement additional security measures

**If user data is accessed:**
1. Identify scope of breach
2. Secure the vulnerability
3. Notify affected users
4. Contact legal counsel
5. Report to authorities if required
6. Document incident

### Performance Emergency

**If site is slow/down:**
1. Check server resources (CPU, memory)
2. Check database connections
3. Check for slow queries
4. Enable caching if disabled
5. Scale up resources if needed
6. Notify users of degraded performance

---

## Success Metrics

### Technical Metrics

- [ ] Uptime: > 99.9%
- [ ] Page load time: < 2 seconds
- [ ] API response time: < 200ms
- [ ] Database query time: < 50ms
- [ ] Error rate: < 0.1%
- [ ] Build time: < 2 minutes

### Business Metrics

- [ ] Signup conversion rate: > 10%
- [ ] Trial-to-paid conversion: > 20%
- [ ] Monthly churn rate: < 5%
- [ ] Customer satisfaction: > 4.5/5
- [ ] Support ticket resolution: < 24 hours

---

## Congratulations!

If you've completed this checklist, your Property Management SaaS is production-ready! 🎉

**Remember:**
- Monitor continuously
- Update regularly
- Listen to users
- Stay secure
- Scale gradually

Good luck with your launch! 🚀
