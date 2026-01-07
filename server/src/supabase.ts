import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export interface Account {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  plan: 'basic' | 'pro' | 'premium';
  max_properties: number;
  max_units: number;
  created_at: string;
  updated_at: string;
}
