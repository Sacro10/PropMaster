import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from '../services/activityService';

function isMissingTable(error: any, tableName?: string) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  if (error.code === '42P01') return true;
  if (!tableName) return message.includes('does not exist');
  return message.includes(`"${tableName}"`) && message.includes('does not exist');
}

const TABLES = ['hvac_filter_subscriptions', 'hvac_program_enrollments'];

export async function processHVACFilterRenewals(): Promise<void> {
  const today = new Date();
  const todayDate = today.toISOString().split('T')[0];
  const reminderWindow = new Date(today);
  reminderWindow.setDate(reminderWindow.getDate() + 30);
  const reminderDate = reminderWindow.toISOString().split('T')[0];

  for (const tableName of TABLES) {
    try {
      const { data: dueSoon, error: dueSoonError } = await supabase
        .from(tableName)
        .select('id, account_id, unit_id, annual_expires_on, annual_renewal_reminder_sent_at')
        .eq('status', 'active')
        .not('annual_expires_on', 'is', null)
        .gte('annual_expires_on', todayDate)
        .lte('annual_expires_on', reminderDate);

      if (dueSoonError) {
        if (isMissingTable(dueSoonError, tableName)) {
          continue;
        }
        throw dueSoonError;
      }

      const remindTargets = (dueSoon || []).filter((row: any) => !row.annual_renewal_reminder_sent_at);
      if (remindTargets.length > 0) {
        const nowIso = new Date().toISOString();
        const accountCounts = new Map<string, number>();
        for (const row of remindTargets) {
          accountCounts.set(row.account_id, (accountCounts.get(row.account_id) || 0) + 1);
        }

        await supabase
          .from(tableName)
          .update({ annual_renewal_reminder_sent_at: nowIso })
          .in('id', remindTargets.map((row: any) => row.id));

        for (const [accountId, count] of accountCounts.entries()) {
          await logActivityEvent(
            accountId,
            null,
            'hvac_filter_renewal_due',
            `HVAC filter delivery renewal due for ${count} unit${count === 1 ? '' : 's'}`,
            {
              entityType: 'hvac_filter_subscription',
              metadata: {
                table: tableName,
                renewalWindowDays: 30,
              },
            }
          );
        }
      }

      const { data: expired, error: expiredError } = await supabase
        .from(tableName)
        .select('id, account_id')
        .eq('status', 'active')
        .not('annual_expires_on', 'is', null)
        .lt('annual_expires_on', todayDate);

      if (expiredError) {
        if (isMissingTable(expiredError, tableName)) {
          continue;
        }
        throw expiredError;
      }

      if (expired && expired.length > 0) {
        const nowIso = new Date().toISOString();
        await supabase
          .from(tableName)
          .update({
            status: 'paused',
            paused_at: nowIso,
            cancellation_reason: 'Annual renewal required',
          })
          .in('id', expired.map((row: any) => row.id));

        const accountCounts = new Map<string, number>();
        for (const row of expired) {
          accountCounts.set(row.account_id, (accountCounts.get(row.account_id) || 0) + 1);
        }

        for (const [accountId, count] of accountCounts.entries()) {
          await logActivityEvent(
            accountId,
            null,
            'hvac_filter_renewal_expired',
            `HVAC filter delivery paused for ${count} unit${count === 1 ? '' : 's'} (renewal required)`,
            {
              entityType: 'hvac_filter_subscription',
              metadata: {
                table: tableName,
              },
            }
          );
        }
      }
    } catch (error) {
      console.error(`[HVAC Renewal Job] Error processing ${tableName}:`, error);
    }
  }
}
