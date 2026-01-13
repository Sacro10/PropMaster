/**
 * Automated Reminders Background Job
 * Processes and sends scheduled reminder messages
 */

import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from '../services/activityService';
import { sendOutboundMessage } from '../services/communicationsService';

interface Reminder {
  id: string;
  account_id: string;
  reminder_type: string;
  name: string;
  frequency: string;
  next_send_date: string;
  message_subject: string;
  message_body: string;
  recipient_filter: any;
  status: string;
}

interface Tenant {
  id: string;
  user_id: string;
  account_id: string;
  email: string;
  full_name: string;
  lease_id?: string;
  unit_id?: string;
  property_id?: string;
}

/**
 * Process reminders that are due
 */
export async function processReminders(): Promise<void> {
  console.log('[Reminders Job] Checking for due reminders...');

  try {
    // Get reminders that are due
    const { data: reminders, error } = await supabase
      .from('automated_reminders')
      .select('*')
      .eq('status', 'active')
      .lte('next_send_date', new Date().toISOString());

    if (error) {
      console.error('[Reminders Job] Error fetching reminders:', error);
      return;
    }

    if (!reminders || reminders.length === 0) {
      console.log('[Reminders Job] No reminders due at this time');
      return;
    }

    console.log(`[Reminders Job] Processing ${reminders.length} reminders...`);

    // Process each reminder
    for (const reminder of reminders) {
      await processReminder(reminder as Reminder);
    }

    console.log('[Reminders Job] Completed processing reminders');
  } catch (error) {
    console.error('[Reminders Job] Fatal error:', error);
  }
}

/**
 * Process a single reminder
 */
async function processReminder(reminder: Reminder): Promise<void> {
  const startTime = Date.now();
  let recipientsCount = 0;
  let messagesSent = 0;
  let messagesFailed = 0;

  try {
    console.log(`[Reminders Job] Processing reminder: ${reminder.name} (${reminder.id})`);

    // Get recipients based on reminder type
    const recipients = await getRecipients(reminder);
    const recipientsWithEmail = recipients.filter((recipient) => recipient.email);
    recipientsCount = recipientsWithEmail.length;

    console.log(`[Reminders Job] Found ${recipientsCount} recipients for ${reminder.name}`);

    if (recipientsCount === 0) {
      console.log(`[Reminders Job] No recipients found for ${reminder.name}, skipping`);
      await supabase
        .from('automated_reminders')
        .update({ recipient_count: 0 })
        .eq('id', reminder.id)
        .eq('account_id', reminder.account_id);
      await updateReminderNextSend(reminder);
      return;
    }

    await supabase
      .from('automated_reminders')
      .update({ recipient_count: recipientsCount })
      .eq('id', reminder.id)
      .eq('account_id', reminder.account_id);

    // Send messages to all recipients
    for (const recipient of recipients) {
      try {
        if (!recipient.email) {
          console.warn(
            `[Reminders Job] Skipping ${recipient.user_id} for ${reminder.name} (missing email)`
          );
          messagesFailed++;
          continue;
        }

        const body = replaceVariables(reminder.message_body, reminder, recipient);
        const subject = replaceVariables(reminder.message_subject, reminder, recipient);

        // Create outbound message
        await sendOutboundMessage(reminder.account_id, {
          recipientUserId: recipient.user_id,
          subject,
          body,
          channel: 'email',
          reminderId: reminder.id,
        });

        messagesSent++;

        // Create activity event
        await logActivityEvent(
          reminder.account_id,
          recipient.user_id,
          'reminder_sent',
          `Automated reminder sent: ${reminder.name}`,
          {
            entityType: 'reminder',
            entityId: reminder.id,
            metadata: {
              reminderType: reminder.reminder_type,
              subject,
            },
          }
        );
      } catch (error) {
        console.error(
          `[Reminders Job] Failed to send to ${recipient.email}:`,
          error
        );
        messagesFailed++;
      }
    }

    const executionDuration = Date.now() - startTime;

    // Log execution
    await supabase.from('reminder_logs').insert({
      account_id: reminder.account_id,
      reminder_id: reminder.id,
      executed_at: new Date().toISOString(),
      recipients_count: recipientsCount,
      messages_sent: messagesSent,
      messages_failed: messagesFailed,
      status: messagesFailed === 0 ? 'success' : messagesFailed < messagesSent ? 'partial' : 'failed',
      execution_duration_ms: executionDuration,
    });

    // Update reminder for next send
    await updateReminderNextSend(reminder);

    // Update recipient count
    await supabase
      .from('automated_reminders')
      .update({
        recipient_count: recipientsCount,
        last_sent_date: new Date().toISOString(),
      })
      .eq('id', reminder.id);

    console.log(
      `[Reminders Job] Completed ${reminder.name}: ${messagesSent} sent, ${messagesFailed} failed in ${executionDuration}ms`
    );
  } catch (error) {
    console.error(`[Reminders Job] Error processing reminder ${reminder.id}:`, error);

    // Log error
    await supabase.from('reminder_logs').insert({
      account_id: reminder.account_id,
      reminder_id: reminder.id,
      executed_at: new Date().toISOString(),
      recipients_count: recipientsCount,
      messages_sent: messagesSent,
      messages_failed: messagesFailed,
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      execution_duration_ms: Date.now() - startTime,
    });
  }
}

