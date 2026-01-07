# Supabase Integration Guide

## 🎯 Overview

Your app now has a complete Supabase integration with:
- ✅ Typed Supabase client
- ✅ Auth helper functions
- ✅ TypeScript types for all database tables
- ✅ Environment configuration

---

## 📦 Files Created

```
src/lib/
├── supabaseClient.ts       # Configured Supabase client instance
├── auth.ts                 # Authentication helper functions
└── database.types.ts       # TypeScript types for your database
```

---

## 🚀 Quick Start

### 1. Set Up Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find these:**
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Go to Settings → API
4. Copy "Project URL" and "anon public" key

### 2. Start Using Supabase

The client is ready to use immediately:

```typescript
import { supabase } from '@/lib/supabaseClient'

// Query data
const { data, error } = await supabase
  .from('properties')
  .select('*')
```

---

## 🔐 Authentication API

### Import Auth Functions

```typescript
import {
  getSession,
  signInWithPassword,
  signUp,
  signOut,
  onAuthStateChange,
  getCurrentUser,
  isAuthenticated,
  resetPassword,
  updatePassword,
  updateUserMetadata,
} from '@/lib/auth'
```

### Get Current Session

```typescript
const { session, user, error } = await getSession()

if (user) {
  console.log('User is logged in:', user.email)
} else {
  console.log('No active session')
}
```

### Sign In

```typescript
const { user, error } = await signInWithPassword(
  'user@example.com',
  'password123'
)

if (error) {
  console.error('Login failed:', error.message)
} else {
  console.log('Logged in as:', user?.email)
}
```

### Sign Up

```typescript
const { user, error } = await signUp(
  'newuser@example.com',
  'securepassword',
  {
    data: {
      // Optional user metadata
      full_name: 'John Doe',
      subscription_tier: 'basic'
    },
    emailRedirectTo: 'https://yourapp.com/auth/callback'
  }
)

if (error) {
  console.error('Sign up failed:', error.message)
} else {
  console.log('Account created! Check email for confirmation.')
}
```

### Sign Out

```typescript
const { error } = await signOut()

if (!error) {
  console.log('Successfully signed out')
}
```

### Listen to Auth Changes

```typescript
import { useEffect } from 'react'

function MyComponent() {
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, session) => {
      console.log('Auth event:', event)
      console.log('Current session:', session)

      switch (event) {
        case 'SIGNED_IN':
          console.log('User signed in:', session?.user.email)
          break
        case 'SIGNED_OUT':
          console.log('User signed out')
          break
        case 'TOKEN_REFRESHED':
          console.log('Token refreshed')
          break
      }
    })

    // Cleanup on unmount
    return () => unsubscribe()
  }, [])

  return <div>My Component</div>
}
```

### Check Authentication Status

```typescript
const authenticated = await isAuthenticated()

if (authenticated) {
  console.log('User is logged in')
} else {
  console.log('User is not logged in')
}
```

### Get Current User

```typescript
const user = await getCurrentUser()

if (user) {
  console.log('Current user:', user.email)
  console.log('User ID:', user.id)
  console.log('User metadata:', user.user_metadata)
}
```

### Reset Password

```typescript
const { error } = await resetPassword('user@example.com')

if (!error) {
  console.log('Password reset email sent!')
}
```

### Update Password

```typescript
const { user, error } = await updatePassword('newSecurePassword123')

if (!error) {
  console.log('Password updated successfully')
}
```

### Update User Metadata

```typescript
const { user, error } = await updateUserMetadata({
  full_name: 'Jane Doe',
  avatar_url: 'https://...',
})

if (!error) {
  console.log('Profile updated:', user?.user_metadata)
}
```

---

## 🗄️ Database Queries

### Typed Queries

```typescript
import { supabase } from '@/lib/supabaseClient'
import type { Property, PropertyInsert } from '@/lib/database.types'

// SELECT - Get all properties
const { data: properties, error } = await supabase
  .from('properties')
  .select('*')

// Type is automatically inferred as Property[]
if (properties) {
  properties.forEach(property => {
    console.log(property.name) // TypeScript knows this exists!
  })
}

// SELECT with filter
const { data, error } = await supabase
  .from('properties')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })

// INSERT
const newProperty: PropertyInsert = {
  user_id: 'user-uuid',
  name: 'Sunset Apartments',
  address: '123 Main St',
  units: 24,
}

const { data, error } = await supabase
  .from('properties')
  .insert(newProperty)
  .select()
  .single()

// UPDATE
const { data, error } = await supabase
  .from('properties')
  .update({ units: 25 })
  .eq('id', propertyId)
  .select()

// DELETE
const { error } = await supabase
  .from('properties')
  .delete()
  .eq('id', propertyId)
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Property } from '@/lib/database.types'

function useProperties(userId: string) {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProperties() {
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (error) throw error
        setProperties(data || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchProperties()
  }, [userId])

  return { properties, loading, error }
}

// Usage in component
function PropertiesPage() {
  const { user } = useAuth()
  const { properties, loading, error } = useProperties(user?.id || '')

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      {properties.map(property => (
        <div key={property.id}>{property.name}</div>
      ))}
    </div>
  )
}
```

