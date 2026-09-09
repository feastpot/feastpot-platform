---
name: Two-phase vendor application
description: Durable acquisition-flow boundaries for anonymous drafts, resume access, Admin visibility, and menu images.
---

The public vendor application is an anonymous two-phase draft flow. Phase 1 creates a recoverable lead; only final submission makes it visible or actionable in Admin.

**Why:** Early leads must survive abandonment without exposing incomplete personal data to operational queues or triggering pre-approval compliance work.

**How to apply:** Keep resume tokens opaque and hashed at rest, preserve exact Phase 2 position, gate every Admin application surface on submission, and keep compliance, terms, banking, and tax work after approval.

Menu photos remain private while an application is a draft. Submission must claim the row before promotion, publish the image only for the claim owner, and clean up the public copy if database finalization fails.

**Why:** Abandoned application photos are private intake material, while approved review/provisioning needs a stable image URL.

**How to apply:** Any new draft mutation must reject submitted or actively claimed rows; any new Admin application query must exclude unsubmitted rows unless it is an explicitly authorised lead-recovery tool.