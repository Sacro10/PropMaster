import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase, UserProfile, isSupabaseConfigured } from '@/lib/supabase'
import {
  clearActivePortalRoleIntent,
  clearSessionRoleIntent,
  resolvePortalRoleIntent,
  roleMatchesPortalIntent,
  roleToPortalIntent,
  setActivePortalRoleIntent,
} from '@/lib/portalRole'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  role: string | null
  isActive: boolean
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const isOnlineRef = useRef(typeof navigator === 'undefined' ? true : navigator.onLine)
  const configError = {
    name: 'AuthError',
    message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
  } as AuthError
  const offlineError = {
    name: 'AuthError',
    message: 'You appear to be offline. Check your connection and try again.',
  } as AuthError

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    const hydrateUser = async (session: Session | null) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        if (isOnlineRef.current) {
          await Promise.all([
            fetchProfile(session.user.id),
            fetchRole(session.user.id),
          ])
        }
      } else {
        setProfile(null)
        setRole(null)
        setIsActive(true)
      }
      setLoading(false)
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      hydrateUser(session)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true)
      hydrateUser(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleOnline = () => {
      isOnlineRef.current = true
    }
    const handleOffline = () => {
      isOnlineRef.current = false
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const fetchProfile = async (userId: string) => {
    if (!isOnlineRef.current) {
      return
    }
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching profile:', error)
      } else if (!data) {
        // If profile doesn't exist, create a default one.
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            email: user?.email || '',
            subscription_tier: 'basic'
          })
          .select()
          .single()

        if (!insertError && newProfile) {
          setProfile(newProfile)
        }
      } else {
        setProfile(data)
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error)
    }
  }

  const fetchRole = async (userId: string) => {
    if (!isOnlineRef.current) {
      return
    }
    try {
      const { data, error } = await supabase
        .from('account_members')
        .select('role, is_active, joined_at, created_at')
        .eq('user_id', userId)

      if (error) {
        console.error('Error fetching role:', error)
        const fallbackRole = (user?.user_metadata as { role?: string } | undefined)?.role || null
        const membershipStatus = (user?.user_metadata as { membership_status?: string } | undefined)?.membership_status
        setRole(fallbackRole)
        const fallbackIntent = roleToPortalIntent(fallbackRole)
        if (fallbackIntent) {
          setActivePortalRoleIntent(fallbackIntent)
        }
        if (membershipStatus) {
          setIsActive(membershipStatus !== 'pending')
        } else {
          setIsActive(fallbackRole === 'tenant' ? false : true)
        }
        return
      }

      const records = Array.isArray(data) ? data : data ? [data] : []
      if (records.length === 0) {
        const fallbackRole = (user?.user_metadata as { role?: string } | undefined)?.role || null
        setRole(fallbackRole)
        const fallbackIntent = roleToPortalIntent(fallbackRole)
        if (fallbackIntent) {
          setActivePortalRoleIntent(fallbackIntent)
        }
        setIsActive(fallbackRole === 'tenant' ? false : true)
        return
      }

      const metadataRole = (user?.user_metadata as { role?: string } | undefined)?.role
      const roleIntent = resolvePortalRoleIntent()
      const preferredRecord = roleIntent
        ? records.find((item) => roleMatchesPortalIntent(roleIntent, item.role))
        : metadataRole
          ? records.find((item) => item.role === metadataRole)
          : null

      const sorted = [...records].sort((a, b) => {
        const dateA = new Date(a.joined_at || a.created_at || 0).getTime()
        const dateB = new Date(b.joined_at || b.created_at || 0).getTime()
        return dateB - dateA
      })

      const record = preferredRecord || sorted[0]
      setRole(record.role || null)
      setIsActive(record.is_active !== false)
      const resolvedIntent = roleToPortalIntent(record.role)
      if (resolvedIntent) {
        setActivePortalRoleIntent(resolvedIntent)
      }
      if (roleIntent) {
        clearSessionRoleIntent()
      }
    } catch (error) {
      console.error('Error in fetchRole:', error)
      const fallbackRole = (user?.user_metadata as { role?: string } | undefined)?.role || null
      const membershipStatus = (user?.user_metadata as { membership_status?: string } | undefined)?.membership_status
      setRole(fallbackRole)
      const fallbackIntent = roleToPortalIntent(fallbackRole)
      if (fallbackIntent) {
        setActivePortalRoleIntent(fallbackIntent)
      }
      if (membershipStatus) {
        setIsActive(membershipStatus !== 'pending')
      } else {
        setIsActive(fallbackRole === 'tenant' ? false : true)
      }
    }
  }

  const refreshProfile = async () => {
    if (!isSupabaseConfigured) {
      return
    }
    if (!isOnlineRef.current) {
      return
    }
    if (user) {
      await Promise.all([fetchProfile(user.id), fetchRole(user.id)])
    }
  }

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: configError }
    }
    if (!isOnlineRef.current) {
      return { error: offlineError }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: configError }
    }
    if (!isOnlineRef.current) {
      return { error: offlineError }
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          subscription_tier: 'basic'
        }
      }
    })
    return { error }
  }

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      return
    }
    await supabase.auth.signOut()
    clearSessionRoleIntent()
    clearActivePortalRoleIntent()
    setProfile(null)
    setRole(null)
    setIsActive(true)
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      role,
      isActive,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
