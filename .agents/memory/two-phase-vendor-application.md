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

Preserve acquisition identity and referral headers rather than stripping them
to work around browser failures. Permit them in the API's CORS header policy
while retaining the strict origin allowlist.

**Why:** A production registration failure occurred before the POST reached the
handler: browser preflight rejected the identity headers, despite a reachable
API route and current database schema. No server-side registration exception
was recorded.

**How to apply:** When saves fail with no matching API incident, check browser
preflight first. Verify the actual customer origin and headers against the
running API, not only direct server-to-server requests.