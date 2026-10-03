---
name: Redis queue isolation
description: Development and production can share Bull queues despite separate PostgreSQL databases.
---

Treat workspace Redis as potentially production-shared until queue isolation is demonstrated.

**Why:** Read-only workspace queue inspection matched production health counts, and production logs contained test-factory notification jobs. Separate development and production PostgreSQL databases did not isolate queue state.

**How to apply:** Require a dedicated Redis instance or verified environment-specific queue namespace before credentialed integration tests or test queue operations. Do not infer queue isolation from the database connection, NODE_ENV, or a fixture namespace in a job ID. Preserve existing pause state, and review the backlog before any production resume because it can immediately deliver accumulated messages.