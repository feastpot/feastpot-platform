---
name: Stripe Connect data boundary
description: Durable limits on retrievable Connect identity data and Open Banking activation.
---

Stripe Express account retrieval can return business type, names, addresses, date of birth when not redacted, company registration details when available, requirement state, and masked external-bank details. It does not return full NI, UTR, other tax identity numbers, or full bank account numbers after collection.

**Why:** Tax-profile and payout flows must not assume Stripe can supply values that its API intentionally redacts. Feastpot must directly collect any statutory identifier it genuinely needs, keep vendor responses masked, and avoid duplicating full bank data.

**How to apply:** Reconcile only retrievable Stripe fields into blank local fields. Treat indicators such as `id_number_provided` as status, not as the identifier itself. Enable external-account collection in Account Sessions, but remember that Stripe Link/Financial Connections must also be activated in the Stripe Dashboard for each relevant mode.