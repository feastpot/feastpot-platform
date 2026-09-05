---
name: Live link-audit concurrency
description: Why the runtime internal-link crawler must avoid unbounded requests against cold Next development servers.
---

Keep runtime link-audit concurrency capped and allow a generous timeout for each redirect hop.

**Why:** Launching requests for every discovered route at once overwhelmed cold Web, Vendor, and Admin Next development servers. Compilation pushed all requests past a short timeout, producing an abort storm that looked like every link was broken even though the same targets passed with a small worker pool.

**How to apply:** When changing the live audit or its CI job, preserve bounded workers and enough time for cold route compilation. Validate the settings against freshly started app servers, not only warm local workflows.