/**
 * Supabase Library Exports
 *
 * This barrel file exports everything you need from the Supabase integration.
 * Import from here for convenience:
 *
 * import { supabase, signInWithPassword, signOut } from '@/lib'
 */

// Supabase client
export { supabase } from './supabaseClient'

// Auth helpers
export {
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
} from './auth'

// Type exports
export type {
  Database,
  UserProfile,
  Property,
  Tenant,
  MaintenanceRequest,
  RentPayment,
  Showing,
  Message,
  UserProfileInsert,
  PropertyInsert,
  TenantInsert,
  MaintenanceRequestInsert,
  RentPaymentInsert,
  ShowingInsert,
  MessageInsert,
  UserProfileUpdate,
  PropertyUpdate,
  TenantUpdate,
  MaintenanceRequestUpdate,
  RentPaymentUpdate,
  ShowingUpdate,
  MessageUpdate,
  SubscriptionTier,
} from './database.types'

// Re-export common Supabase types
export type {
  User,
  Session,
  AuthError,
  AuthChangeEvent,
} from '@supabase/supabase-js'
