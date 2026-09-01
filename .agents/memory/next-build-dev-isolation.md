---
name: Next build and dev isolation
description: Why Next.js production builds and live development workflows must not run concurrently in this monorepo.
---

Do not run a Next.js production build while the same app's development workflow is live. Stop or isolate one process first, then restart the development workflow before browser tests.

**Why:** Both processes write to the same `.next` directory. Concurrent execution corrupted the React client manifest and vendor chunks, producing intermittent 500 responses and misleading Playwright “element not found” failures even though the application code and tests were correct.

**How to apply:** Run static type and lint checks beside the live workflow, but serialize production builds with the dev workflow. After any accidental overlap, restart the affected workflow before interpreting browser-test results.