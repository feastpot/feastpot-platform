---
name: Vendor onboarding readiness
description: Durable rules for deriving vendor progression and publication eligibility.
---

Treat “can progress through setup” and “can publish to customers” as separate decisions. Derive publication eligibility from current evidence every time; never persist a `canProfileGoLive` boolean.

**Why:** A stored readiness flag can drift when documents expire, Stripe capabilities change, terms are superseded, menu publication changes, or an FHRS rating is assigned. The first-inspection state is also legally distinct from a failed rating: confirmed registration while awaiting the first inspection is eligible, while an existing rating below 3 is not.

**How to apply:** Make activation, public discovery, and order acceptance enforce the same FHRS policy and hard-gate evidence. Persist only auditable per-step snapshots, with source citations, for display and history.

The current contractual public-liability minimum is £5 million under Vendor Terms clause 2 and Annex B. Do not reduce it to £1 million based on an older brief unless the effective terms change first.