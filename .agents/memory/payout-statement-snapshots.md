---
name: Payout statement snapshots
description: Why payout batches persist one immutable canonical statement for all vendor-facing formats.
---

Persist one canonical, versioned payout statement snapshot when a batch is created, and render batch totals, detail, CSV, PDF, and notifications from that snapshot.

**Why:** Re-querying orders and ledger rows later lets refunds, chargebacks, or rate changes rewrite historical statements and makes formats disagree. Legacy rows must show unavailable values rather than inferred zeroes.

**How to apply:** Any new payout presentation or notification consumes the stored statement contract. Add financial lines to the canonical model first; do not recreate arithmetic in a renderer.