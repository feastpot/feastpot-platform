---
name: Notification outbox
description: Durable fallback for notification enqueues when Redis/Bull is down; drainer idempotency rules.
---

# Rule
`NotificationsService.enqueue` is the ONLY correct way for feature code to send
notification events — never inject the raw notifications Queue. On queue.add
failure it persists the event to `notification_outbox`; a setInterval drainer
(deliberately not Bull — must work when Redis is down) retries every 60s with
backoff, Sentry at 5 attempts, backlog alert at batch-size.

**Why:** raw queue adds were best-effort (log+swallow); money moved but nobody
was told when Redis was down.

# Drainer idempotency
- Drain always enqueues with a deterministic jobId (`outbox:<rowId>` fallback)
  so a successful add followed by a failed delete is deduped on the next drain
  — never treat a post-enqueue delete failure as an enqueue failure.
- Unhandled Stripe webhook event types are NOT enqueued (Bull has no catch-all;
  they'd rot). Controller checks `HANDLED_STRIPE_EVENT_TYPES`
  (stripe-webhook.events.ts — keep in sync with @Process names), records the
  event, and Sentry-warns once per type per process.
