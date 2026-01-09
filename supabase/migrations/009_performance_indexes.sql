-- Performance Optimization Migration
-- Adds indexes for frequently queried columns across all tables

-- Payments table - for collection stats and revenue queries
CREATE INDEX IF NOT EXISTS idx_payments_account_date ON payments(account_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(account_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id, payment_date DESC);

-- Maintenance requests - for dashboard and metrics
CREATE INDEX IF NOT EXISTS idx_maintenance_account_status ON maintenance_requests(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON maintenance_requests(account_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_unit ON maintenance_requests(unit_id, status);

-- Leases - for tenant and occupancy queries
CREATE INDEX IF NOT EXISTS idx_leases_account_status ON leases(account_id, status, lease_start DESC);
CREATE INDEX IF NOT EXISTS idx_leases_dates ON leases(account_id, lease_end) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id, status);

-- Rental applications - for screening and approval workflows
CREATE INDEX IF NOT EXISTS idx_applications_account_status ON rental_applications(account_id, application_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_reviewed ON rental_applications(account_id, reviewed_at DESC) WHERE reviewed_at IS NOT NULL;

-- Messages - for communication portal
CREATE INDEX IF NOT EXISTS idx_messages_account_created ON messages(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, is_read) WHERE is_read = FALSE;

-- Conversations - for communication stats
CREATE INDEX IF NOT EXISTS idx_conversations_account_status ON conversations(account_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(account_id) WHERE participant_1_id IS NOT NULL AND participant_2_id IS NOT NULL;

-- Property showings - for scheduling and stats
CREATE INDEX IF NOT EXISTS idx_showings_account_date ON property_showings(account_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_showings_status ON property_showings(account_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_showings_property ON property_showings(property_id, scheduled_at DESC);

-- Activity events - for recent activity feed
CREATE INDEX IF NOT EXISTS idx_activity_account_created ON activity_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(account_id, event_type, created_at DESC);

-- Owner disbursements - for rent collection
CREATE INDEX IF NOT EXISTS idx_disbursements_account_status ON owner_disbursements(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disbursements_scheduled ON owner_disbursements(account_id, scheduled_date) WHERE status = 'pending';

-- Automated reminders - for background job efficiency
CREATE INDEX IF NOT EXISTS idx_reminders_next_send ON automated_reminders(account_id, next_send_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_reminders_type ON automated_reminders(account_id, reminder_type, status);

-- Outbound messages - for automation tracking
CREATE INDEX IF NOT EXISTS idx_outbound_account_created ON outbound_messages(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_messages(account_id, status);

-- Tenant profiles - for screening and metrics
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_account ON tenant_profiles(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_screening ON tenant_profiles(account_id, background_check_status);

-- HVAC maintenance - for filter program
CREATE INDEX IF NOT EXISTS idx_hvac_account_next ON hvac_filter_maintenance(account_id, next_delivery_date);
CREATE INDEX IF NOT EXISTS idx_hvac_unit ON hvac_filter_maintenance(unit_id, next_delivery_date);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_payments_revenue_query ON payments(account_id, payment_date, status, amount) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_leases_occupancy_query ON leases(account_id, unit_id, status, lease_start, lease_end);
CREATE INDEX IF NOT EXISTS idx_maintenance_metrics_query ON maintenance_requests(account_id, status, priority, created_at, completed_at);

-- Add comments for documentation
COMMENT ON INDEX idx_payments_account_date IS 'Optimizes payment history and revenue queries';
COMMENT ON INDEX idx_maintenance_account_status IS 'Optimizes maintenance dashboard and metrics';
COMMENT ON INDEX idx_leases_account_status IS 'Optimizes tenant and occupancy queries';
COMMENT ON INDEX idx_messages_conversation IS 'Optimizes conversation thread loading';
COMMENT ON INDEX idx_activity_account_created IS 'Optimizes recent activity feed';
COMMENT ON INDEX idx_reminders_next_send IS 'Optimizes reminder job processing';
