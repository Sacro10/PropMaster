# Routing Implementation Guide

## Overview

This document describes the routing implementation for the Property Management Automation SaaS application using React Router and Supabase Authentication.

---

## 🎯 Architecture

### Route Structure

```
/                    → Public homepage (marketing/landing page)
/auth                → Authentication page (login + signup)
/auth.html           → Alternative auth route (same as /auth)
/app                 → Protected application shell (redirects to /app/dashboard)
/app/dashboard       → Dashboard overview
/app/tenants         → Tenant management
/app/maintenance     → Maintenance panel
/app/analytics       → Analytics panel
/app/showings        → Property showings
/app/rent            → Rent collection
/app/communication   → Communication hub
/app/settings        → Settings (placeholder)
/*                   → Catch-all redirects to /
```

---

## 📦 Installation

### 1. Install Dependencies

```bash
npm install react-router-dom @supabase/supabase-js
# or
yarn add react-router-dom @supabase/supabase-js
# or
pnpm add react-router-dom @supabase/supabase-js
```

### 2. Environment Setup

Create a `.env.local` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**To get your Supabase credentials:**
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project (or use existing)
3. Go to Project Settings → API
4. Copy the Project URL and anon/public key

### 3. Supabase Database Setup

Run this SQL in your Supabase SQL Editor to create the required tables:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE subscription_tier AS ENUM ('basic', 'pro', 'premium');

-- User profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subscription_tier subscription_tier DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, subscription_tier)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'subscription_tier', 'basic')::subscription_tier
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 🏗️ File Structure

### New Files Created

```
src/
├── lib/
│   └── supabase.ts                    # Supabase client configuration
├── app/
│   ├── context/
│   │   └── AuthContext.tsx            # Authentication context provider
│   ├── components/
│   │   └── ProtectedRoute.tsx         # Route guard component
│   └── pages/
│       ├── HomePage.tsx               # Public landing page
│       ├── AuthPage.tsx               # Login/signup page
│       └── AppLayout.tsx              # Protected app shell with nav
.env.local                             # Environment variables (create this)
.env.example                           # Example environment file
```

### Modified Files

```
src/
├── main.tsx                           # Added BrowserRouter wrapper
└── app/
    └── App.tsx                        # Replaced with route definitions
package.json                           # Added new dependencies
```

---

## 🔐 Authentication Flow

### 1. Unauthenticated User Flow

```
User visits /app/dashboard
  ↓
No session found
  ↓
Redirect to /auth?returnTo=/app/dashboard
  ↓
User signs in
  ↓
Redirect to /app/dashboard (from returnTo param)
```

### 2. Authenticated User Flow

```
User visits /
  ↓
Session found
  ↓
"Go to Dashboard" button appears
  ↓
Click → Navigate to /app/dashboard
  ↓
Access granted
```

### 3. Session Persistence

- Sessions stored in `localStorage` via Supabase
- Auto-refresh tokens enabled
- Sessions persist across browser restarts
- Sign out clears all session data

---

## 🧪 Testing Steps

### Step 1: Install and Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

### Step 2: Test Public Routes

1. **Visit homepage** (`/`)
   - ✅ Should display landing page with hero, features, and pricing
   - ✅ Shows "Sign In" and "Get Started" buttons (when not logged in)
   - ✅ Theme toggle works
   - ✅ Can navigate to pricing section

2. **Click "Get Started"**
   - ✅ Redirects to `/auth`
   - ✅ Shows login/signup form

### Step 3: Test Authentication

1. **Sign Up Flow**
   - Click "Sign Up" toggle
   - Enter email: `test@example.com`
   - Enter password: `password123` (min 6 chars)
   - Click "Create Account"
   - ✅ Account created
   - ✅ Redirects to `/` (homepage)
   - ✅ Check Supabase → Authentication → Users (should see new user)
   - ✅ Check Supabase → Table Editor → user_profiles (should have entry)

2. **Sign In Flow**
   - Sign out first (if logged in)
   - Visit `/auth`
   - Enter credentials
   - Click "Sign In"
   - ✅ Successful login
   - ✅ Redirects to `/`
   - ✅ "Go to Dashboard" button now visible

3. **Sign Out**
   - Click on user avatar in app header
   - Click "Sign Out"
   - ✅ Session cleared
   - ✅ Redirected to homepage
   - ✅ Auth buttons visible again

### Step 4: Test Protected Routes

1. **Without Authentication**
   - Sign out (if logged in)
   - Try visiting these URLs directly:
     - `/app` → ✅ Redirects to `/auth?returnTo=/app`
     - `/app/dashboard` → ✅ Redirects to `/auth?returnTo=/app/dashboard`
     - `/app/tenants` → ✅ Redirects to `/auth?returnTo=/app/tenants`
   - All protected routes should redirect to auth

2. **With Authentication**
   - Sign in
   - Visit `/app` → ✅ Redirects to `/app/dashboard`
   - Visit `/app/dashboard` → ✅ Shows dashboard
   - Visit `/app/tenants` → ✅ Shows tenant management
   - Visit `/app/maintenance` → ✅ Shows maintenance panel
   - Visit `/app/analytics` → ✅ Shows analytics
   - Visit `/app/showings` → ✅ Shows property showings
   - Visit `/app/rent` → ✅ Shows rent collection
   - Visit `/app/communication` → ✅ Shows messages

