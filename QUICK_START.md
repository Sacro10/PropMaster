# Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Step 1: Install Dependencies (1 min)

```bash
npm install
```

This installs:
- `react-router-dom` - Routing
- `@supabase/supabase-js` - Authentication & Database

### Step 2: Set Up Supabase (2 min)

1. **Create Supabase Project**
   - Go to [https://supabase.com](https://supabase.com)
   - Click "New Project"
   - Choose name, database password, region
   - Wait ~2 minutes for setup

2. **Get API Credentials**
   - Go to Project Settings → API
   - Copy "Project URL" and "anon public" key

3. **Create `.env.local`**
   ```bash
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...your-key-here
   ```

### Step 3: Set Up Database (1 min)

1. Go to Supabase → SQL Editor
2. Copy and paste this SQL:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TYPE subscription_tier AS ENUM ('basic', 'pro', 'premium');

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subscription_tier subscription_tier DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, subscription_tier)
  VALUES (NEW.id, NEW.email, 'basic');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

3. Click "Run"

### Step 4: Disable Email Confirmation (for testing - 30 sec)

1. Go to Supabase → Authentication → Providers
2. Click on "Email"
3. Uncheck "Confirm email"
4. Click "Save"

*Note: Re-enable this for production!*

### Step 5: Start the App (30 sec)

```bash
npm run dev
```

Visit: `http://localhost:5173`

---

## ✅ Verify It Works

### Test Authentication

1. Click "Get Started"
2. Click "Sign Up"
3. Enter:
   - Email: `test@example.com`
   - Password: `test123`
4. Click "Create Account"
5. ✅ You should be redirected to homepage
6. ✅ "Go to Dashboard" button appears
7. Click "Go to Dashboard"
8. ✅ You're in the app!

### Test Protected Routes

1. Open new incognito window
2. Visit: `http://localhost:5173/app/dashboard`
3. ✅ Should redirect to login page
4. Sign in
5. ✅ Should go to dashboard

---

## 🗺️ Route Map

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Public | Homepage/landing |
| `/auth` | Public | Login/signup |
| `/app` | Protected | Redirects to /app/dashboard |
| `/app/dashboard` | Protected | Dashboard overview |
| `/app/tenants` | Protected | Tenant management |
| `/app/maintenance` | Protected | Maintenance requests |
| `/app/analytics` | Protected | Analytics & reports |
| `/app/showings` | Protected | Property showings |
| `/app/rent` | Protected | Rent collection |
| `/app/communication` | Protected | Messages |
| `/app/settings` | Protected | Settings (placeholder) |

---

## 📁 What Changed?

### New Files (10)
```
.env.local                              ← Your Supabase credentials
.env.example                            ← Example env file
src/lib/supabase.ts                     ← Supabase client
src/app/context/AuthContext.tsx         ← Auth state management
src/app/components/ProtectedRoute.tsx   ← Route guard
src/app/pages/HomePage.tsx              ← Public landing page
src/app/pages/AuthPage.tsx              ← Login/signup
src/app/pages/AppLayout.tsx             ← App shell with nav
ROUTING_IMPLEMENTATION.md               ← Full documentation
QUICK_START.md                          ← This file
```

### Modified Files (3)
```
src/main.tsx                            ← Added BrowserRouter
src/app/App.tsx                         ← Routes instead of tabs
package.json                            ← New dependencies
```

### Unchanged (Your UI Components)
```
src/app/components/
  ├── DashboardOverview.tsx             ✅ Still works
  ├── TenantManagement.tsx              ✅ Still works
  ├── MaintenancePanel.tsx              ✅ Still works
  ├── AnalyticsPanel.tsx                ✅ Still works
  ├── PropertyShowings.tsx              ✅ Still works
  ├── RentCollection.tsx                ✅ Still works
  └── CommunicationHub.tsx              ✅ Still works
```

All your existing UI components are preserved and now integrated with routing!

---

## 🐛 Common Issues

### "Missing Supabase environment variables"
➡️ Create `.env.local` file with your Supabase credentials

### Page shows "Loading..." forever
➡️ Check your Supabase URL and key are correct

### Can't sign up
➡️ Make sure you disabled "Confirm email" in Supabase

### Routes redirect to homepage
➡️ Make sure SQL schema was created successfully

---

## 🎯 Next Steps

1. ✅ Test all routes work
2. ✅ Test sign in/sign out
3. ✅ Test protected routes redirect
4. 📝 Wire up real data to components (connect to Supabase tables)
5. 💳 Add Stripe for subscriptions
6. 🚀 Deploy to production

---

## 📚 More Info

See [ROUTING_IMPLEMENTATION.md](./ROUTING_IMPLEMENTATION.md) for:
- Complete testing guide
- Troubleshooting
- Deployment instructions
- Production checklist

---

**You're all set!** 🎉

Your app now has:
- ✅ Public homepage
- ✅ Authentication with Supabase
- ✅ Protected application routes
- ✅ Session persistence
- ✅ Clean URL structure
- ✅ All existing UI components working
