---
name: Seed order fixtures must match computeCommission
description: Dev seed orders hand-write payout figures; keep them consistent with the real payout formula.
---
Rule: any seeded order's `vendorPayoutPence` must equal the real formula output — payout = totalPence − serviceFeePence − commissionPence (equivalently subtotal + deliveryFee − commission; delivery fee stays with the vendor).

**Why:** seed.ts originally wrote payout = subtotal − commission (no delivery fee), so seeded rows contradicted the API's computeCommission and made the vendor earnings breakdown look wrong (values didn't sum). Fixed Aug 2026.

**How to apply:** when adding seeded orders in prisma/seed.ts, derive payout from the same formula rather than hardcoding; if the earnings UI "doesn't sum" in dev, suspect stale fixtures before suspecting the payout code.
