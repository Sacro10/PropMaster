/**
 * Shared types for the data access layer
 * These types match the database schema
 */

export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Tenant types
export interface Tenant {
  id: string;
  account_id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  employer: string | null;
  employment_status: string | null;
  monthly_income: number | null;
  move_in_date: string | null;
  move_out_date: string | null;
  credit_score: number | null;
  background_check_status: string | null;
  ai_risk_score: number | null;
  screening_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantWithLease extends Tenant {
  lease: LeaseInfo | null;
  unit: UnitInfo | null;
  property: PropertyInfo | null;
}

export interface LeaseInfo {
  id: string;
  unit_id: string;
  lease_start: string;
  lease_end: string;
  rent: number;
  deposit: number;
  status: 'draft' | 'pending' | 'active' | 'expired' | 'terminated' | 'renewed';
  renewal_status: 'pending' | 'offered' | 'accepted' | 'declined';
}

export interface UnitInfo {
  id: string;
  property_id: string;
  unit_number: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  rent_amount: number;
  status: 'vacant' | 'occupied' | 'maintenance' | 'unavailable';
}

export interface PropertyInfo {
  id: string;
  name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
}

// Application types
export interface RentalApplication {
  id: string;
  account_id: string;
  unit_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  monthly_income: number | null;
  credit_score: number | null;
  employment_status: string | null;
  employer: string | null;
  background_check_status: string | null;
  ai_risk_score: number | null;
  application_status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  applied_at: string;
  reviewed_at: string | null;
  notes: string | null;
  unit?: UnitInfo;
  property?: PropertyInfo;
}

// Maintenance types
export interface MaintenanceRequest {
  id: string;
  account_id: string;
  unit_id: string;
  property_id: string;
  created_by_user_id: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'emergency';
  status: 'submitted' | 'reviewed' | 'assigned' | 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
  entry_allowed: boolean;
  estimated_cost: number | null;
  actual_cost: number | null;
  requested_at: string;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRequestWithDetails extends MaintenanceRequest {
  unit: UnitInfo;
  property: PropertyInfo;
  assignment: MaintenanceAssignment | null;
  tenant_name: string | null;
}

export interface MaintenanceAssignment {
  id: string;
  request_id: string;
  vendor_profile_id: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled';
  assigned_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  vendor?: VendorInfo | null;
}

export interface VendorInfo {
  id: string;
  business_name: string;
  phone: string;
  email: string;
  avg_rating: number;
  total_jobs_completed: number;
}

// Payment types
export interface Payment {
  id: string;
  account_id: string;
  lease_id: string;
  tenant_user_id: string;
  amount: number;
  payment_type: 'rent' | 'deposit' | 'late_fee' | 'pet_deposit' | 'utility' | 'other';
  payment_method: 'credit_card' | 'debit_card' | 'ach' | 'check' | 'cash' | 'other';
  payment_status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  payment_date: string;
  due_date: string | null;
  stripe_payment_intent_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentWithDetails extends Payment {
  tenant_name: string | null;
  unit: UnitInfo | null;
  property: PropertyInfo | null;
}

export interface OwnerDisbursement {
  id: string;
  account_id: string;
  owner_user_id: string;
  amount: number;
  disbursement_period_start: string;
  disbursement_period_end: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduled_date: string;
  disbursed_at: string | null;
  stripe_transfer_id: string | null;
  property_count: number | null;
  rent_collected: number | null;
  expenses: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Communication types
export interface Message {
  id: string;
  account_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  subject: string | null;
  body: string;
  parent_message_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageWithDetails extends Message {
  sender_name: string | null;
  recipient_name: string | null;
  reply_count: number;
}

export interface Notification {
  id: string;
  account_id: string;
  user_id: string;
  notification_type: 'rent_due' | 'lease_expiring' | 'maintenance' | 'payment' | 'message' | 'system' | 'other';
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  action_url: string | null;
  created_at: string;
}

// Showing types
export interface Showing {
  id: string;
  account_id: string;
  unit_id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone: string | null;
  showing_date: string;
  showing_type: 'self_guided' | 'agent_assisted' | 'virtual';
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  access_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowingWithDetails extends Showing {
  unit: UnitInfo;
  property: PropertyInfo;
}

// Analytics types
export interface AnalyticsMetrics {
  total_revenue: number;
  revenue_change: number;
  occupancy_rate: number;
  occupancy_change: number;
  avg_rent_per_unit: number;
  rent_change: number;
  noi_margin: number;
  noi_change: number;
}

export interface RevenueData {
  month: string;
  revenue: number;
}

export interface OccupancyData {
  month: string;
  rate: number;
}

export interface PropertyPerformance {
  property_id: string;
  name: string;
  revenue: number;
  occupancy: number;
  units: number;
}

export interface ExpenseBreakdown {
  name: string;
  value: number;
  color: string;
}

// HVAC Filter Program types
export interface HVACFilterSubscription {
  id: string;
  account_id: string;
  unit_id: string;
  filter_size: string;
  delivery_frequency_days: number;
  next_delivery_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HVACFilterDelivery {
  id: string;
  subscription_id: string;
  delivery_date: string;
  status: 'scheduled' | 'shipped' | 'delivered' | 'cancelled';
  tracking_number: string | null;
  delivered_at: string | null;
  created_at: string;
}
