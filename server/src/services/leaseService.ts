import { supabaseAdmin as supabase } from '../supabase';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function buildMonthlyDueDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const startUtc = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const dayOfMonth = startUtc.getUTCDate();

  let year = startUtc.getUTCFullYear();
  let month = startUtc.getUTCMonth();

  while (true) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const dueDay = Math.min(dayOfMonth, daysInMonth);
    const dueDate = new Date(Date.UTC(year, month, dueDay));

    if (dueDate > endUtc) {
      break;
    }

    dates.push(formatDate(dueDate));

    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return dates;
}

export async function setLeaseAutoPay(
  accountId: string,
  leaseId: string,
  enabled: boolean
): Promise<{ scheduledPayments: number }> {
  const { data: lease, error: leaseError } = await supabase
    .from('leases')
    .select('id, tenant_user_id, unit_id, rent, lease_start, lease_end')
    .eq('account_id', accountId)
    .eq('id', leaseId)
    .single();

  if (leaseError || !lease) {
    throw leaseError || new Error('Lease not found');
  }

  const { error: updateError } = await supabase
    .from('leases')
    .update({ auto_pay_enabled: enabled })
    .eq('account_id', accountId)
    .eq('id', leaseId);

  if (updateError) {
    throw updateError;
  }

  if (!enabled) {
    return { scheduledPayments: 0 };
  }

  if (!lease.lease_start || !lease.lease_end) {
    return { scheduledPayments: 0 };
  }

  const leaseStart = new Date(lease.lease_start);
  const leaseEnd = new Date(lease.lease_end);
  if (Number.isNaN(leaseStart.getTime()) || Number.isNaN(leaseEnd.getTime())) {
    return { scheduledPayments: 0 };
  }

  const today = formatDate(new Date());
  const dueDates = buildMonthlyDueDates(leaseStart, leaseEnd).filter((date) => date >= today);

  if (dueDates.length === 0) {
    return { scheduledPayments: 0 };
  }

  const { data: existingPayments, error: paymentsError } = await supabase
    .from('payments')
    .select('due_date')
    .eq('account_id', accountId)
    .eq('lease_id', leaseId)
    .eq('payment_type', 'rent')
    .gte('due_date', dueDates[0])
    .lte('due_date', dueDates[dueDates.length - 1]);

  if (paymentsError) {
    throw paymentsError;
  }

  const existingDates = new Set((existingPayments || []).map((payment: any) => payment.due_date));
  const newPayments = dueDates
    .filter((date) => !existingDates.has(date))
    .map((date) => ({
      account_id: accountId,
      lease_id: leaseId,
      tenant_user_id: lease.tenant_user_id,
      unit_id: lease.unit_id,
      amount: lease.rent,
      payment_type: 'rent',
      due_date: date,
      status: 'pending',
      payment_method: 'ach',
      notes: 'Auto-pay scheduled',
    }));

  if (newPayments.length > 0) {
    const { error: insertError } = await supabase
      .from('payments')
      .insert(newPayments);

    if (insertError) {
      throw insertError;
    }
  }

  return { scheduledPayments: newPayments.length };
}
