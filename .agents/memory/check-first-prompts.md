---
name: CHECK-FIRST attached prompts often describe already-built features
description: How to handle the attached_assets task prompts in this repo that diverge from real code
---

Tasks in this repo arrive as attached "You are a … engineer" prompts (in `attached_assets/`) that
read like greenfield specs but frequently describe features that are **already implemented**, and
often cite **wrong paths / field names**.

**Rule:** Always verify against the live codebase before writing any code. Implement only the genuine
gaps; if fully present, report "already implemented" and make no changes ("nothing more, nothing less").

**Why:** Repeatedly, full specs (e.g. menu-item moderation: env-gated `MENU_AUTO_APPROVE` flow +
admin moderation queue) were found already built end-to-end. Re-implementing would churn shipped code.

**How to apply:** Grep for the plan's key identifiers (env flags, controller/class names, hook files,
enum values, route paths) across api/admin/vendor/web before editing. Known path traps seen in prompts:
service-fee is at `apps/api/src/common/config/service-fee.ts` (NOT `common/utils`); `ModerationStatus`
enum uses `held` (NOT `pending`).
