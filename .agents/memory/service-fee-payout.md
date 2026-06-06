---
name: Service fee & vendor payout math
description: How the 5% platform service fee must be kept out of vendor payouts, in BOTH the per-order calc and the weekly batch.
---

# Vendor payout vs. platform service fee

**Rule:** the platform service fee (`serviceFeePence`, 5% / `SERVICE_FEE_BPS`) is
Feastpot revenue and must NEVER reach the vendor. The vendor payout is:

```
vendorPayout = subtotal + delivery − discount − commission
             = total − serviceFee − commission
```

The **delivery fee stays with the vendor** — vendors set it themselves
(`vendor.deliveryConfig.local/nationwideFeePence`) and fulfil delivery, so it is
vendor reimbursement, not platform revenue. Commission is charged on food
`subtotal` only.

**Why:** a confirmed leak shipped the service fee into payouts because payout was
`total − commission`, and `total` includes `serviceFeePence`. At £45 AOV that's
~£2.25/order handed back to vendors.

**How to apply — there are TWO independent payout code paths; fix both:**
1. Per-order calc when the order is created (`computeCommission`): stores
   `Order.vendorPayoutPence`.
2. The **weekly payout batch** (`aggregateVendorBatch` / `runWeeklyBatch`): this
   historically recomputed net as `sum(totalPence) − sum(commissionPence) − refunds`,
   which silently re-includes the service fee. It must net from the **stored**
   `sum(vendorPayoutPence)` instead. The `vendorPayoutPence` field being *selected
   and passed in* does NOT mean it was *used* — verify the arithmetic, don't trust
   the field plumbing.

**Refund clawback (fixed):** the vendor clawback on a refund is
`(subtotal + delivery − discount − commission) × refundFraction`, NOT the full
customer refund (`total`). The customer is still refunded the full amount via
Stripe; Feastpot absorbs its service-fee share + the commission it gives back.

How it's wired (don't regress):
- `createRefund` writes TWO Payment rows that MUST be atomic (single interactive
  `prisma.$transaction`): a `refund`/`partial_refund` row at `-customerRefund`
  (full amount — drives the cumulative-refund guard + Stripe `stripeRefundId`
  reconciliation) AND a `credit` row at the Feastpot-absorbed portion.
- The weekly batch nets them: `refundsPence = max(0, sum(refund rows) − sum(credit rows))`
  = vendor clawback. **If the credit row is ever written outside the refund txn,
  this netting silently over/under-claws — keep the two writes atomic.**
- `PaymentType.credit` is currently created ONLY in the refund path, so netting
  ALL credit rows is safe; if a new credit use-case appears, tag refund credits
  so the batch can filter only refund-linked ones.

**Why:** before the fix the batch netted only refund rows and the credit reversal
was never subtracted, so a full refund clawed back the entire `total`
(service fee + commission included) from the vendor.
