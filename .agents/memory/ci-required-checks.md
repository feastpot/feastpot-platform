---
name: CI required checks (branch protection)
description: Why the 5 required PR checks were never green and what each one really needs.
---

# CI required checks were unsatisfiable for every PR

Branch protection on `main` requires 5 checks from `.github/workflows/ci.yml`:
`typecheck`, `lint`, `prisma-validate`, `test`, `build`. For a long time NONE of
them could pass, so no PR could merge the normal way (people pushed to `main`
directly / via admin). Root causes found and fixed:

- **`lint` → Prettier step:** `format:check` globs `**/*.{ts,tsx,js,jsx,json,md}`
  with **no `.prettierignore`**, so it scanned `.local/` (agent skills/tasks) and
  `.agents/` (memory) - hundreds of generated files - and always failed. Fix: add
  `.prettierignore` (mirror `.gitignore` + `.local`, `.agents`, `.cache`, etc.),
  then the real source (~350 files, never Prettier-formatted) needs one
  `npm run format`.
- **`prisma-validate`:** `prisma validate`/`format --check` parse the schema which
  references `env("SUPABASE_DB_URL")` / `env("SUPABASE_DIRECT_URL")`; the job had
  no `env:`, so P1012 "Environment variable not found". Fix: give the job dummy
  non-connecting URLs. Also `prisma format --check` failed because the schema was
  unformatted - run `prisma format` once.
- **`test`:** reads `SUPABASE_DB_URL`/`SUPABASE_DIRECT_URL` from repo secrets
  `TEST_DATABASE_URL` / `TEST_DIRECT_URL`, which are **not set** → same P1012 before
  any test runs, then needs ≥70% coverage. This one needs the repo owner to
  provision a throwaway test Postgres and set those two GitHub secrets; the agent
  cannot.

**Why:** the workflows were authored but never actually run to green; the gaps are
environment/CI-config, not product bugs.

**How to apply:** when a FeastPot PR's required checks are red, check these four
causes first before suspecting the PR's own changes. `deploy.yml` runs on push to
main (not PRs) and is NOT one of the required checks.

## eqeqeq is intentional `== null`
Every `eqeqeq` violation in the API is the `x == null` / `x != null` idiom
(matches null AND undefined in one check). Do NOT rewrite to `===` - that changes
behaviour. The shared `packages/config/eslint-base.js` now sets
`eqeqeq: ['error', 'always', { null: 'ignore' }]` to allow exactly this.
