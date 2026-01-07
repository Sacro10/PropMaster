# Deployment Checklist

## ✅ Pre-Deployment Checklist

Use this checklist before deploying to production.

---

## 🔧 Development Setup

### ✅ Local Environment

- [ ] Run `npm install` successfully
- [ ] Create `.env.local` with Supabase credentials
- [ ] Test `npm run dev` starts without errors
- [ ] All TypeScript compiles without errors
- [ ] No console errors on homepage
- [ ] No console errors on auth page
- [ ] No console errors in protected routes

### ✅ Supabase Setup

- [ ] Supabase project created
- [ ] Database schema executed successfully
- [ ] `user_profiles` table exists
- [ ] Trigger `handle_new_user` created
- [ ] RLS enabled on `user_profiles`
- [ ] RLS policies created and working
- [ ] Email auth provider enabled

### ✅ Authentication Testing

- [ ] Can sign up new user
- [ ] User appears in Supabase → Authentication → Users
- [ ] Profile created in `user_profiles` table
- [ ] Can sign in with created user
- [ ] Can sign out successfully
- [ ] Session persists after page reload
- [ ] Session clears after sign out

### ✅ Routing Testing

- [ ] Homepage `/` loads correctly
- [ ] Auth page `/auth` loads correctly
- [ ] Unauthenticated access to `/app/*` redirects to `/auth`
- [ ] Authenticated access to `/app/*` works
- [ ] All 7 app routes load without errors:
  - [ ] `/app/dashboard`
  - [ ] `/app/tenants`
  - [ ] `/app/maintenance`
  - [ ] `/app/analytics`
  - [ ] `/app/showings`
  - [ ] `/app/rent`
  - [ ] `/app/communication`
- [ ] Navigation tabs highlight correctly
- [ ] Browser back/forward buttons work
- [ ] Deep linking works (e.g., direct visit to `/app/tenants`)
- [ ] `returnTo` parameter works after login

---

## 🚀 Production Preparation

### ✅ Environment Configuration

- [ ] Production Supabase project created (or use same)
- [ ] Production environment variables ready:
  ```
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGc...
  ```
- [ ] `.env.local` added to `.gitignore`
- [ ] `.env.example` committed to repo

### ✅ Supabase Production Settings

- [ ] **Email confirmation ENABLED**
  - Go to: Authentication → Providers → Email
  - Check: "Confirm email"
  - Save
- [ ] **Site URL set to production domain**
  - Go to: Authentication → URL Configuration
  - Site URL: `https://yourdomain.com`
- [ ] **Redirect URLs configured**
  - Add: `https://yourdomain.com/`
  - Add: `https://yourdomain.com/auth`
  - Add: `https://yourdomain.com/app/*`
- [ ] **Email templates customized** (optional but recommended)
  - Confirmation email
  - Magic link email
  - Password reset email

### ✅ Code Preparation

- [ ] Remove all `console.log` statements (or use proper logging)
- [ ] Update meta tags in `index.html`:
  - [ ] Title
  - [ ] Description
  - [ ] Favicon
  - [ ] Open Graph tags
- [ ] Add error boundary component (recommended)
- [ ] Add 404 page (recommended)
- [ ] Test `npm run build` completes successfully
- [ ] Test built version: `npm run preview`

---

## 🌐 Hosting Platform Setup

### Choose Your Platform

#### Option A: Vercel (Recommended)

**Why Vercel:**
- Zero configuration for Vite
- Automatic previews for PRs
- Fast global CDN
- Free SSL
- Great DX

