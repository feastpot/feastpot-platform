---
name: service fee
description: How the platform service fee is computed and the cross-side lockstep it requires
---

# Service fee

The platform service fee (set by `SERVICE_FEE_BPS`, live value 500 = 5%) is
computed in **two** places that must stay in lockstep:

- API: `apps/api/src/common/config/service-fee.ts` — `calculateServiceFee` /
  `getServiceFeePence` read bps at call time, clamp to `[minPence 50, maxPence 299]`.
  This is the single source of truth for the actual charge (`orders.service`) and
  for the bps exposed on the public vendor profile (`vendors.service` →
  `platformServiceFeeBps`).
- Web: `apps/web/src/lib/service-fee.ts` — `calcServiceFeePence` mirrors the same
  clamp; bps comes from the API (`platformServiceFeeBps`) so the *rate* can't
  drift, but the **min/max clamp bounds are duplicated** on both sides.

**Why:** the customer-facing checkout total (summary line + Apple/Google express
pay) MUST equal the amount the server charges. If you change the rate or the
clamp bounds, update both files together or the displayed total drifts from the
charge.

**How to apply:** any edit to fee math/bounds touches both files. Default bps in
code is 0 (failsafe — a missing env never charges); the live 500 comes from the
env/secret, not the code default.

## FeastPass waiver — NOT implemented
The spec wanted the fee waived for active FeastPass subscribers, but there is **no
FeastPass data model** (no `hasFeastPass`, no subscription table — only a
marketing CTA strip + `/feastpass` link). The waiver was deliberately skipped to
avoid dead placeholder logic; it needs a subscriber/entitlement source first,
then a `serviceFeePence = 0` branch in `orders.service` order pricing.
