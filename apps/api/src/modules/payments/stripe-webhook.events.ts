/**
 * Every Stripe event type the webhook processor has a named @Process handler
 * for. The controller checks incoming events against this set: anything else
 * would be enqueued as a job name no handler consumes and silently rot in the
 * queue, so the controller records + alerts instead of enqueueing.
 *
 * Lives in its own file (not the processor) so the controller can import it
 * without a controller <-> processor import cycle (the processor imports
 * STRIPE_WEBHOOK_QUEUE from the controller).
 *
 * The processor derives its @Process handler names from HandledStripeEventType
 * via its eventName() helper, so adding a handler without registering the
 * event type here is a compile-time error rather than a silent drop.
 */
const HANDLED_STRIPE_EVENT_TYPE_LIST = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'transfer.created',
  'refund.updated',
  'charge.refund.updated',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  // FeastPass subscription lifecycle
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
] as const;

export type HandledStripeEventType = (typeof HANDLED_STRIPE_EVENT_TYPE_LIST)[number];

export const HANDLED_STRIPE_EVENT_TYPES: ReadonlySet<string> = new Set(
  HANDLED_STRIPE_EVENT_TYPE_LIST,
);
