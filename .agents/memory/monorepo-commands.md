---
name: Monorepo commands
description: How to run per-app scripts in the FeastPot npm-workspace + Turborepo monorepo
---

The repo uses **npm workspaces** (root scripts use Turborepo for fan-out). Attached CHECK-FIRST
task prompts frequently say things like `npm run typecheck --filter=@feastpot/admin` — that
`--filter=` form is Turborepo syntax and is NOT how a single app's script is run here.

Run a single app's script with the workspace flag:
`npm run typecheck --workspace=@feastpot/admin` (likewise `dev`, `build`, etc.).

**Why:** following the prompt's `--filter=` verbatim fails/does the wrong thing.
**How to apply:** translate any `--filter=@feastpot/<app>` from a prompt to
`--workspace=@feastpot/<app>`. Root-level `npm run dev|build|typecheck|lint|test|ci` fan out
across all workspaces via turbo.
