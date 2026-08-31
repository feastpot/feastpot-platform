---
name: Catering payment ledger
description: Durable financial invariants for catering captures, refunds, cancellations, and payouts.
---

Catering collections and refunds use the shared Payment ledger. A payment row must have exactly one subject: an ordinary order or a catering booking.

**Why:** Direct catering Stripe calls created crash windows where Stripe and local booking, refund, or payout state could disagree.

**How to apply:** Persist refund intent before Stripe, use attempt-scoped Stripe idempotency keys, and complete the refund, platform credit, payout adjustment, and cancellation state under the catering advisory lock.

Payout transfer intent must be committed as a durable processing state under the same vendor-period lock used by refunds. Do not hold a database transaction open across the Stripe call.

**Why:** Without the shared lock, a refund can adjust an approved payout while the transfer worker sends the stale amount. Without a durable processing state, Stripe success followed by a database failure looks unpaid locally.

**How to apply:** Claim the payout under the vendor-period lock, commit, call Stripe outside the transaction, then record completion. Retries replay the same transfer key; refunds encountering processing retry later.

A succeeded catering capture always enters the ledger, even when cancellation won the local lock first; a capture observed on a cancelled booking is immediately routed through the durable refund path.

**Why:** Stripe may succeed before its webhook writes locally. Rejecting the late webhook would strand a real charge with no ledger row or automated refund.

**How to apply:** Serialize capture and cancellation on the catering subject lock, require a booking-state CAS for normal captures, and refund a successfully captured cancelled booking.