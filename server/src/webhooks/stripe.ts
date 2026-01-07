import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, getPlanFromPriceId, PLAN_LIMITS } from '../stripe';
import { supabaseAdmin } from '../supabase';
import { config } from '../config';
import {
  logSubscriptionEvent,
  logPaymentEvent,
  logWebhookEvent,
  AuditAction,
} from '../services/auditLog';

// Idempotency tracking to prevent duplicate processing
const processedEvents = new Map<string, number>();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

function isEventProcessed(eventId: string): boolean {
  const timestamp = processedEvents.get(eventId);
  if (!timestamp) return false;

  // Clean up old entries
  if (Date.now() - timestamp > IDEMPOTENCY_TTL) {
    processedEvents.delete(eventId);
    return false;
  }

  return true;
}

function markEventProcessed(eventId: string): void {
  processedEvents.set(eventId, Date.now());

  // Periodic cleanup of old entries
  if (processedEvents.size > 1000) {
    const now = Date.now();
    for (const [id, timestamp] of processedEvents.entries()) {
      if (now - timestamp > IDEMPOTENCY_TTL) {
        processedEvents.delete(id);
      }
    }
  }
}

async function updateAccountSubscription(
  customerId: string,
  subscription: Stripe.Subscription | null,
  deletedSubscription?: boolean
) {
  try {
    // Find account by Stripe customer ID
    const { data: account, error: fetchError } = await supabaseAdmin
      .from('accounts')
      .select('id, plan')
      .eq('stripe_customer_id', customerId)
      .single();

    if (fetchError || !account) {
      console.error('Account not found for customer:', customerId, fetchError);
      return;
    }

    let updateData: any = {
      updated_at: new Date().toISOString(),
    };

    let auditAction: AuditAction;
    let newPlan: string;

    if (!subscription || deletedSubscription) {
      // Subscription cancelled or deleted - downgrade to basic
      updateData = {
        ...updateData,
        stripe_subscription_id: null,
        subscription_status: 'canceled',
        subscription_current_period_end: null,
        plan: 'basic',
        max_properties: PLAN_LIMITS.basic.maxProperties,
        max_units: PLAN_LIMITS.basic.maxUnits,
      };
      auditAction = AuditAction.SUBSCRIPTION_CANCELED;
      newPlan = 'basic';
    } else {
      // Get price ID from subscription
      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId ? getPlanFromPriceId(priceId) : 'basic';
      const limits = PLAN_LIMITS[plan];

      updateData = {
        ...updateData,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        subscription_current_period_end: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
        plan,
        max_properties: limits.maxProperties,
        max_units: limits.maxUnits,
      };

      // Determine if upgrade or downgrade
      const oldPlan = account.plan;
      if (oldPlan !== plan) {
        const planRank = { basic: 1, pro: 2, premium: 3 };
        auditAction =
          planRank[plan as keyof typeof planRank] >
          planRank[oldPlan as keyof typeof planRank]
            ? AuditAction.ACCOUNT_UPGRADED
            : AuditAction.ACCOUNT_DOWNGRADED;
      } else {
        auditAction = AuditAction.SUBSCRIPTION_UPDATED;
      }
      newPlan = plan;
    }

    const { error: updateError } = await supabaseAdmin
      .from('accounts')
      .update(updateData)
      .eq('id', account.id);

    if (updateError) {
      console.error('Failed to update account:', updateError);
      throw updateError;
    }

    // Audit log
    await logSubscriptionEvent(
      auditAction,
      account.id,
      subscription?.id || 'none',
      {
        oldPlan: account.plan,
        newPlan,
        customerId,
        status: subscription?.status || 'canceled',
      }
    );

    console.log(`Account ${account.id} updated successfully:`, updateData);
  } catch (error) {
    console.error('Error updating account subscription:', error);
    throw error;
  }
}

async function handleCustomerSubscriptionCreated(
  subscription: Stripe.Subscription
) {
  console.log('Processing subscription.created:', subscription.id);
  await updateAccountSubscription(subscription.customer as string, subscription);
}

async function handleCustomerSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  console.log('Processing subscription.updated:', subscription.id);
  await updateAccountSubscription(subscription.customer as string, subscription);
}

async function handleCustomerSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  console.log('Processing subscription.deleted:', subscription.id);
  await updateAccountSubscription(
    subscription.customer as string,
    subscription,
    true
  );
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  console.log('Processing checkout.session.completed:', session.id);

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!customerId) {
    console.error('No customer ID in checkout session');
    return;
  }

  // Update account with customer ID if this was their first subscription
  const accountId = session.metadata?.account_id;
  if (accountId) {
    const { error } = await supabaseAdmin
      .from('accounts')
      .update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    if (error) {
      console.error('Failed to update account with customer ID:', error);
    }
  }

  // Fetch and update subscription details
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await updateAccountSubscription(customerId, subscription);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_succeeded:', invoice.id);

  // Ensure subscription is active
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription as string
    );
    await updateAccountSubscription(invoice.customer as string, subscription);

    // Log payment success
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('stripe_customer_id', invoice.customer as string)
      .single();

    if (account) {
      await logPaymentEvent(
        AuditAction.PAYMENT_SUCCEEDED,
        account.id,
        invoice.id,
        {
          amount: invoice.amount_paid,
          currency: invoice.currency,
          subscriptionId: invoice.subscription as string,
        }
      );
    }
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_failed:', invoice.id);

  // Update subscription status (may be past_due or unpaid)
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription as string
    );
    await updateAccountSubscription(invoice.customer as string, subscription);

    // Log payment failure
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('stripe_customer_id', invoice.customer as string)
      .single();

    if (account) {
      await logPaymentEvent(AuditAction.PAYMENT_FAILED, account.id, invoice.id, {
        amount: invoice.amount_due,
        currency: invoice.currency,
        subscriptionId: invoice.subscription as string,
        attemptCount: invoice.attempt_count,
      });
    }
  }
}

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('Missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res
      .status(400)
      .send(
        `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
  }

  // Log webhook received
  await logWebhookEvent(event.id, event.type, 'received');

  // Idempotency check
  if (isEventProcessed(event.id)) {
    console.log('Event already processed:', event.id);
    return res.json({ received: true, cached: true });
  }

  console.log('Received webhook event:', event.type, event.id);

  try {
    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
        await handleCustomerSubscriptionCreated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.updated':
        await handleCustomerSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.deleted':
        await handleCustomerSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    // Mark event as processed
    markEventProcessed(event.id);

    // Log webhook processed successfully
    await logWebhookEvent(event.id, event.type, 'processed');

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);

    // Log webhook processing failure
    await logWebhookEvent(event.id, event.type, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return 500 so Stripe will retry
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
