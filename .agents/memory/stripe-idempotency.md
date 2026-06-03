---
name: Stripe money-moving idempotency
description: Every money-moving Stripe call must pass a deterministic idempotency key keyed on the business id, or retries double-spend.
---

Every Stripe call that moves money (`paymentIntents.create`, `refunds.create`,
`transfers.create`) must pass a deterministic `idempotencyKey` derived from the
owning business id (orderId / paymentId / payoutId), not a random/time value.

**Why:** A transfer/charge/refund can succeed at Stripe but have its response
time out on our side. The payout path catches that and flips the row to
`failed`; a later re-approval then issues a *second* transfer and double-pays
the vendor. With a key of `payout-transfer-<payoutId>` Stripe returns the
original transfer instead of creating a new one. `createTransfer` was the one
money method that historically lacked an idempotency key while charges/refunds
had them.

**How to apply:** When adding or reviewing any `StripeService` money method,
confirm it accepts and forwards `idempotencyKey` and that callers pass a stable
per-entity value. Treat a missing key on a money path as a double-spend bug.
