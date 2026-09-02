---
name: Turbo CI environment filtering
description: Prevent database-backed CI tests from silently skipping when launched through Turbo.
---

CI tests launched through Turbo must allowlist every database environment variable they consume.

**Why:** Turbo's strict environment mode strips undeclared variables from child test processes. Migrations can succeed in an earlier shell step while Jest sees no database URL, silently skips integration suites, and then fails an otherwise valid coverage baseline.

**How to apply:** When a CI job supplies a new environment variable to a Turbo-managed task, add it to Turbo's environment allowlist and confirm it appears under `globalCacheInputs.environmentVariables.specified.env` in a Turbo dry run.