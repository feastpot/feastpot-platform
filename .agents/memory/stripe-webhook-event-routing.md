---
name: Stripe webhook event-name routing
description: How Stripe event types map to BullMQ processors, and the refund event-name pitfall.
---

# Stripe webhook event routing

The webhook controller enqueues each event with `queue.add(event.type, ...)` — the
**Bull job name IS the raw Stripe `event.type` string**. The processor dispatches by
EXACT named `@Process({ name: '<event.type>' })`. There is no catch-all (legacy Bull
forbids a catch-all alongside named handlers), so any event whose type has no matching
named handler is **silently dropped** after being recorded in `processed_webhook_events`.

**Implication:** the events subscribed on the live Stripe endpoint must each have an
exactly-named processor handler, or they no-op.

## Refund event pitfall
Stripe emits the refund-status event as either `refund.updated` (modern API versions)
or `charge.refund.updated` (older). Both carry a `Refund` as `data.object`. The live
endpoint was registered for `charge.refund.updated` while the code only handled
`refund.updated` → refunds never reconciled. Fix: register named handlers for BOTH,
delegating to one private method. Apply the same dual-name defensiveness to any future
event whose type name varies by API version.

**How to verify what the live endpoint actually sends** (read-only, no secret printed):
`curl -s https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY_LIVE:" -G -d limit=20`
then inspect each `url` / `status` / `enabled_events`. The `secret` is only returned at
creation, so listing never exposes signing secrets.