### Step 5: Test Navigation

1. **Header Navigation**
   - Click "PROPMASTER" logo → ✅ Returns to homepage
   - Click user avatar → ✅ Shows dropdown menu
   - Click "Settings" → ✅ Opens settings page
   - Click "Sign Out" → ✅ Logs out and redirects home

2. **Tab Navigation**
   - Click each tab in nav bar
   - ✅ URL updates correctly
   - ✅ Active tab highlighted
   - ✅ Component loads correctly
   - ✅ Browser back/forward works

3. **Deep Linking**
   - Sign out
   - Visit `/app/tenants` directly
   - Sign in
   - ✅ After login, redirected to `/app/tenants` (the requested page)

### Step 6: Test Edge Cases

1. **Invalid Routes**
   - Visit `/invalid-route` → ✅ Redirects to `/`
   - Visit `/app/invalid` → ✅ Redirects to `/` (or shows 404)

2. **Session Expiry**
   - Sign in
   - Wait for session to expire (or manually delete from localStorage)
   - Try to navigate
   - ✅ Redirects to `/auth`

3. **Concurrent Sessions**
   - Sign in on one browser tab
   - Open new tab
   - ✅ Session shared across tabs
   - Sign out in one tab
   - ✅ Other tab also logs out

### Step 7: Test returnTo Parameter

1. **Deep Link Protection**
   - Sign out
   - Manually visit: `/app/analytics`
   - ✅ Redirects to `/auth?returnTo=%2Fapp%2Fanalytics`
   - Sign in
   - ✅ After login, redirected to `/app/analytics`

2. **From Homepage**
   - Sign out
   - Visit homepage `/`
   - Click "Get Started"
   - ✅ Goes to `/auth` (no returnTo param)
   - Sign in
   - ✅ Redirected to `/` (homepage)

---

## 🎨 Features Implemented

### ✅ Public Homepage
- Hero section with CTA
- Feature highlights (6 key features)
- Pricing section (Basic/Pro/Premium)
- Responsive design
- Theme toggle support

### ✅ Authentication Page
- Email/password login
- Email/password signup
- Error handling
- Success messages
- Loading states
- Toggle between login/signup
- "Back to Home" link
- returnTo parameter support

### ✅ Protected App Layout
- Persistent header with navigation
- Tab-based navigation (7 sections)
- User dropdown menu
- Settings button
- Sign out functionality
- Active route highlighting
- Subscription tier display
- Notifications badge

### ✅ Route Protection
- ProtectedRoute component
- Automatic redirect to /auth
- returnTo parameter preservation
- Loading state during auth check
- Session persistence

### ✅ Session Management
- Auto-refresh tokens
- LocalStorage persistence
- Cross-tab synchronization
- Secure sign out

---

## 🔧 Configuration

### Supabase Auth Settings

Recommended settings in Supabase Dashboard → Authentication → Settings:

1. **Email Auth**: Enabled
2. **Confirm Email**: Enabled (for production) or Disabled (for testing)
3. **Secure Password**: Enabled
4. **Site URL**: `http://localhost:5173` (dev) or your production URL
5. **Redirect URLs**:
   - `http://localhost:5173/`
   - `http://localhost:5173/auth`
   - Your production URLs

### Email Templates (Optional)

Customize email templates in Supabase → Authentication → Email Templates:
- Confirmation email
- Magic link email
- Password reset

---

## 🚀 Deployment

### Environment Variables (Production)

Set these in your hosting platform (Vercel, Netlify, etc.):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key
```

### Build Command

```bash
npm run build
```

### Deploy Checklist

- [ ] Set production environment variables
- [ ] Update Supabase Site URL to production domain
- [ ] Add production URL to Supabase Redirect URLs
- [ ] Enable email confirmation in Supabase
- [ ] Test authentication flow on production
- [ ] Test all protected routes
- [ ] Verify session persistence

---

## 🐛 Troubleshooting

### Issue: "Missing Supabase environment variables"

**Solution**: Create `.env.local` file with correct Supabase credentials

### Issue: Infinite redirect loop

**Solution**:
1. Check if Supabase credentials are correct
2. Clear browser localStorage
3. Verify RLS policies allow user profile reads

### Issue: "User not found after signup"

**Solution**:
1. Check Supabase → Authentication → Users
2. Verify email confirmation settings
3. Check SQL trigger is created correctly

### Issue: Routes not working after deployment

**Solution**:
1. Configure hosting platform for SPA routing
2. Add `_redirects` (Netlify) or `vercel.json` (Vercel):

**Netlify** (`public/_redirects`):
```
/*    /index.html   200
```

**Vercel** (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Issue: Session not persisting

**Solution**:
1. Check browser localStorage is enabled
2. Verify Supabase auth settings
3. Check for CORS issues
4. Ensure cookies/storage not blocked

---

## 📚 Additional Resources

- [React Router Documentation](https://reactrouter.com/en/main)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

---

## 🎉 Summary

You now have a fully functional routing system with:

- ✅ Public homepage at `/`
- ✅ Authentication at `/auth`
- ✅ Protected routes under `/app/*`
- ✅ Session management with Supabase
- ✅ Route guards and redirects
- ✅ Deep link support with returnTo
- ✅ Persistent sessions across reloads
- ✅ Clean separation of public and protected content

All your existing UI components are preserved and integrated into the new routing structure!
