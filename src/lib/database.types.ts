/**
 * Database Types
 *
 * This file contains TypeScript types for your Supabase database.
 *
 * To generate types automatically from your database schema:
 * 1. Install Supabase CLI: npm install -g supabase
 * 2. Login: supabase login
 * 3. Generate types: supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
 *
 * For now, this contains basic types that you can extend as you build your schema.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SubscriptionTier = 'basic' | 'pro' | 'premium'

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string
          subscription_tier: SubscriptionTier
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          subscription_tier?: SubscriptionTier
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          subscription_tier?: SubscriptionTier
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          id: string
          user_id: string
          name: string
          address: string
          units: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          address: string
          units?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          address?: string
          units?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          id: string
          user_id: string
          property_id: string | null
          name: string
          email: string | null
          phone: string | null
          unit: string | null
          move_in_date: string | null
          lease_end_date: string | null
          monthly_rent: number | null
          status: string
          ai_risk_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          property_id?: string | null
          name: string
          email?: string | null
          phone?: string | null
          unit?: string | null
          move_in_date?: string | null
          lease_end_date?: string | null
          monthly_rent?: number | null
          status?: string
          ai_risk_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          property_id?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          unit?: string | null
          move_in_date?: string | null
          lease_end_date?: string | null
          monthly_rent?: number | null
          status?: string
          ai_risk_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_requests: {
        Row: {
          id: string
          user_id: string
          property_id: string | null
          tenant_id: string | null
          title: string
          description: string | null
          status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          priority: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          property_id?: string | null
          tenant_id?: string | null
          title: string
          description?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          priority?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          property_id?: string | null
          tenant_id?: string | null
          title?: string
          description?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          priority?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rent_payments: {
        Row: {
          id: string
          user_id: string
          tenant_id: string
          amount: number
          due_date: string
          paid_date: string | null
          status: 'pending' | 'paid' | 'overdue' | 'cancelled'
          stripe_payment_intent_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id: string
          amount: number
          due_date: string
          paid_date?: string | null
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled'
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string
          amount?: number
          due_date?: string
          paid_date?: string | null
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled'
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      showings: {
        Row: {
          id: string
          user_id: string
          property_id: string | null
          applicant_name: string
          applicant_email: string | null
          applicant_phone: string | null
          scheduled_date: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          property_id?: string | null
          applicant_name: string
          applicant_email?: string | null
          applicant_phone?: string | null
          scheduled_date: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          property_id?: string | null
          applicant_name?: string
          applicant_email?: string | null
          applicant_phone?: string | null
          scheduled_date?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          user_id: string
          tenant_id: string | null
          subject: string | null
          content: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id?: string | null
          subject?: string | null
          content: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string | null
          subject?: string | null
          content?: string
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      subscription_tier: SubscriptionTier
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for easier querying
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type Property = Database['public']['Tables']['properties']['Row']
export type Tenant = Database['public']['Tables']['tenants']['Row']
export type MaintenanceRequest = Database['public']['Tables']['maintenance_requests']['Row']
export type RentPayment = Database['public']['Tables']['rent_payments']['Row']
export type Showing = Database['public']['Tables']['showings']['Row']
export type Message = Database['public']['Tables']['messages']['Row']

// Insert types (for creating new records)
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert']
export type PropertyInsert = Database['public']['Tables']['properties']['Insert']
export type TenantInsert = Database['public']['Tables']['tenants']['Insert']
export type MaintenanceRequestInsert = Database['public']['Tables']['maintenance_requests']['Insert']
export type RentPaymentInsert = Database['public']['Tables']['rent_payments']['Insert']
export type ShowingInsert = Database['public']['Tables']['showings']['Insert']
export type MessageInsert = Database['public']['Tables']['messages']['Insert']

// Update types (for updating existing records)
export type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update']
export type PropertyUpdate = Database['public']['Tables']['properties']['Update']
export type TenantUpdate = Database['public']['Tables']['tenants']['Update']
export type MaintenanceRequestUpdate = Database['public']['Tables']['maintenance_requests']['Update']
export type RentPaymentUpdate = Database['public']['Tables']['rent_payments']['Update']
export type ShowingUpdate = Database['public']['Tables']['showings']['Update']
export type MessageUpdate = Database['public']['Tables']['messages']['Update']
