---
name: Live link-audit concurrency
description: Why the runtime internal-link crawler must avoid unbounded requests against cold Next development servers.
---

Keep runtime link-audit concurrency capped and allow a generous timeout for each redirect hop.

**Why:** Launching requests for every discovered route at once overwhelmed cold Web, Vendor, and Admin Next development servers. Compilation pushed all requests past a short timeout, producing an abort storm that looked like every link was broken even though the same targets passed with a small worker pool.

**How to apply:** When changing the live audit or its CI job, preserve bounded workers and enough time for cold route compilation. Validate the settings against freshly started app servers, not only warm local workflows.

For a time-boxed, one-run suite audit, prioritize the required authenticated matrices over supplementary browser crawls. Do not infer route passes from setup logins or HTTP 200 responses. Persist supplementary records incrementally rather than only when an entire traversal returns.

**Why:** On 2 October 2026, several cold Next development processes and other workspace services left about 313 MiB available on a 16 GiB host, without swap. Chromium context/page setup stalled, while later matrix projects exhausted their run budget. Kernel OOM counters were zero; do not claim an OOM kill or attribute earlier failures to this later observation.

**How to apply:** Check available memory before launching an additional browser. Avoid competing crawls while the required suite is running, preserve partial route evidence on interruption, and report unexecuted matrices as unknown rather than broken.