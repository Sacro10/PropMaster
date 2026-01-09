/**
 * Background Jobs System
 *
 * This module provides a simple cron-based job scheduler for recurring tasks.
 * Jobs run on a configurable interval and handle tasks like:
 * - Sending scheduled reminders
 * - Processing HVAC deliveries
 * - Generating reports
 * - Cleaning up old data
 */

import { supabaseAdmin as supabase } from '../supabase';

export interface Job {
  name: string;
  interval: number; // milliseconds
  handler: () => Promise<void>;
  enabled: boolean;
}

const jobs: Job[] = [];
const runningIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Register a new job
 */
export function registerJob(job: Job): void {
  jobs.push(job);
  console.log(`📋 Registered job: ${job.name} (interval: ${job.interval}ms)`);
}

/**
 * Start all enabled jobs
 */
export function startJobs(): void {
  console.log('🚀 Starting background jobs...');

  for (const job of jobs) {
    if (job.enabled) {
      startJob(job);
    }
  }

  console.log(`✅ Started ${runningIntervals.size} background jobs`);
}

/**
 * Start a specific job
 */
function startJob(job: Job): void {
  if (runningIntervals.has(job.name)) {
    console.log(`⚠️  Job ${job.name} is already running`);
    return;
  }

  // Run immediately
  runJob(job);

  // Schedule recurring runs
  const interval = setInterval(() => {
    runJob(job);
  }, job.interval);

  runningIntervals.set(job.name, interval);
  console.log(`▶️  Started job: ${job.name}`);
}

/**
 * Run a job once
 */
async function runJob(job: Job): Promise<void> {
  try {
    console.log(`🔄 Running job: ${job.name}`);
    await job.handler();
    console.log(`✅ Completed job: ${job.name}`);
  } catch (error) {
    console.error(`❌ Job ${job.name} failed:`, error);
  }
}

/**
 * Stop all jobs
 */
export function stopJobs(): void {
  console.log('🛑 Stopping background jobs...');

  for (const [name, interval] of runningIntervals.entries()) {
    clearInterval(interval);
    console.log(`⏹️  Stopped job: ${name}`);
  }

  runningIntervals.clear();
  console.log('✅ All jobs stopped');
}

/**
 * Stop a specific job
 */
export function stopJob(name: string): void {
  const interval = runningIntervals.get(name);
  if (interval) {
    clearInterval(interval);
    runningIntervals.delete(name);
    console.log(`⏹️  Stopped job: ${name}`);
  }
}

// ============================================================================
// Job Handlers
// ============================================================================

/**
 * Process scheduled reminders
 */
