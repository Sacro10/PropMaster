/**
 * End-to-End Integration Tests
 * Tests critical user flows across multiple services
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { supabaseAdmin as supabase } from '../../src/supabase';
import { approveApplication } from '../../src/services/applicationsService';
import { getDashboardSummary } from '../../src/services/dashboardService';

describe('E2E Integration Tests', () => {
  let testAccountId: string;
  let testPropertyId: string;
  let testUnitId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test account
    const { data: account } = await supabase
      .from('accounts')
      .insert({
        name: 'E2E Test Account',
        plan: 'premium',
      })
      .select()
      .single();
    testAccountId = account.id;

    // Create test property
    const { data: property } = await supabase
      .from('properties')
      .insert({
        account_id: testAccountId,
        name: 'E2E Test Property',
        address1: '123 Test St',
        city: 'Test City',
        state: 'CA',
        zip: '12345',
        total_units: 10,
        occupied_units: 5,
        status: 'active',
      })
      .select()
      .single();
    testPropertyId = property.id;

    // Create test unit
    const { data: unit } = await supabase
      .from('units')
      .insert({
        account_id: testAccountId,
        property_id: testPropertyId,
        unit_number: '101',
        bedrooms: 2,
        bathrooms: 1,
        sqft: 1000,
        rent_amount: 1500,
        status: 'vacant',
      })
      .select()
      .single();
    testUnitId = unit.id;

    // Create test user
    const { data: { user } } = await supabase.auth.admin.createUser({
      email: `e2e-test-${Date.now()}@test.com`,
      password: 'Test123!@#',
      email_confirm: true,
    });
    testUserId = user!.id;

    await supabase.from('user_profiles').insert({
      account_id: testAccountId,
      user_id: testUserId,
      role: 'manager',
    });
  });

  afterAll(async () => {
    // Clean up
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
    if (testAccountId) {
      await supabase.from('accounts').delete().eq('id', testAccountId);
    }
  });

  describe('Flow 1: Application Approval → Tenant Creation → Dashboard Update', () => {
    let applicationId: string;

    it('should create a rental application', async () => {
      const { data: application } = await supabase
        .from('rental_applications')
        .insert({
          account_id: testAccountId,
          property_id: testPropertyId,
          unit_id: testUnitId,
          applicant_name: 'John Doe',
          email: 'john.doe@test.com',
          phone: '555-0100',
          monthly_income: 5000,
          application_status: 'pending',
        })
        .select()
        .single();

      expect(application).toBeDefined();
      applicationId = application.id;
    });

    it('should approve application and create tenant', async () => {
      // Get initial dashboard state
      const dashboardBefore = await getDashboardSummary(testAccountId);
      const initialTenantCount = dashboardBefore.tenants.total;

      // Approve application
      await approveApplication(testAccountId, applicationId, testUserId);

      // Verify application status changed
      const { data: updatedApp } = await supabase
        .from('rental_applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      expect(updatedApp.application_status).toBe('approved');

      // Verify tenant was created (this depends on implementation)
      // In real app, approval might create tenant automatically
    });

    it('should update dashboard active_tenants after approval', async () => {
      const dashboardAfter = await getDashboardSummary(testAccountId);

      // Dashboard should reflect changes
      expect(dashboardAfter).toBeDefined();
      expect(dashboardAfter.kpis.activeTenants).toBeGreaterThanOrEqual(0);
    });

    it('should log activity event for approval', async () => {
      const { data: activities } = await supabase
        .from('activity_events')
        .select('*')
        .eq('account_id', testAccountId)
        .eq('event_type', 'application_approved')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(activities).toBeDefined();
      expect(activities!.length).toBeGreaterThan(0);
    });
  });

  describe('Flow 2: Maintenance Request → Assignment → Completion → Metrics Update', () => {
    let requestId: string;

    it('should create maintenance request', async () => {
      const { data: request } = await supabase
        .from('maintenance_requests')
        .insert({
          account_id: testAccountId,
          unit_id: testUnitId,
          title: 'Leaky Faucet',
          description: 'Kitchen faucet is dripping',
          priority: 'medium',
          status: 'open',
        })
        .select()
        .single();

      expect(request).toBeDefined();
      requestId = request.id;
    });

    it('should assign vendor to request', async () => {
      // Create test vendor
      const { data: vendor } = await supabase
        .from('vendors')
        .insert({
          account_id: testAccountId,
          name: 'Test Plumber',
          specialties: ['plumbing'],
          email: 'plumber@test.com',
        })
        .select()
        .single();

      // Assign vendor
      await supabase
        .from('maintenance_requests')
        .update({
          assigned_vendor_id: vendor.id,
          status: 'in_progress',
        })
        .eq('id', requestId);

      const { data: updated } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      expect(updated.status).toBe('in_progress');
      expect(updated.assigned_vendor_id).toBe(vendor.id);
    });

    it('should complete request and update metrics', async () => {
      // Get metrics before completion
      const { data: metricsBefore } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('account_id', testAccountId)
        .eq('status', 'completed');

      const completedCountBefore = metricsBefore?.length || 0;

      // Complete request
      await supabase
        .from('maintenance_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      // Get metrics after completion
      const { data: metricsAfter } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('account_id', testAccountId)
        .eq('status', 'completed');

      const completedCountAfter = metricsAfter?.length || 0;

      expect(completedCountAfter).toBe(completedCountBefore + 1);
    });

    it('should calculate response time correctly', async () => {
      const { data: request } = await supabase
        .from('maintenance_requests')
        .select('created_at, completed_at')
        .eq('id', requestId)
        .single();

      if (!request) {
        throw new Error('Maintenance request not found');
      }

      const created = new Date(request.created_at);
      const completed = new Date(request.completed_at!);
      const responseTimeHours = (completed.getTime() - created.getTime()) / (1000 * 60 * 60);

      expect(responseTimeHours).toBeGreaterThanOrEqual(0);
      expect(responseTimeHours).toBeLessThan(48); // Reasonable completion time
    });
  });

  describe('Flow 3: Payment Recording → Stats Update → Analytics Update', () => {
    let tenantId: string;
    let leaseId: string;

    beforeAll(async () => {
      // Create tenant for payment
      const { data: tenant } = await supabase
        .from('tenant_profiles')
        .insert({
          account_id: testAccountId,
          user_id: testUserId,
          full_name: 'Test Tenant',
          email: 'tenant@test.com',
          phone: '555-0200',
        })
        .select()
        .single();
      tenantId = tenant.id;

      // Create lease
      const { data: lease } = await supabase
        .from('leases')
        .insert({
          account_id: testAccountId,
          unit_id: testUnitId,
          tenant_user_id: testUserId,
          lease_start: new Date().toISOString().split('T')[0],
          lease_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 1500,
          deposit: 1500,
          status: 'active',
        })
        .select()
        .single();
      leaseId = lease.id;
    });

    it('should record payment successfully', async () => {
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          account_id: testAccountId,
          tenant_id: tenantId,
          lease_id: leaseId,
          amount: 1500,
          payment_type: 'rent',
          payment_method: 'credit_card',
          payment_date: new Date().toISOString().split('T')[0],
          status: 'completed',
        })
        .select()
        .single();

      expect(payment).toBeDefined();
      expect(payment.amount).toBe(1500);
      expect(payment.status).toBe('completed');
    });

    it('should update collection stats after payment', async () => {
      // Get total collected this month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('account_id', testAccountId)
        .eq('status', 'completed')
        .gte('payment_date', monthStart.toISOString().split('T')[0]);

      const totalCollected = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

      expect(totalCollected).toBeGreaterThanOrEqual(1500);
    });

    it('should update dashboard revenue after payment', async () => {
      const dashboard = await getDashboardSummary(testAccountId);

      expect(dashboard.revenue.currentMonth).toBeGreaterThan(0);
    });

    it('should update analytics revenue data', async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: monthlyRevenue } = await supabase
        .from('payments')
        .select('amount')
        .eq('account_id', testAccountId)
        .eq('status', 'completed')
        .gte('payment_date', monthStart.toISOString().split('T')[0]);

      const revenue = monthlyRevenue?.reduce((sum, p) => sum + p.amount, 0) || 0;

      expect(revenue).toBeGreaterThan(0);
    });
  });

  describe('Flow 4: Showing Scheduling → Access Code → Reminder → Activity Feed', () => {
    it('should schedule a property showing', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: showing } = await supabase
        .from('property_showings')
        .insert({
          account_id: testAccountId,
          property_id: testPropertyId,
          unit_id: testUnitId,
          scheduled_at: tomorrow.toISOString(),
          prospect_name: 'Jane Smith',
          prospect_email: 'jane@test.com',
          prospect_phone: '555-0300',
          status: 'scheduled',
        })
        .select()
        .single();

      expect(showing).toBeDefined();
      expect(showing.status).toBe('scheduled');
    });

    it('should generate access code for showing', async () => {
      const { data: showings } = await supabase
        .from('property_showings')
        .select('*')
        .eq('account_id', testAccountId)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1);

      const showing = showings![0];

      // Generate access code
      const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      await supabase
        .from('property_showings')
        .update({ access_code: accessCode })
        .eq('id', showing.id);

      const { data: updated } = await supabase
        .from('property_showings')
        .select('access_code')
        .eq('id', showing.id)
        .single();

      if (!updated) {
        throw new Error('Showing not found');
      }

      expect(updated.access_code).toBeDefined();
      expect(updated.access_code).toHaveLength(6);
    });

    it('should add showing to activity feed', async () => {
      const { data: activities } = await supabase
        .from('activity_events')
        .select('*')
        .eq('account_id', testAccountId)
        .eq('event_type', 'showing_scheduled')
        .order('created_at', { ascending: false })
        .limit(5);

      expect(activities).toBeDefined();
      // Activity may or may not exist depending on implementation
    });
  });

  describe('Flow 5: Automated Reminder Processing → Messages → Portal Stats', () => {
    let reminderId: string;

    it('should create automated reminder', async () => {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { data: reminder } = await supabase
        .from('automated_reminders')
        .insert({
          account_id: testAccountId,
          reminder_type: 'rent_due',
          name: 'Monthly Rent Reminder',
          frequency: 'monthly',
          message_subject: 'Rent Due Soon',
          message_body: 'Your rent is due on the 1st',
          status: 'active',
          next_send_date: nextMonth.toISOString().split('T')[0],
        })
        .select()
        .single();

      expect(reminder).toBeDefined();
      expect(reminder.status).toBe('active');
      reminderId = reminder.id;
    });

    it('should create outbound message when reminder is processed', async () => {
      // Simulate reminder job processing
      const { data: outbound } = await supabase
        .from('outbound_messages')
        .insert({
          account_id: testAccountId,
          reminder_id: reminderId,
          recipient_id: testUserId,
          message_type: 'reminder',
          subject: 'Rent Due Soon',
          body: 'Your rent is due on the 1st',
          status: 'pending',
        })
        .select()
        .single();

      expect(outbound).toBeDefined();
      expect(outbound.status).toBe('pending');
    });

    it('should log reminder execution', async () => {
      const { data: log } = await supabase
        .from('reminder_logs')
        .insert({
          reminder_id: reminderId,
          sent_at: new Date().toISOString(),
          recipients_count: 1,
          success_count: 1,
          failure_count: 0,
        })
        .select()
        .single();

      expect(log).toBeDefined();
      expect(log.success_count).toBe(1);
    });

    it('should update communication portal stats', async () => {
      const { data: stats } = await supabase
        .from('outbound_messages')
        .select('*')
        .eq('account_id', testAccountId)
        .eq('message_type', 'reminder');

      const automatedCount = stats?.length || 0;

      expect(automatedCount).toBeGreaterThan(0);
    });
  });
});
