---
name: Checkout cancellation saga
description: Durable ordering and recovery rules for cancelling checkout PaymentIntents.
---

Persist `cancellation_pending` before cancelling the Stripe PaymentIntent. This state must block vendor fulfilment, count against all capacity limits, and be reconciled before another checkout for the same customer and vendor.

**Why:** Stripe and PostgreSQL cannot share a transaction. Cancelling Stripe before durable intent can leave a fulfilable order without authorization; finalizing the database before Stripe can leave a live PaymentIntent. Browser-only cleanup is also lost on reload.

**How to apply:** Treat cancellation as a saga. Commit the pending state, release Stripe idempotently, then atomically finalize payment/order cancellation and capacity release. New checkout attempts must reconcile pending cancellation first.