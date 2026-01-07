import { supabase } from './supabaseClient'
import type {
  AuthError,
  Session,
  User,
  AuthChangeEvent,
} from '@supabase/supabase-js'

/**
 * Auth Helper Module
 * Provides clean, typed interfaces for common authentication operations
 */

export interface AuthSession {
  session: Session | null
  user: User | null
  error: AuthError | null
}

export interface AuthResult {
  user: User | null
  error: AuthError | null
}

/**
 * Get the current authentication session
 * @returns Promise with session, user, and any error
 */
export async function getSession(): Promise<AuthSession> {
  try {
    const { data, error } = await supabase.auth.getSession()

    return {
      session: data.session,
      user: data.session?.user ?? null,
      error,
    }
  } catch (error) {
    return {
      session: null,
      user: null,
      error: error as AuthError,
    }
  }
}

/**
 * Sign in with email and password
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise with user and any error
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    return {
      user: data.user,
      error,
    }
  } catch (error) {
    return {
      user: null,
      error: error as AuthError,
    }
  }
}

/**
 * Sign up a new user with email and password
 * @param email - User's email address
 * @param password - User's password
 * @param options - Optional metadata and settings
 * @returns Promise with user and any error
 */
export async function signUp(
  email: string,
  password: string,
  options?: {
    data?: Record<string, any>
    emailRedirectTo?: string
  }
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options?.data,
        emailRedirectTo: options?.emailRedirectTo,
      },
    })

    return {
      user: data.user,
      error,
    }
  } catch (error) {
    return {
      user: null,
      error: error as AuthError,
    }
  }
}

/**
 * Sign out the current user
 * @returns Promise with any error that occurred
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.signOut()
    return { error }
  } catch (error) {
    return { error: error as AuthError }
  }
}

/**
 * Subscribe to authentication state changes
 * @param callback - Function to call when auth state changes
 * @returns Unsubscribe function to clean up the listener
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback)

  // Return unsubscribe function
  return () => {
    subscription.unsubscribe()
  }
}

/**
 * Get the current user (convenience method)
 * @returns Promise with current user or null
 */
export async function getCurrentUser(): Promise<User | null> {
  const { user } = await getSession()
  return user
}

/**
 * Check if user is authenticated
 * @returns Promise with boolean indicating auth status
 */
export async function isAuthenticated(): Promise<boolean> {
  const { session } = await getSession()
  return session !== null
}

/**
 * Send password reset email
 * @param email - User's email address
 * @returns Promise with any error
 */
export async function resetPassword(
  email: string
): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { error }
  } catch (error) {
    return { error: error as AuthError }
  }
}

/**
 * Update user password
 * @param newPassword - New password
 * @returns Promise with user and any error
 */
export async function updatePassword(
  newPassword: string
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    return {
      user: data.user,
      error,
    }
  } catch (error) {
    return {
      user: null,
      error: error as AuthError,
    }
  }
}

/**
 * Update user metadata
 * @param metadata - Object with user metadata to update
 * @returns Promise with user and any error
 */
export async function updateUserMetadata(
  metadata: Record<string, any>
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.updateUser({
      data: metadata,
    })

    return {
      user: data.user,
      error,
    }
  } catch (error) {
    return {
      user: null,
      error: error as AuthError,
    }
  }
}
