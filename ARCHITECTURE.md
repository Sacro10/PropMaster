# Architecture Overview

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  React Application                      │   │
│  │                                                         │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │          BrowserRouter (main.tsx)             │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  │                      ↓                                  │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │          ThemeProvider                        │    │   │
│  │  │          AuthProvider                         │    │   │
│  │  │            App Component                      │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  │                      ↓                                  │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │              React Router                     │    │   │
│  │  │                                               │    │   │
│  │  │  PUBLIC ROUTES:                              │    │   │
│  │  │  • / (HomePage)                              │    │   │
│  │  │  • /auth (AuthPage)                          │    │   │
│  │  │                                               │    │   │
│  │  │  PROTECTED ROUTES:                           │    │   │
│  │  │  • /app (AppLayout) ← ProtectedRoute Guard   │    │   │
│  │  │    ├── /app/dashboard                        │    │   │
│  │  │    ├── /app/tenants                          │    │   │
│  │  │    ├── /app/maintenance                      │    │   │
│  │  │    ├── /app/analytics                        │    │   │
│  │  │    ├── /app/showings                         │    │   │
│  │  │    ├── /app/rent                             │    │   │
│  │  │    ├── /app/communication                    │    │   │
│  │  │    └── /app/settings                         │    │   │
│  │  │                                               │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │          Supabase Client (supabase.ts)                 │   │
│  │  • Auth Session Management                             │   │
│  │  • localStorage Persistence                            │   │
│  │  • Auto Token Refresh                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└──────────────────────────┬─────────────────────────────────────┘
                           │ HTTPS
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Backend)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Authentication                         │   │
│  │  • auth.users (built-in)                               │   │
│  │  • Email/Password provider                             │   │
│  │  • Session tokens (JWT)                                │   │
│  │  • Auto-refresh logic                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  PostgreSQL Database                    │   │
│  │                                                         │   │
│  │  user_profiles:                                        │   │
│  │  ├── id (UUID, FK → auth.users)                       │   │
│  │  ├── email (TEXT)                                      │   │
│  │  ├── subscription_tier (ENUM)                          │   │
│  │  ├── created_at (TIMESTAMPTZ)                          │   │
│  │  └── updated_at (TIMESTAMPTZ)                          │   │
│  │                                                         │   │
│  │  [Future tables for production data]                   │   │
│  │  • properties                                          │   │
│  │  • tenants                                             │   │
│  │  • maintenance_requests                                │   │
│  │  • rent_payments                                       │   │
│  │  • etc.                                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Row Level Security (RLS)                     │   │
│  │  • User can only see own data                          │   │
│  │  • Policies enforce data isolation                     │   │
│  │  • Runs on every query automatically                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Authentication Flow

### Sign Up Flow

```
┌──────────┐
│  User    │
│ enters   │
│  email   │
│  + pwd   │
└────┬─────┘
     │
     ↓
┌────────────────────────────────────┐
│  AuthPage.tsx                      │
│  handleSubmit() → signUp()         │
└────┬───────────────────────────────┘
     │
     ↓
┌────────────────────────────────────┐
│  AuthContext.tsx                   │
│  signUp(email, password)           │
└────┬───────────────────────────────┘
     │
     ↓
┌────────────────────────────────────┐
│  Supabase Client                   │
│  supabase.auth.signUp()            │
└────┬───────────────────────────────┘
     │
     ↓
┌────────────────────────────────────┐
│  Supabase Backend                  │
│  • Create auth.users entry         │
│  • Trigger: create user_profile    │
│  • Return session token            │
└────┬───────────────────────────────┘
     │
     ↓
┌────────────────────────────────────┐
│  AuthContext.tsx                   │
│  • setUser(user)                   │
│  • setSession(session)             │
│  • Store in localStorage           │
└────┬───────────────────────────────┘
     │
     ↓
┌────────────────────────────────────┐
│  AuthPage.tsx                      │
│  navigate("/")                     │
└────┬───────────────────────────────┘
     │
     ↓
┌────────────────────────────────────┐
│  HomePage.tsx                      │
│  Shows "Go to Dashboard" (logged in)│
└────────────────────────────────────┘
```

