---
name: Test-factory global fixtures
description: Prevent namespaced test identities from changing globally selected records such as the current vendor terms version.
---

Namespaced test factories must reuse an existing globally current record when a route gate selects one platform-wide. They may create a fallback only when no current record exists, and teardown must not delete another namespace's references.

**Why:** A namespace-specific effective-now terms version became the new platform-wide current version and redirected already-authenticated vendors from unrelated browser projects into terms acceptance.

**How to apply:** For globally ordered records, mirror the production selector, reuse its result, and scope teardown to owned references. Keep future-state fixtures non-current until their intended effective date.

Do not assume independently reusable fixture fields compose into one ownership graph. A namespaced identity can reference a global transactional record whose related vendor differs from the identity's nominal vendor.

**Why:** An authoritative dispute test used an identity's reused order and vendor IDs as though they were guaranteed to belong together, so real vendor ownership correctly rejected the request.

**How to apply:** When an acceptance test depends on ownership across reused records, explicitly bind the transactional record to the test identity for the test and restore the original relation during cleanup.