**Steps:**
1. [ ] Sign up at [vercel.com](https://vercel.com)
2. [ ] Connect GitHub repo
3. [ ] Vercel auto-detects Vite
4. [ ] Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. [ ] Deploy!

**SPA Routing Configuration:**
- [ ] Create `vercel.json` in project root:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### Option B: Netlify

**Steps:**
1. [ ] Sign up at [netlify.com](https://netlify.com)
2. [ ] Connect GitHub repo
3. [ ] Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. [ ] Add environment variables
5. [ ] Create `public/_redirects`:
```
/*    /index.html   200
```

#### Option C: Cloudflare Pages

**Steps:**
1. [ ] Sign up at [pages.cloudflare.com](https://pages.cloudflare.com)
2. [ ] Connect GitHub repo
3. [ ] Build settings:
   - Build command: `npm run build`
   - Build output: `dist`
   - Framework: Vite
4. [ ] Add environment variables
5. [ ] Deploy!

---

## 🔒 Security Review

### ✅ Supabase Security

- [ ] RLS enabled on all tables
- [ ] RLS policies tested and working
- [ ] Anon key is public (correct - designed for client)
- [ ] Service role key is NEVER in client code
- [ ] Email confirmation enabled in production
- [ ] Password requirements enabled

### ✅ Application Security

- [ ] No sensitive data in client code
- [ ] No API keys in client code (except Supabase anon key)
- [ ] HTTPS enforced (automatic with Vercel/Netlify/Cloudflare)
- [ ] CORS configured correctly
- [ ] No `eval()` or `dangerouslySetInnerHTML` (unless necessary)

---

## 📊 Monitoring & Analytics

### ✅ Error Tracking (Recommended)

**Option 1: Sentry**
```bash
npm install @sentry/react
```

**Option 2: LogRocket**
```bash
npm install logrocket
```

**Checklist:**
- [ ] Error tracking service set up
- [ ] Production errors captured
- [ ] Source maps uploaded (for debugging)

### ✅ Analytics (Recommended)

**Option 1: Plausible (privacy-friendly)**
- [ ] Account created
- [ ] Script added to `index.html`

**Option 2: Google Analytics**
- [ ] GA4 property created
- [ ] Tracking code added

**Option 3: PostHog (open source)**
- [ ] Account created
- [ ] SDK installed

---

## 🧪 Pre-Launch Testing

### ✅ Functional Testing

- [ ] Sign up flow works in production
- [ ] Email confirmation email received and works
- [ ] Sign in flow works
- [ ] All routes accessible after login
- [ ] Sign out works
- [ ] Deep linking works
- [ ] returnTo parameter works
- [ ] Browser back/forward work
- [ ] Mobile responsive (test on real device)

### ✅ Performance Testing

- [ ] Lighthouse score > 90 (all metrics)
- [ ] First Contentful Paint < 2s
- [ ] Time to Interactive < 3s
- [ ] No layout shift
- [ ] Images optimized
- [ ] No console errors
- [ ] No console warnings

### ✅ Cross-Browser Testing

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### ✅ Accessibility

- [ ] Can navigate with keyboard only
- [ ] Screen reader friendly
- [ ] Color contrast meets WCAG AA
- [ ] Form labels present
- [ ] ARIA attributes where needed

---

## 🚦 Launch Day

### ✅ Final Checks

- [ ] All environment variables set correctly
- [ ] Production build tested
- [ ] DNS configured (if custom domain)
- [ ] SSL certificate active
- [ ] Error tracking active
- [ ] Analytics active
- [ ] Backup of database taken

### ✅ Go Live!

1. [ ] Deploy to production
2. [ ] Test production URL
3. [ ] Sign up with real email
4. [ ] Verify confirmation email works
5. [ ] Test full user journey
6. [ ] Monitor error tracking dashboard
7. [ ] Check analytics receiving data

---

## 📈 Post-Launch

### ✅ First 24 Hours

- [ ] Monitor error rates
- [ ] Check user signup flow working
- [ ] Verify emails being delivered
- [ ] Watch for performance issues
- [ ] Test on multiple devices
- [ ] Collect initial user feedback

### ✅ First Week

- [ ] Review analytics data
- [ ] Check for common errors
- [ ] Monitor database growth
- [ ] Verify email deliverability
- [ ] Test backup/restore process
- [ ] Review Supabase usage/quotas

### ✅ Ongoing

- [ ] Weekly error review
- [ ] Monthly performance audit
- [ ] Security updates (dependencies)
- [ ] Supabase backups configured
- [ ] User feedback loop established

---

## 🆘 Rollback Plan

### If Something Goes Wrong

**Immediate Actions:**
1. [ ] Revert to previous deployment (Vercel/Netlify has one-click rollback)
2. [ ] Check Supabase status page
3. [ ] Review error tracking dashboard
4. [ ] Check recent commits

**Communication:**
1. [ ] Update status page (if applicable)
2. [ ] Notify users via email (if necessary)
3. [ ] Post on social media (if applicable)

**Database Rollback:**
1. [ ] Supabase keeps automatic backups (7 days on free tier)
2. [ ] Can restore from backup in Supabase dashboard
3. [ ] Test restore process before launch!

---

## 📝 Documentation

### ✅ Internal Docs

- [ ] Architecture documented (ARCHITECTURE.md ✅)
- [ ] API endpoints documented
- [ ] Database schema documented
- [ ] Deployment process documented
- [ ] Environment variables documented

### ✅ User Docs

- [ ] User guide created (optional)
- [ ] FAQ page (optional)
- [ ] Help/Support page
- [ ] Privacy policy (required if collecting emails)
- [ ] Terms of service (recommended)

---

## 🎯 Success Metrics

### Track These KPIs

**Technical:**
- [ ] Uptime (target: 99.9%)
- [ ] Error rate (target: < 0.1%)
- [ ] Page load time (target: < 2s)
- [ ] API response time (target: < 500ms)

**Business:**
- [ ] Sign-ups per day
- [ ] Active users
- [ ] Feature usage
- [ ] User retention

**User Experience:**
- [ ] Session duration
- [ ] Bounce rate
- [ ] Task completion rate
- [ ] User satisfaction (NPS)

---

## 🔄 Maintenance Schedule

### Daily
- [ ] Check error tracking dashboard
- [ ] Monitor uptime
- [ ] Review critical errors

### Weekly
- [ ] Review analytics
- [ ] Check database usage
- [ ] Scan for security updates
- [ ] User feedback review

### Monthly
- [ ] Update dependencies
- [ ] Performance audit
- [ ] Security audit
- [ ] Backup verification

### Quarterly
- [ ] Feature usage analysis
- [ ] Infrastructure review
- [ ] Cost optimization
- [ ] Roadmap planning

---

## ✅ Deployment Complete!

Once all items are checked, you're ready for production! 🚀

**Remember:**
- Start small, iterate often
- Monitor closely after launch
- Listen to user feedback
- Keep improving

**Good luck with your launch!** 🎉

---

## 📞 Support Resources

- Supabase Support: [supabase.com/support](https://supabase.com/support)
- Vercel Support: [vercel.com/support](https://vercel.com/support)
- React Router: [reactrouter.com](https://reactrouter.com)
- Vite: [vitejs.dev](https://vitejs.dev)

---

## 🎓 Additional Resources

- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)
- [Web.dev Performance Guide](https://web.dev/performance/)
- [OWASP Security Guidelines](https://owasp.org/www-project-web-security-testing-guide/)
