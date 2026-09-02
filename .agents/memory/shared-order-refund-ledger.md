---
name: Shared order refund ledger
description: Accounting rule for manual refunds and lost Stripe chargebacks.
---

Manual refunds and lost chargebacks must enter the same cumulative order-refund ledger path while holding the same per-order transaction lock. The path writes the negative customer refund, explicit service-fee and commission provenance credits, order status, allowance restoration, and audit record atomically.

**Why:** Independent implementations drifted on cumulative split arithmetic, credit-row provenance, order state, and allowance restoration. That made equivalent customer losses produce different vendor deductions.

**How to apply:** Any new order-side refund source must call the shared ledger writer after taking the order advisory lock and recomputing the already-refunded total inside the transaction.