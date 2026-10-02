---
name: Monorepo commands
description: How to run per-app scripts in the FeastPot npm-workspace + Turborepo monorepo
---

The repo uses **npm workspaces** (root scripts use Turborepo for fan-out). Attached CHECK-FIRST
task prompts frequently say things like `npm run typecheck --filter=@feastpot/admin` - that
`--filter=` form is Turborepo syntax and is NOT how a single app's script is run here.

Run a single app's script with the workspace flag:
`npm run typecheck --workspace=@feastpot/admin` (likewise `dev`, `build`, etc.).

**Why:** following the prompt's `--filter=` verbatim fails/does the wrong thing.
**How to apply:** translate any `--filter=@feastpot/<app>` from a prompt to
`--workspace=@feastpot/<app>`. Root-level `npm run dev|build|typecheck|lint|test|ci` fan out
across all workspaces via turbo.

## Keep unit verification separate from shared-database integration tests

Do not launch the default API test command with ambient workspace service credentials unless shared-database integration testing is intended.

**Why:** Direct npm execution inherits Supabase credentials and automatically enables integration suites that the isolated CI unit job skips. This can write test records to the shared development database and make a unit check wait on remote services.

**How to apply:** Use a credentials-free child environment for CI-equivalent unit verification. Run credentialed integration suites explicitly, with a dedicated factory namespace and the intended database.
