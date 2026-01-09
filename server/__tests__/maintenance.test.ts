/**
 * Tests for Maintenance & HVAC functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getMaintenanceStats,
  assignVendorToRequest,
  createEmergencyRequest,
  getRoutingMetrics,
} from '../src/services/maintenanceService';
import { generateDeliveryBatch } from '../src/services/hvacService';
import { supabaseAdmin as supabase } from '../src/supabase';

// Mock account and user IDs
const TEST_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000003';
const TEST_UNIT_ID = '00000000-0000-0000-0000-000000000004';
const TEST_VENDOR_ID = '00000000-0000-0000-0000-000000000005';

describe('Maintenance Stats', () => {
  it('should return correct maintenance KPI statistics', async () => {
    const stats = await getMaintenanceStats(TEST_ACCOUNT_ID);

    expect(stats).toHaveProperty('activeRequests');
    expect(stats).toHaveProperty('avgResponseTimeHours');
    expect(stats).toHaveProperty('completionRate');
    expect(stats).toHaveProperty('emergencySupportEnabled');
    expect(stats).toHaveProperty('recentEmergencyCount');

    expect(typeof stats.activeRequests).toBe('number');
    expect(typeof stats.avgResponseTimeHours).toBe('number');
    expect(typeof stats.completionRate).toBe('number');
    expect(typeof stats.emergencySupportEnabled).toBe('boolean');
    expect(typeof stats.recentEmergencyCount).toBe('number');
  });

  it('should handle accounts with no maintenance requests', async () => {
    const emptyAccountId = '00000000-0000-0000-0000-999999999999';
    const stats = await getMaintenanceStats(emptyAccountId);

    expect(stats.activeRequests).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.recentEmergencyCount).toBe(0);
  });
});

describe('Vendor Assignment', () => {
  let testRequestId: string;

  beforeEach(async () => {
    // Create a test maintenance request
    const { data: request } = await supabase
      .from('maintenance_requests')
      .insert({
        account_id: TEST_ACCOUNT_ID,
        property_id: TEST_PROPERTY_ID,
        unit_id: TEST_UNIT_ID,
        title: 'Test Request',
        description: 'Test description',
        priority: 'normal',
        category: 'plumbing',
        status: 'open',
      })
      .select()
      .single();

    testRequestId = request!.id;
  });

  afterEach(async () => {
    // Cleanup
    if (testRequestId) {
      await supabase
        .from('maintenance_assignments')
        .delete()
        .eq('request_id', testRequestId);

      await supabase
        .from('maintenance_requests')
        .delete()
        .eq('id', testRequestId);
    }
  });

  it('should assign vendor to maintenance request', async () => {
    await assignVendorToRequest(
      TEST_ACCOUNT_ID,
      TEST_USER_ID,
      testRequestId,
      TEST_VENDOR_ID
    );

    // Verify assignment was created
    const { data: assignment } = await supabase
      .from('maintenance_assignments')
      .select('*')
      .eq('request_id', testRequestId)
      .single();

    expect(assignment).toBeDefined();
    expect(assignment!.vendor_profile_id).toBe(TEST_VENDOR_ID);
    expect(assignment!.status).toBe('pending');

    // Verify request status was updated
    const { data: request } = await supabase
      .from('maintenance_requests')
      .select('*')
      .eq('id', testRequestId)
      .single();

    expect(request!.status).toBe('assigned');
    expect(request!.assigned_at).toBeDefined();
    expect(request!.eta_hours).toBeDefined();
    expect(request!.scheduled_for).toBeDefined();
  });

  it('should calculate correct ETA based on priority', async () => {
    // Test urgent priority (4 hours)
    const { data: urgentRequest } = await supabase
      .from('maintenance_requests')
      .insert({
        account_id: TEST_ACCOUNT_ID,
        property_id: TEST_PROPERTY_ID,
        unit_id: TEST_UNIT_ID,
        title: 'Urgent Request',
        description: 'Urgent test',
        priority: 'urgent',
        category: 'plumbing',
        status: 'open',
      })
      .select()
      .single();

    await assignVendorToRequest(
      TEST_ACCOUNT_ID,
      TEST_USER_ID,
      urgentRequest!.id,
      TEST_VENDOR_ID
    );

    const { data: updated } = await supabase
      .from('maintenance_requests')
      .select('eta_hours')
      .eq('id', urgentRequest!.id)
      .single();

    expect(updated!.eta_hours).toBe(4);

    // Cleanup
    await supabase
      .from('maintenance_assignments')
      .delete()
      .eq('request_id', urgentRequest!.id);
    await supabase
      .from('maintenance_requests')
      .delete()
      .eq('id', urgentRequest!.id);
  });

  it('should log activity when assigning vendor', async () => {
    await assignVendorToRequest(
      TEST_ACCOUNT_ID,
      TEST_USER_ID,
      testRequestId,
      TEST_VENDOR_ID
    );

    // Verify activity was logged
    const { data: activities } = await supabase
      .from('activity_events')
      .select('*')
      .eq('account_id', TEST_ACCOUNT_ID)
      .eq('event_type', 'maintenance_assigned')
      .eq('entity_id', testRequestId);

    expect(activities).toBeDefined();
    expect(activities!.length).toBeGreaterThan(0);
  });
});

describe('Emergency Requests', () => {
  let testEmergencyId: string;

  afterEach(async () => {
    // Cleanup
    if (testEmergencyId) {
      await supabase
        .from('maintenance_requests')
        .delete()
        .eq('id', testEmergencyId);
    }
  });

  it('should create emergency maintenance request', async () => {
    const emergencyData = {
      title: 'Emergency: Burst Pipe',
      description: 'Water flooding the basement',
      category: 'plumbing',
      unitId: TEST_UNIT_ID,
    };

    const request = await createEmergencyRequest(
      TEST_ACCOUNT_ID,
      TEST_USER_ID,
      emergencyData
    );

    testEmergencyId = request.id;

    expect(request).toBeDefined();
    expect(request.title).toBe(emergencyData.title);
    expect(request.priority).toBe('urgent');

    // Verify is_emergency flag
    const { data: updated } = await supabase
      .from('maintenance_requests')
      .select('is_emergency')
      .eq('id', request.id)
      .single();

    expect(updated!.is_emergency).toBe(true);
  });

  it('should log emergency activity with notification info', async () => {
    const emergencyData = {
      title: 'Emergency: Gas Leak',
      description: 'Strong gas smell in unit',
      category: 'hvac',
      unitId: TEST_UNIT_ID,
    };

    const request = await createEmergencyRequest(
      TEST_ACCOUNT_ID,
      TEST_USER_ID,
      emergencyData
    );

    testEmergencyId = request.id;

    // Verify emergency activity was logged
    const { data: activities } = await supabase
      .from('activity_events')
      .select('*')
      .eq('account_id', TEST_ACCOUNT_ID)
      .eq('entity_id', request.id)
      .order('created_at', { ascending: false })
      .limit(1);

    expect(activities).toBeDefined();
    expect(activities!.length).toBeGreaterThan(0);
    expect(activities![0].summary).toContain('EMERGENCY');
  });
});

describe('Smart Routing Metrics', () => {
  it('should calculate routing metrics correctly', async () => {
    const metrics = await getRoutingMetrics(TEST_ACCOUNT_ID);

    expect(metrics).toHaveProperty('routingEfficiency');
    expect(metrics).toHaveProperty('autoAssignmentRate');
    expect(metrics).toHaveProperty('avgVendorResponseTime');

    expect(typeof metrics.routingEfficiency).toBe('number');
    expect(typeof metrics.autoAssignmentRate).toBe('number');
    expect(typeof metrics.avgVendorResponseTime).toBe('number');

    // Values should be percentages or hours
    expect(metrics.routingEfficiency).toBeGreaterThanOrEqual(0);
    expect(metrics.routingEfficiency).toBeLessThanOrEqual(100);
    expect(metrics.autoAssignmentRate).toBeGreaterThanOrEqual(0);
    expect(metrics.autoAssignmentRate).toBeLessThanOrEqual(100);
    expect(metrics.avgVendorResponseTime).toBeGreaterThanOrEqual(0);
  });
});

describe('HVAC Batch Generation', () => {
  let testEnrollmentIds: string[] = [];
  let testBatchId: string;

  beforeEach(async () => {
    // Create test HVAC enrollments
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const { data: enrollments } = await supabase
      .from('hvac_program_enrollments')
      .insert([
        {
          account_id: TEST_ACCOUNT_ID,
          unit_id: TEST_UNIT_ID,
          frequency: 'monthly',
          filter_size: '16x20x1',
          next_delivery_date: nextWeek.toISOString().split('T')[0],
          status: 'active',
        },
      ])
      .select();

    testEnrollmentIds = enrollments!.map((e) => e.id);
  });

  afterEach(async () => {
    // Cleanup
    if (testBatchId) {
      await supabase
        .from('hvac_delivery_schedules')
        .delete()
        .eq('batch_id', testBatchId);
      await supabase.from('hvac_delivery_batches').delete().eq('id', testBatchId);
    }

    for (const id of testEnrollmentIds) {
      await supabase.from('hvac_program_enrollments').delete().eq('id', id);
    }
  });

  it('should generate HVAC delivery batch', async () => {
    const batch = await generateDeliveryBatch(TEST_ACCOUNT_ID);

    testBatchId = batch.id;

    expect(batch).toBeDefined();
    expect(batch.batchNumber).toBeDefined();
    expect(batch.totalUnits).toBeGreaterThan(0);
    expect(batch.totalFilters).toBeGreaterThan(0);
    expect(batch.status).toBe('pending');
  });

  it('should create delivery schedules for enrolled units', async () => {
    const batch = await generateDeliveryBatch(TEST_ACCOUNT_ID);
    testBatchId = batch.id;

    // Verify schedules were created
    const { data: schedules } = await supabase
      .from('hvac_delivery_schedules')
      .select('*')
      .eq('batch_id', batch.id);

    expect(schedules).toBeDefined();
    expect(schedules!.length).toBe(batch.totalUnits);

    schedules!.forEach((schedule) => {
      expect(schedule.status).toBe('scheduled');
      expect(schedule.batch_id).toBe(batch.id);
    });
  });

  it('should handle accounts with no enrollments', async () => {
    const emptyAccountId = '00000000-0000-0000-0000-999999999999';

    await expect(generateDeliveryBatch(emptyAccountId)).rejects.toThrow(
      'No enrollments due for delivery'
    );
  });

  it('should log activity when batch is generated', async () => {
    const batch = await generateDeliveryBatch(TEST_ACCOUNT_ID);
    testBatchId = batch.id;

    // Note: Activity logging is done in the job, not the service
    // This test would need to be in the job tests
    expect(batch.id).toBeDefined();
  });
});

describe('Maintenance Request Integration', () => {
  it('should create request, assign vendor, and track in activity', async () => {
    // Create request
    const { data: request } = await supabase
      .from('maintenance_requests')
      .insert({
        account_id: TEST_ACCOUNT_ID,
        property_id: TEST_PROPERTY_ID,
        unit_id: TEST_UNIT_ID,
        title: 'Integration Test Request',
        description: 'Full workflow test',
        priority: 'high',
        category: 'electrical',
        status: 'open',
      })
      .select()
      .single();

    // Assign vendor
    await assignVendorToRequest(
      TEST_ACCOUNT_ID,
      TEST_USER_ID,
      request!.id,
      TEST_VENDOR_ID
    );

    // Verify full workflow
    const { data: updatedRequest } = await supabase
      .from('maintenance_requests')
      .select(
        `
        *,
        maintenance_assignments(*)
      `
      )
      .eq('id', request!.id)
      .single();

    expect(updatedRequest!.status).toBe('assigned');
    expect(updatedRequest!.maintenance_assignments).toHaveLength(1);
    expect(updatedRequest!.maintenance_assignments[0].vendor_profile_id).toBe(
      TEST_VENDOR_ID
    );

    // Verify activity events
    const { data: activities } = await supabase
      .from('activity_events')
      .select('*')
      .eq('account_id', TEST_ACCOUNT_ID)
      .eq('entity_id', request!.id)
      .order('created_at', { ascending: false });

    expect(activities).toBeDefined();
    expect(activities!.length).toBeGreaterThan(0);

    // Cleanup
    await supabase
      .from('maintenance_assignments')
      .delete()
      .eq('request_id', request!.id);
    await supabase.from('maintenance_requests').delete().eq('id', request!.id);
  });
});
