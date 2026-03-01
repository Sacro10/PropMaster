import { supabaseAdmin as supabase } from '../supabase';
import { notifyPaymentPaid } from '../services/paymentService';

export async function processAutoPayPayments(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, account_id, lease_id, due_date')
    .eq('status', 'pending')
    .eq('payment_type', 'rent')
    .lte('due_date', today);

  if (error) {
    throw error;
  }

  if (!payments || payments.length === 0) {
    return;
  }

  const leaseIds = Array.from(new Set(payments.map((payment: any) => payment.lease_id).filter(Boolean)));
  if (leaseIds.length === 0) {
    return;
  }

  const { data: leases, error: leasesError } = await supabase
    .from('leases')
    .select('id')
    .in('id', leaseIds)
    .eq('auto_pay_enabled', true);

  if (leasesError) {
    throw leasesError;
  }

  const autoPayLeaseIds = new Set((leases || []).map((lease: any) => lease.id));
  const paymentIds = (payments || [])
    .filter((payment: any) => autoPayLeaseIds.has(payment.lease_id))
    .map((payment: any) => payment.id);

  if (paymentIds.length === 0) {
    return;
  }

  const { error: updateError } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
    .in('id', paymentIds)
    .eq('status', 'pending');

  if (updateError) {
    throw updateError;
  }

  const paymentAccountMap = new Map(
    (payments || []).map((payment: any) => [payment.id, payment.account_id])
  );

  await Promise.allSettled(
    paymentIds
      .map((paymentId) => ({
        paymentId,
        accountId: paymentAccountMap.get(paymentId),
      }))
      .filter((item): item is { paymentId: string; accountId: string } => Boolean(item.accountId))
      .map((item) =>
        notifyPaymentPaid({
          accountId: item.accountId,
          paymentId: item.paymentId,
        })
      )
  );

  console.log(`  ✓ Auto-pay processed ${paymentIds.length} payments`);
}
