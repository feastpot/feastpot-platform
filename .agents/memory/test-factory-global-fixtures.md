---
name: Test-factory global fixtures
description: Keep namespaced E2E fixtures isolated, sequenced, and recoverable when browser tests time out.
---

Namespaced test factories must reuse an existing globally current record when a route gate selects one platform-wide. They may create a fallback only when no current record exists, and teardown must not delete another namespace's references.

**Why:** A namespace-specific effective-now terms version became the new platform-wide current version and redirected already-authenticated vendors from unrelated browser projects into terms acceptance.

**How to apply:** For globally ordered records, mirror the production selector, reuse its result, and scope teardown to owned references. Keep future-state fixtures non-current until their intended effective date.

Do not assume independently reusable fixture fields compose into one ownership graph. A namespaced identity can reference a global transactional record whose related vendor differs from the identity's nominal vendor.

**Why:** An authoritative dispute test used an identity's reused order and vendor IDs as though they were guaranteed to belong together, so real vendor ownership correctly rejected the request.

**How to apply:** When an acceptance test depends on ownership across reused records, explicitly bind the transactional record to the test identity for the test and restore the original relation during cleanup.

Stateful E2E suites that share one external API and database must run in a declared sequence even when their factory namespaces differ.

**Why:** Namespaces isolate owned rows, but they do not isolate platform-wide selectors, API capacity, auth rate limits, or records intentionally reused across namespaces. Concurrent Customer and Vendor suites produced repeatable cross-suite failures.

**How to apply:** Put read/checkout acceptance before lifecycle suites that mutate vendor, terms, catalogue, order, or payout state. Express the order with CI job dependencies rather than relying on runner timing.

Factory-backed browser tests must budget enough time for provisioning and cleanup outside the normal UI assertion timeout. Do not rely solely on a test-local `finally` for cleanup after a Playwright timeout.

**Why:** A test that serially provisioned several checkout scenarios hit the default 30-second timeout. Playwright interrupted its local cleanup and left namespaced users and a vendor behind even though the test had a `finally` block.

**How to apply:** Give multi-scenario provisioning tests an explicit timeout based on measured setup/teardown time, and retain a namespace-scoped teardown command that can run independently after cancellation or runner timeout.

Derived fixture keys must retain namespace uniqueness even when database length limits require truncation. Include a stable hash of the full namespace rather than relying on a readable prefix alone.

**Why:** Truncating the leading characters of similarly prefixed namespaces made separate reverse-propagation runs reuse one order number, so a new customer inherited an older customer's order and correctly failed ownership checks.

**How to apply:** Build compact external IDs from a short readable prefix plus a deterministic hash of the complete namespace. Add the state only after the hash.

Auth teardown must be idempotent across database-only, already-deleted, and fully linked identities. Treat only provider-confirmed not-found responses as already clean.

**Why:** Cleanup legitimately encountered a database user ID with no remaining Auth user and failed after every test assertion had passed.

**How to apply:** Ignore Auth deletion 404/user-not-found responses, but surface every other provider error so cleanup cannot silently mask permission or service failures.