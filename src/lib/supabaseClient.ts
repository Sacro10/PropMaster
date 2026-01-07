import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const missingEnvVars: string[] = []
if (!supabaseUrl) missingEnvVars.push('VITE_SUPABASE_URL')
if (!supabaseAnonKey) missingEnvVars.push('VITE_SUPABASE_ANON_KEY')

const missingSupabaseMessage =
  missingEnvVars.length === 0
    ? ''
    : `Missing ${missingEnvVars.join(' and ')} environment variable${missingEnvVars.length > 1 ? 's' : ''}. Please check your .env file.`

export const isSupabaseConfigured = missingEnvVars.length === 0

const createMissingClient = () =>
  new Proxy({} as SupabaseClient<Database>, {
    get() {
      throw new Error(missingSupabaseMessage)
    },
  })

// Create Supabase client with optimal configuration
export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        flowType: 'pkce', // More secure auth flow
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'property-management-app',
        },
      },
    })
  : createMissingClient()
