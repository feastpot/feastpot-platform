---
name: Chargeback reconciliation & refund concurrency
description: How lost chargebacks hit the ledger, and the per-order advisory lock protecting the refund ceiling.
---

# Lost-chargeback reconciliation

A LOST Stripe dispute must write the SAME atomic ledger pair as a manual refund:
a refund/partial_refund Payment row (negative, full customer amount) + credit
row(s) for the Feastpot-absorbed share (service fee + commission), computed via
`computeRefundSplit`. The weekly batch nets credit rows against refund rows, so
this keeps the vendor clawback correct without touching batch code.

**Idempotency:** CAS on `Chargeback.reconciledAt IS NULL` inside the same
transaction as the ledger writes (duplicate `closed`/`updated` lost events and
Bull retries are common).

# Refund-ceiling concurrency invariant

Every writer of refund-type Payment rows (manual refund AND chargeback
reconciliation) must, inside its write transaction:
1. `SELECT pg_advisory_xact_lock(hashtext(orderId))`
2. re-aggregate prior refund rows and enforce/clamp against `order.totalPence`

**Why:** pre-transaction guards read stale totals; two concurrent writers can
each pass and jointly exceed the order total.
**How to apply:** any new code path that writes refund/partial_refund rows must
take the same advisory lock and re-check inside the tx.

# Refund credit rows are SPLIT

`createRefund` writes TWO credit rows (service_fee_retained + commission share,
tagged in `failureReason`) that must sum EXACTLY to `feastpotAbsorbedPence` -
batch netting sums all credit rows, so the sum invariant is what matters.
The refund audit log is INSIDE the transaction (permanent trail, not best-effort).

# Ledger reconcile mirrors the batch

`reconcilePayoutLedger` (admin) must mirror `aggregateVendorBatch` exactly,
including the `max(0, …)` zero-floor on net - omitting it reports false
mismatches on high-refund periods.
