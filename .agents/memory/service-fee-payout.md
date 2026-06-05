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

**Known adjacent gap (not the service-fee task, separate subsystem):** refunds
deduct the full customer refund amount (`refundsPence`, from refund/partial_refund
Payment rows) from the vendor, while the commission-reversal `credit` row is not
netted in the batch. Refund accounting can over-deduct the vendor by the
service-fee/commission portion — out of scope for the payout-leak fix, treat as
its own task with a clear spec.
