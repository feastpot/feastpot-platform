---
name: Onboarding recovery and funnel
description: Durable rules for vendor document recovery delivery and anonymous-to-application funnel attribution.
---

Recovery campaigns are immutable per targeted onboarding item. Queue acceptance is not delivery: recovery stages and staff chase cooldowns advance only after the notification processor records a successful provider outcome. SMS requires positive applicant consent, a verified phone, and no explicit preference opt-out. Deferring an item never counts as supplying it or bypasses publication readiness.

**Why:** Reusing stage rows destroyed recovery history, and marking queued messages as sent corrupted recovery rates and could block a valid retry after suppression or provider failure.

**How to apply:** Retarget by cancelling the active campaign and creating another. Keep prior stage outcomes unchanged. Derive supplied state from canonical onboarding/compliance evidence, not a vendor self-declaration.

Anonymous acquisition events are attributed to the nearest VendorApplication sharing the anonymous visitor ID within a bounded 24-hour window. This must work for events persisted after application creation because browser beacon delivery is asynchronous.

**Why:** A one-time backfill at Phase 1 creation misses late beacons, splitting one applicant into multiple cohorts and breaking time-to-live and stuck-lead reporting.

**How to apply:** Use the same bounded cohort resolver for ordered funnel counts, time-to-live, and stuck-lead drill-through. Deletion must remove or unlink both the application correlation and its anonymous identity.