---

## 🔄 Real-time Subscriptions

```typescript
import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

function PropertyList() {
  useEffect(() => {
    // Subscribe to INSERT events
    const channel = supabase
      .channel('properties-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'properties'
        },
        (payload) => {
          console.log('New property added:', payload.new)
          // Update your state here
        }
      )
      .subscribe()

    // Cleanup
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return <div>Property List</div>
}

// Listen to all changes (INSERT, UPDATE, DELETE)
const channel = supabase
  .channel('all-property-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'properties',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('Change detected:', payload)
    }
  )
  .subscribe()
```

---

## 📊 Advanced Queries

### Joins

```typescript
// Get tenants with their property information
const { data, error } = await supabase
  .from('tenants')
  .select(`
    *,
    properties (
      name,
      address
    )
  `)
  .eq('user_id', userId)
```

### Aggregations

```typescript
// Count total properties
const { count, error } = await supabase
  .from('properties')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)

console.log('Total properties:', count)
```

### Full-Text Search

```typescript
const { data, error } = await supabase
  .from('tenants')
  .select('*')
  .textSearch('name', 'john', {
    type: 'websearch',
    config: 'english'
  })
```

### Pagination

```typescript
const pageSize = 10
const page = 2

const { data, error } = await supabase
  .from('properties')
  .select('*')
  .range((page - 1) * pageSize, page * pageSize - 1)
```

---

## 🛡️ Row Level Security (RLS)

Your database tables should have RLS policies to ensure users can only access their own data:

```sql
-- Example RLS policy for properties table
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own properties"
  ON properties
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own properties"
  ON properties
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own properties"
  ON properties
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own properties"
  ON properties
  FOR DELETE
  USING (auth.uid() = user_id);
```

---

## 📝 Type Generation

To auto-generate types from your actual database schema:

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Generate types
supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
```

This will overwrite `database.types.ts` with types that exactly match your database schema.

---

## 🔧 Configuration

The Supabase client in `supabaseClient.ts` is configured with:

- ✅ **Session Persistence** - Sessions stored in localStorage
- ✅ **Auto Token Refresh** - Tokens refresh automatically before expiry
- ✅ **URL Detection** - Handles OAuth callbacks automatically
- ✅ **PKCE Flow** - More secure authentication flow
- ✅ **Custom Headers** - Application identification

You can modify these settings in [src/lib/supabaseClient.ts](src/lib/supabaseClient.ts).

---

## 🐛 Error Handling

```typescript
import type { AuthError } from '@supabase/supabase-js'

async function handleLogin(email: string, password: string) {
  const { user, error } = await signInWithPassword(email, password)

  if (error) {
    // Handle specific error types
    if (error.message.includes('Invalid login credentials')) {
      console.error('Wrong email or password')
    } else if (error.message.includes('Email not confirmed')) {
      console.error('Please verify your email first')
    } else {
      console.error('Login error:', error.message)
    }
    return null
  }

  return user
}
```

---

## 🎯 Best Practices

1. **Always check for errors**
   ```typescript
   const { data, error } = await supabase.from('table').select()
   if (error) {
     console.error('Error:', error)
     return
   }
   // Use data safely
   ```

2. **Use TypeScript types**
   ```typescript
   import type { Property } from '@/lib/database.types'
   const property: Property = { /* ... */ }
   ```

3. **Handle loading states**
   ```typescript
   const [loading, setLoading] = useState(true)
   // Set false after query completes
   ```

4. **Clean up subscriptions**
   ```typescript
   useEffect(() => {
     const channel = supabase.channel('my-channel')
     // ...
     return () => supabase.removeChannel(channel)
   }, [])
   ```

5. **Use RLS policies**
   - Never trust client-side checks
   - Always enforce access control at the database level

---

## ✅ Build Verification

Your build should work without issues:

```bash
# Check TypeScript compilation
npm run build

# Should complete with no errors
# ✓ built in XXXms
```

The Supabase integration is fully compatible with Vite's build process.

---

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Reference](https://supabase.com/docs/reference/javascript/auth-api)
- [Supabase Database Reference](https://supabase.com/docs/reference/javascript/select)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

## 🎉 You're All Set!

Your Supabase integration is complete and ready to use. Start building by:

1. Creating your database schema in Supabase
2. Enabling RLS policies
3. Using the auth helpers for authentication
4. Querying data with full TypeScript support

Happy coding! 🚀
