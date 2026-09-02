---
name: Stripe financial reconciliation
description: Durable mismatch detection between Stripe and the local financial ledger.
---

Scheduled Stripe reconciliation records de-duplicated findings and alerts; it does not auto-create, delete, or alter financial rows.

**Why:** A mismatch may represent a post-Stripe crash, an external Dashboard action, delayed webhook, or a genuinely incorrect local row. Automatic repair can duplicate money movement or fabricate provenance.

**How to apply:** Scan bounded recent Stripe activity plus local transferred payouts for missing captures, transfers, refunds, and amount differences. Record local integrity and unexplained zero-fee findings for finance review.