/**
 * Get recipients for a reminder based on type and filters
 */
async function getRecipients(reminder: Reminder): Promise<Tenant[]> {
  let query = supabase
    .from('tenant_profiles')
    .select(
      `
      *,
      user:user_id(id, email, raw_user_meta_data),
      lease:leases!tenant_user_id(id, unit_id, property_id, status, lease_end)
    `
    )
    .eq('account_id', reminder.account_id);

  // Filter based on reminder type
  switch (reminder.reminder_type) {
    case 'rent_due':
      // Active leases only
      query = query.eq('lease.status', 'active');
      break;

    case 'lease_renewal':
      // Leases expiring in next 60 days
      const sixtyDaysFromNow = new Date();
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);
      query = query
        .eq('lease.status', 'active')
        .lte('lease.lease_end', sixtyDaysFromNow.toISOString());
      break;

    case 'hvac_filter':
      // All active tenants with units
      query = query.eq('lease.status', 'active').not('lease.unit_id', 'is', null);
      break;

    case 'property_inspection':
      // All active tenants
      query = query.eq('lease.status', 'active');
      break;

    default:
      // Apply custom filters from recipient_filter if provided
      if (reminder.recipient_filter && Object.keys(reminder.recipient_filter).length > 0) {
        // Custom filtering logic here
      }
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Reminders Job] Error fetching recipients:', error);
    return [];
  }

  // Transform to Tenant format
  return (
    data?.map((tp: any) => {
      const email = tp.email || tp.user?.email || '';
      return {
        id: tp.id,
        user_id: tp.user_id,
        account_id: tp.account_id,
        email,
        full_name: tp.full_name || tp.user?.raw_user_meta_data?.full_name || email || 'Tenant',
        lease_id: tp.lease?.id,
        unit_id: tp.lease?.unit_id,
        property_id: tp.lease?.property_id,
      };
    }) || []
  );
}

/**
 * Replace variables in message template
 */
function replaceVariables(
  template: string,
  reminder: Reminder,
  recipient: Tenant
): string {
  let message = template;

  // Replace common variables
  message = message.replace(/\{\{tenant_name\}\}/g, recipient.full_name);
  message = message.replace(/\{\{email\}\}/g, recipient.email);

  // Add more variable replacements as needed
  const now = new Date();
  message = message.replace(/\{\{current_date\}\}/g, now.toLocaleDateString());
  message = message.replace(/\{\{current_month\}\}/g, now.toLocaleDateString('en-US', { month: 'long' }));

  // Reminder-specific variables
  if (reminder.reminder_type === 'rent_due') {
    const dueDate = new Date(now);
    dueDate.setDate(1); // First of next month
    dueDate.setMonth(dueDate.getMonth() + 1);
    message = message.replace(/\{\{due_date\}\}/g, dueDate.toLocaleDateString());
  }

  return message;
}

/**
 * Update reminder's next send date based on frequency
 */
async function updateReminderNextSend(reminder: Reminder): Promise<void> {
  const now = new Date();
  const next = new Date(now);

  switch (reminder.frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'custom':
      // TODO: Parse cron expression
      next.setDate(next.getDate() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }

  await supabase
    .from('automated_reminders')
    .update({
      next_send_date: next.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', reminder.id);
}
