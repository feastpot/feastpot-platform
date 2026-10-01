---
name: Test-data provenance
description: Durable rules for keeping seed and factory records out of real operational figures and customer surfaces.
---

Test and seed records must carry explicit persisted provenance. Never infer fixture status from an email address, name, ownership, or other personal-looking data.

Operational metrics, lists, counts, exports, and public search must exclude marked fixtures by default. Admin-only retrieval may include them, but every included row and export must clearly label its test status and provenance.

**Why:** Filtering only one dashboard left the same marked vendors and orders visible in other operational lists and public search, making figures misleading and test records appear real.

**How to apply:** When adding a factory writer or operational query, propagate the marker through idempotent repair paths and apply the exclusion consistently to list, count, KPI, export, direct public lookup, and public discovery queries. Preserve audit history; label it rather than deleting it.

An API running explicitly with `NODE_ENV=test` may expose marked fixtures so isolated end-to-end journeys can use public customer paths. Never enable this exception in development or production.

Factories that coordinate external Auth identities with database records must serialize the entire ownership protocol, including orphan reconciliation and compensation. A database preflight followed by unlocked Auth creation lets concurrent requests delete each other's in-flight users.

Demo records in production may reference generated photos in the development
public media bucket only when that storage boundary is disclosed to the user.
This is a demo-only accommodation, not a production-media convention.

**Why:** Access to the external production database does not imply access to its
Storage project; the available service-role credential can belong to development.
Using illustrative public demo assets avoids requesting unrelated credentials,
but those images remain dependent on development storage retention.

**How to apply:** Isolate such assets under a dedicated demo namespace, retain
their source files, and keep the vendor private and non-orderable. If a demo is
ever replaced with a real vendor, migrate the photos to production-owned storage
and replace sample details with genuine evidence rather than merely clearing
the test marker.