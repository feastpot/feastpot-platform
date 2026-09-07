---
name: Menu moderation pilot
description: Launch posture and non-negotiable safety boundaries for menu-item moderation.
---

Use manual approval for the pilot. Automatic approval is an explicit opt-in only; missing
or malformed configuration must fail closed.

**Why:** Early submission volume is low enough for a 72-hour manual review target, while
incorrect dish content and allergen declarations carry disproportionate customer-safety
and trust risk.

**How to apply:** Treat every substantive vendor change, including imagery, as a new
submission. Bind staff decisions to the exact submission revision and source state so a
stale screen cannot approve unseen changes. Keep allergen declaration checks at both the
public-read boundary and checkout even if moderation logic changes later. Bulk decisions
must remain same-vendor, revision-bound, and atomic.