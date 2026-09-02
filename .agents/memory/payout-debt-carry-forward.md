---
name: Payout debt carry-forward
description: How negative weekly vendor net is represented without invalid Stripe transfers.
---

Keep weekly raw net and carried vendor debt as signed integer-pence balances, but keep the Stripe-facing payout amount non-negative. A positive week first offsets the opening debt; only the remaining positive amount is transferable.

**Why:** Persisting a negative payout amount loses the distinction between debt and cash transfer and can reach Stripe with an invalid amount. Flooring to zero without a separate balance silently loses the debt.

**How to apply:** Payout snapshots must preserve opening balance, raw weekly net, transferable amount, and closing debt. Never create a Stripe transfer for zero or negative pence.