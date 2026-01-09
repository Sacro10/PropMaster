/**
 * HVAC Filter Batch Generation Job
 * Runs monthly to generate delivery batches for enrolled units
 */

import { supabase } from '../supabase';
import { logActivityEvent } from '../services/activityService';
import { generateDeliveryBatch } from '../services/hvacService';

/**
 * Process HVAC batch generation for an account
 */
async function processAccountHVACBatch(accountId: string): Promise<void> {
  try {
    console.log(`[HVAC Batch Job] Processing account ${accountId}`);

    // Check if there are enrollments due for delivery
    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('hvac_program_enrollments')
      .select('id, unit_id, next_delivery_date')
      .eq('account_id', accountId)
      .eq('status', 'active')
      .lte('next_delivery_date', thirtyDaysFromNow.toISOString().split('T')[0]);

    if (enrollmentsError) {
      throw enrollmentsError;
    }

    if (!enrollments || enrollments.length === 0) {
      console.log(`[HVAC Batch Job] No enrollments due for account ${accountId}`);
      return;
    }

    console.log(
      `[HVAC Batch Job] Found ${enrollments.length} enrollments due for delivery`
    );

    // Generate batch
    const batch = await generateDeliveryBatch(accountId);

    console.log(
      `[HVAC Batch Job] Generated batch ${batch.batchNumber} with ${batch.totalFilters} filters`
    );

    // Update next delivery dates for enrollments
    const updatePromises = enrollments.map(async (enrollment) => {
      const nextDate = new Date(enrollment.next_delivery_date);
      nextDate.setMonth(nextDate.getMonth() + 1); // Default monthly frequency

      return supabase
        .from('hvac_program_enrollments')
        .update({
          next_delivery_date: nextDate.toISOString().split('T')[0],
        })
        .eq('id', enrollment.id);
    });

    await Promise.all(updatePromises);

    // Log activity
    await logActivityEvent(
      accountId,
      null,
      'hvac_delivery_scheduled',
      `HVAC filter batch generated: ${batch.totalFilters} filters for ${batch.totalUnits} units`,
      {
        entityType: 'hvac_delivery_batch',
        entityId: batch.id,
        metadata: {
          batchNumber: batch.batchNumber,
          totalUnits: batch.totalUnits,
          totalFilters: batch.totalFilters,
        },
      }
    );
  } catch (error) {
    console.error(
      `[HVAC Batch Job] Error processing account ${accountId}:`,
      error
    );
    throw error;
  }
}

/**
 * Main job function - processes all accounts
 */
export async function runHVACBatchJob(): Promise<void> {
  try {
    console.log('[HVAC Batch Job] Starting monthly HVAC batch generation');

    // Get all accounts with active HVAC enrollments
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('status', 'active');

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      console.log('[HVAC Batch Job] No active accounts found');
      return;
    }

    console.log(`[HVAC Batch Job] Processing ${accounts.length} accounts`);

    // Process each account
    for (const account of accounts) {
      try {
        await processAccountHVACBatch(account.id);
      } catch (error) {
        console.error(
          `[HVAC Batch Job] Failed to process account ${account.id}:`,
          error
        );
        // Continue with next account even if one fails
      }
    }

    console.log('[HVAC Batch Job] Completed monthly HVAC batch generation');
  } catch (error) {
    console.error('[HVAC Batch Job] Fatal error:', error);
    throw error;
  }
}

/**
 * Schedule the job to run monthly
 * In production, this would be triggered by a cron job or scheduler
 */
export function scheduleHVACBatchJob(): void {
  // Run on the 1st of every month at 2 AM
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const checkAndRun = () => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 2) {
      runHVACBatchJob().catch((error) => {
        console.error('[HVAC Batch Job] Scheduled job failed:', error);
      });
    }
  };

  // Check every hour
  setInterval(checkAndRun, 60 * 60 * 1000);

  console.log('[HVAC Batch Job] Scheduler initialized');
}

/**
 * Manual trigger for testing
 */
export async function triggerHVACBatchJobManual(
  accountId?: string
): Promise<void> {
  console.log('[HVAC Batch Job] Manual trigger');

  if (accountId) {
    await processAccountHVACBatch(accountId);
  } else {
    await runHVACBatchJob();
  }
}