### Protected Route Flow

```
┌──────────┐
│  User    │
│ visits   │
│/app/dash │
└────┬─────┘
     │
     ↓
┌────────────────────────────────────┐
│  ProtectedRoute.tsx                │
│  Check: user exists?               │
└────┬───────────────────────────────┘
     │
     ├─── NO ──→ Navigate to /auth?returnTo=/app/dashboard
     │
     └─── YES ──→ Render children (AppLayout)
                       ↓
                 ┌─────────────────────┐
                 │  AppLayout.tsx      │
                 │  • Header           │
                 │  • Navigation       │
                 │  • <Outlet />       │
                 └──────┬──────────────┘
                        │
                        ↓
                 ┌─────────────────────┐
                 │ DashboardOverview.tsx│
                 │ (component renders)  │
                 └─────────────────────┘
```

---

## 📦 Component Hierarchy

```
App.tsx (Root)
├── ThemeProvider
│   └── AuthProvider
│       └── Routes
│           ├── Route "/" → HomePage
│           │   └── Public landing page
│           │
│           ├── Route "/auth" → AuthPage
│           │   └── Login/Signup form
│           │
│           └── Route "/app" → ProtectedRoute
│               └── AppLayout
│                   ├── Header (logo, user menu)
│                   ├── Navigation (tabs)
│                   └── Outlet (child routes)
│                       ├── Route "dashboard" → DashboardOverview
│                       ├── Route "tenants" → TenantManagement
│                       ├── Route "maintenance" → MaintenancePanel
│                       ├── Route "analytics" → AnalyticsPanel
│                       ├── Route "showings" → PropertyShowings
│                       ├── Route "rent" → RentCollection
│                       ├── Route "communication" → CommunicationHub
│                       └── Route "settings" → SettingsPlaceholder
```

---

## 🔐 Context Providers

### AuthContext

**Purpose**: Manages authentication state across the app

**State:**
```typescript
{
  user: User | null              // Current authenticated user
  profile: UserProfile | null    // User's profile from database
  session: Session | null        // Active session with tokens
  loading: boolean              // Loading state during auth check
}
```

**Methods:**
```typescript
signIn(email, password)    // Authenticate user
signUp(email, password)    // Create new account
signOut()                  // Clear session
refreshProfile()           // Reload user profile from DB
```

**How it works:**
1. On mount, checks for existing session
2. Sets up listener for auth state changes
3. Fetches user profile when user logs in
4. Provides auth state to all child components

### ThemeContext

**Purpose**: Manages light/dark theme across the app

**State:**
```typescript
{
  theme: 'light' | 'dark'
  toggleTheme: () => void
}
```

---

## 🛡️ Security Model

### Row Level Security (RLS)

Every database query is automatically filtered based on the authenticated user:

```sql
-- Example: user_profiles table
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- What this means:
SELECT * FROM user_profiles;
-- ↓ Automatically becomes:
SELECT * FROM user_profiles WHERE id = auth.uid();
```

**Benefits:**
- Users can ONLY access their own data
- No way to bypass via API
- Works at database level (not just frontend)
- Protects against malicious requests

### API Security

```typescript
// Supabase client configuration
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,  // ← Public key (safe to expose)
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage
    }
  }
)
```

**Security notes:**
- `SUPABASE_ANON_KEY` is safe to expose (designed for client-side)
- RLS policies enforce data access rules
- Session tokens are JWT (JSON Web Tokens)
- Tokens auto-refresh before expiry

---

## 🗄️ Data Flow

### Reading Data (Example: Fetch Tenants)

