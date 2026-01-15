export { supabase, isSupabaseConfigured } from './supabaseClient'

// Database types (extend as needed)
export type SubscriptionTier = 'basic' | 'pro' | 'premium'

export interface UserProfile {
  id: string
  email: string
  full_name?: string | null
  phone?: string | null
  subscription_tier: SubscriptionTier
  stripe_customer_id?: string
  stripe_subscription_id?: string
  created_at: string
  updated_at: string
}
