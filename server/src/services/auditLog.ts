import { supabaseAdmin } from '../supabase';

export enum AuditAction {
  // Subscription events
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  SUBSCRIPTION_CANCELED = 'subscription_canceled',

  // Payment events
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',

  // Account events
  ACCOUNT_UPGRADED = 'account_upgraded',
  ACCOUNT_DOWNGRADED = 'account_downgraded',

  // Webhook events
  WEBHOOK_RECEIVED = 'webhook_received',
  WEBHOOK_PROCESSED = 'webhook_processed',
  WEBHOOK_FAILED = 'webhook_failed',
}

export interface AuditLogEntry {
  account_id?: string;
  user_id?: string;
  action: AuditAction;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Create an audit log entry
 * Logs critical operations for compliance and debugging
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('audit_log')
      .insert({
        account_id: entry.account_id || null,
        user_id: entry.user_id || null,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id || null,
        metadata: entry.metadata || {},
        ip_address: entry.ip_address || null,
        user_agent: entry.user_agent || null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      // Don't throw - audit logging failures shouldn't break the main flow
      console.error('Failed to create audit log:', error);
    }
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * Helper to log subscription events
 */
export async function logSubscriptionEvent(
  action: AuditAction,
  accountId: string,
  subscriptionId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    account_id: accountId,
    action,
    resource_type: 'subscription',
    resource_id: subscriptionId,
    metadata,
  });
}

/**
 * Helper to log payment events
 */
export async function logPaymentEvent(
  action: AuditAction,
  accountId: string,
  paymentId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    account_id: accountId,
    action,
    resource_type: 'payment',
    resource_id: paymentId,
    metadata,
  });
}

/**
 * Helper to log webhook events
 */
export async function logWebhookEvent(
  eventId: string,
  eventType: string,
  status: 'received' | 'processed' | 'failed',
  metadata?: Record<string, any>
): Promise<void> {
  const action =
    status === 'received'
      ? AuditAction.WEBHOOK_RECEIVED
      : status === 'processed'
      ? AuditAction.WEBHOOK_PROCESSED
      : AuditAction.WEBHOOK_FAILED;

  await createAuditLog({
    action,
    resource_type: 'webhook',
    resource_id: eventId,
    metadata: {
      eventType,
      ...metadata,
    },
  });
}
