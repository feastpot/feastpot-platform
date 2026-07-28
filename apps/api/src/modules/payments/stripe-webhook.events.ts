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
 * KEEP IN SYNC with the @Process({ name: ... }) decorators in
 * stripe-webhook.processor.ts.
 */
export const HANDLED_STRIPE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'transfer.created',
  'refund.updated',
  'charge.refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
]);