```
┌──────────────────┐
│ TenantManagement │
│ Component        │
└────────┬─────────┘
         │
         ↓
┌─────────────────────────────┐
│ useEffect(() => {           │
│   fetchTenants()            │
│ }, [])                      │
└────────┬────────────────────┘
         │
         ↓
┌──────────────────────────────────────┐
│ const { data } = await supabase      │
│   .from('tenants')                   │
│   .select('*')                       │
└────────┬─────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────┐
│ Supabase Backend                     │
│ • Check session token (JWT)          │
│ • Apply RLS: WHERE user_id = auth.uid()│
│ • Return filtered results            │
└────────┬─────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────┐
│ Component                            │
│ • setState(data)                     │
│ • Re-render with tenant list         │
└──────────────────────────────────────┘
```

### Writing Data (Example: Create Tenant)

```
┌──────────────────┐
│ User clicks      │
│ "Add Tenant"     │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────────┐
│ const { error } = await supabase     │
│   .from('tenants')                   │
│   .insert({                          │
│     user_id: auth.uid(),             │
│     name: 'John Doe',                │
│     ...                              │
│   })                                 │
└────────┬─────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────┐
│ Supabase Backend                     │
│ • Validate session                   │
│ • Check INSERT policy                │
│ • user_id must match auth.uid()      │
│ • Insert row if allowed              │
└────────┬─────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────┐
│ Component                            │
│ • Handle success/error               │
│ • Refresh tenant list                │
│ • Show notification                  │
└──────────────────────────────────────┘
```

---

## 🚦 Route Guard Logic

### ProtectedRoute Component

```typescript
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Still checking auth? Show loading
  if (loading) {
    return <LoadingSpinner />
  }

  // No user? Redirect to login
  if (!user) {
    return <Navigate to={`/auth?returnTo=${location.pathname}`} />
  }

  // User authenticated! Render protected content
  return <>{children}</>
}
```

**Decision tree:**
```
User visits /app/dashboard
         ↓
   loading === true?
    ├─ YES → Show loading spinner
    └─ NO → Continue
         ↓
   user === null?
    ├─ YES → Redirect to /auth?returnTo=/app/dashboard
    └─ NO → Render AppLayout + DashboardOverview
```

---

## 🔄 Session Management

### Session Lifecycle

```
┌─────────────────────────────────────────┐
│  1. USER SIGNS IN                       │
│  • Supabase creates session             │
│  • Returns JWT tokens (access + refresh)│
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  2. SESSION STORED                      │
│  • localStorage.setItem('sb-session')   │
│  • Contains: access_token, refresh_token│
│  • Expiry: 1 hour (access), 7 days (refresh)│
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  3. AUTO REFRESH (every 55 min)         │
│  • Supabase checks expiry automatically │
│  • Uses refresh_token to get new access │
│  • Updates localStorage                 │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  4. SESSION PERSISTS                    │
│  • Survives page reloads                │
│  • Survives browser restarts            │
│  • Works across tabs (same domain)      │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  5. USER SIGNS OUT                      │
│  • Supabase invalidates tokens          │
│  • localStorage.removeItem('sb-session')│
│  • AuthContext sets user = null         │
└─────────────────────────────────────────┘
```

---

## 📊 State Management

### Global State (via Context)

```
AuthContext
├── user (User | null)
├── profile (UserProfile | null)
├── session (Session | null)
└── loading (boolean)

ThemeContext
├── theme ('light' | 'dark')
└── toggleTheme (() => void)
```

### Local State (per component)

Each component manages its own:
- Form inputs
- Loading states
- Error messages
- Modal visibility
- Temporary UI state

**Example:**
```typescript
// TenantManagement.tsx
const [tenants, setTenants] = useState([])
const [searchQuery, setSearchQuery] = useState('')
const [isAddModalOpen, setIsAddModalOpen] = useState(false)
```

---

## 🎯 Summary

This architecture provides:

✅ **Security** - RLS enforces data isolation
✅ **Scalability** - Modular component structure
✅ **Maintainability** - Clear separation of concerns
✅ **Performance** - Lazy loading ready, efficient re-renders
✅ **User Experience** - Smooth navigation, persistent sessions
✅ **Developer Experience** - Type-safe, well-documented

The routing layer seamlessly integrates with your existing UI components while adding professional authentication and navigation capabilities.
