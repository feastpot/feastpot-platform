---
name: Stripe webhook execution leases
description: Concurrency ownership rules for Stripe webhook workers and stalled Bull redeliveries
---

Worker ownership for a Stripe webhook is per execution, not per stable Bull job ID. A worker must acquire a unique token with a conditional database update, and completion or failure may update the event only when that exact token still owns it. Failed attempts must release/reset their token so a retry can acquire ownership; stale leases are recoverable after the lease interval.

**Why:** Bull can redeliver a stalled job with the same deterministic job ID while the original execution is still present. Treating that ID as ownership makes the redelivery look reentrant and can allow duplicate business side effects.

**How to apply:** Generate a fresh token at worker entry, retain it for the execution instance, guard all named handlers with the conditional claim, and use token equality for completion and failure bookkeeping.