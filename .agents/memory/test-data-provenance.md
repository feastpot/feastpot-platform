---
name: Test-data provenance
description: Durable rules for keeping seed and factory records out of real operational figures and customer surfaces.
---

Test and seed records must carry explicit persisted provenance. Never infer fixture status from an email address, name, ownership, or other personal-looking data.

Operational metrics, lists, counts, exports, and public search must exclude marked fixtures by default. Admin-only retrieval may include them, but every included row and export must clearly label its test status and provenance.

**Why:** Filtering only one dashboard left the same marked vendors and orders visible in other operational lists and public search, making figures misleading and test records appear real.

**How to apply:** When adding a factory writer or operational query, propagate the marker through idempotent repair paths and apply the exclusion consistently to list, count, KPI, export, direct public lookup, and public discovery queries. Preserve audit history; label it rather than deleting it.

Factories that coordinate external Auth identities with database records must serialize the entire ownership protocol, including orphan reconciliation and compensation. A database preflight followed by unlocked Auth creation lets concurrent requests delete each other's in-flight users.