async function processReminders(): Promise<void> {
  const now = new Date().toISOString();

  // Get all active reminder schedules that are due
  const { data: schedules, error } = await supabase
    .from('reminder_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now);

  if (error) throw error;

  if (!schedules || schedules.length === 0) {
    console.log('  No reminders due');
    return;
  }

  console.log(`  Processing ${schedules.length} reminder schedules`);

  for (const schedule of schedules) {
    try {
      // Create reminder run record
      const { data: run, error: runError } = await supabase
        .from('reminder_runs')
        .insert({
          account_id: schedule.account_id,
          schedule_id: schedule.id,
          run_at: now,
          status: 'running',
        })
        .select()
        .single();

      if (runError) throw runError;

      // In a real implementation, this would:
      // 1. Query recipients based on recipient_filter
      // 2. Load the message template
      // 3. Send emails/SMS to recipients
      // 4. Track success/failure counts

      // For now, just mark as completed
      await supabase
        .from('reminder_runs')
        .update({
          status: 'completed',
          recipients_count: 0,
          sent_count: 0,
          failed_count: 0,
        })
        .eq('id', run.id);

      // Calculate next run time
      const nextRun = new Date(schedule.next_run_at);
      if (schedule.frequency === 'daily') {
        nextRun.setDate(nextRun.getDate() + 1);
      } else if (schedule.frequency === 'weekly') {
        nextRun.setDate(nextRun.getDate() + 7);
      } else if (schedule.frequency === 'monthly') {
        nextRun.setMonth(nextRun.getMonth() + 1);
      } else if (schedule.frequency === 'quarterly') {
        nextRun.setMonth(nextRun.getMonth() + 3);
      }

      // Update schedule with next run time
      await supabase
        .from('reminder_schedules')
        .update({
          last_run_at: now,
          next_run_at: nextRun.toISOString(),
        })
        .eq('id', schedule.id);

      console.log(`  ✓ Processed reminder: ${schedule.name}`);
    } catch (error) {
      console.error(`  ✗ Failed to process reminder ${schedule.name}:`, error);
    }
  }
}

/**
 * Process HVAC deliveries
 */
async function processHVACDeliveries(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Get all pending delivery batches scheduled for today or earlier
  const { data: batches, error } = await supabase
    .from('hvac_delivery_batches')
    .select('*')
    .eq('status', 'pending')
    .lte('delivery_date', today);

  if (error) throw error;

  if (!batches || batches.length === 0) {
    console.log('  No HVAC deliveries due');
    return;
  }

  console.log(`  Processing ${batches.length} HVAC delivery batches`);

  for (const batch of batches) {
    try {
      // In a real implementation, this would:
      // 1. Generate shipping labels
      // 2. Create tracking numbers
      // 3. Update delivery schedules
      // 4. Send notifications to tenants

      // For now, just mark batch as in progress
      await supabase
        .from('hvac_delivery_batches')
        .update({ status: 'in_progress' })
        .eq('id', batch.id);

      console.log(`  ✓ Started processing batch: ${batch.batch_number}`);
    } catch (error) {
      console.error(`  ✗ Failed to process batch ${batch.batch_number}:`, error);
    }
  }
}

/**
 * Clean up old activity events (older than 90 days)
 */
async function cleanupOldActivityEvents(): Promise<void> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { error, count } = await supabase
    .from('activity_events')
    .delete({ count: 'exact' })
    .lt('created_at', ninetyDaysAgo.toISOString());

  if (error) throw error;

  console.log(`  Deleted ${count} old activity events`);
}

/**
 * Update property occupancy stats
 */
async function updatePropertyStats(): Promise<void> {
  // Get all properties
  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, account_id');

  if (error) throw error;

  if (!properties || properties.length === 0) {
    console.log('  No properties to update');
    return;
  }

  console.log(`  Updating stats for ${properties.length} properties`);

  for (const property of properties) {
    try {
      // Count total units
      const { count: totalUnits } = await supabase
        .from('units')
        .select('*', { count: 'exact', head: true })
        .eq('property_id', property.id);

      // Count occupied units (units with active tenants)
      const { count: occupiedUnits } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .in(
          'unit_id',
          (
            await supabase
              .from('units')
              .select('id')
              .eq('property_id', property.id)
          ).data?.map((u) => u.id) || []
        );

      // Update property stats
      await supabase
        .from('properties')
        .update({
          total_units: totalUnits || 0,
          occupied_units: occupiedUnits || 0,
        })
        .eq('id', property.id);
    } catch (error) {
      console.error(`  ✗ Failed to update property ${property.id}:`, error);
    }
  }

  console.log('  ✓ Property stats updated');
}

// ============================================================================
// Register Jobs
// ============================================================================

import { accessCodeExpirationJob } from './accessCodeExpirationJob';
import { processReminders as processAutomatedReminders } from './remindersJob';

// Process automated reminders every 5 minutes
registerJob({
  name: 'process-automated-reminders',
  interval: 5 * 60 * 1000, // 5 minutes
  handler: processAutomatedReminders,
  enabled: true,
});

// Process legacy reminders every 5 minutes
registerJob({
  name: 'process-reminders',
  interval: 5 * 60 * 1000, // 5 minutes
  handler: processReminders,
  enabled: true,
});

// Process HVAC deliveries every hour
registerJob({
  name: 'process-hvac-deliveries',
  interval: 60 * 60 * 1000, // 1 hour
  handler: processHVACDeliveries,
  enabled: true,
});

// Clean up old activity events once per day
registerJob({
  name: 'cleanup-old-events',
  interval: 24 * 60 * 60 * 1000, // 24 hours
  handler: cleanupOldActivityEvents,
  enabled: true,
});

// Update property stats every 15 minutes
registerJob({
  name: 'update-property-stats',
  interval: 15 * 60 * 1000, // 15 minutes
  handler: updatePropertyStats,
  enabled: true,
});

// Expire old access codes every 5 minutes
registerJob(accessCodeExpirationJob);
