---
name: Supabase DB connection URLs (deploy gotchas)
description: Which DB URL secret to use for migrations vs runtime, and why deploys crash-loop after Supabase rotates the direct host.
---

# Supabase connection URLs in this repo

Four DB URL secrets exist; they are NOT interchangeable:

- `SUPABASE_DB_URL` — runtime pooled connection (transaction pooler, port **6543**, pgbouncer). Prisma `url`. Works for the app; `psql SELECT 1` against it can FAIL (pgbouncer transaction mode) — that's expected, not a problem.
- `SUPABASE_DIRECT_URL` — **session pooler** (`aws-<n>-<region>.pooler.supabase.com:5432`). Prisma `directUrl`. This is the one that works for migrations AND psql. **Prefer this for any migration/RLS/psql step.**
- `DIRECT_URL` — legacy **direct** host (`db.<ref>.supabase.co`). Supabase rotates/deprecates this IPv4 direct host, so it silently STOPS RESOLVING and breaks deploys. Treat as optional/stale fallback.
- `DATABASE_URL` — points at Replit's built-in **`helium`** Postgres, **NOT Supabase**. Never use it for Supabase migrations/RLS or you target the wrong DB.

## Why deploys crash-loop
**Rule:** the VM run command is `npm run db:deploy && npm run start:api`; if `db:deploy` (scripts/db-deploy.sh) aborts, `start:api` never runs → API down → crash loop → `*.replit.app` returns 500.

**Why:** db-deploy.sh preflights a DB URL with `psql SELECT 1` and aborts before migrating. When it trusted a fixed priority that put the stale `DIRECT_URL` first, a Supabase direct-host rotation took the whole API down even though `SUPABASE_DIRECT_URL` was fine.

**How to apply:** the preflight now PROBES `[SUPABASE_DIRECT_URL, DIRECT_URL]` and uses the first that actually connects (DATABASE_URL excluded — wrong DB). If a future deploy crash-loops with "[db-deploy] FATAL ... no usable direct/session DB URL", fix `SUPABASE_DIRECT_URL` to the current Supabase **session pooler** string (port 5432) and redeploy. Prod env/secret changes require a redeploy to take effect.

## GitHub Actions: env var NAMES must match the schema
`prisma/schema.prisma` datasource reads `env("SUPABASE_DB_URL")` (url) and `env("SUPABASE_DIRECT_URL")` (directUrl). **Rule:** any CI/CD job that runs `prisma migrate deploy` (or otherwise resolves the datasource) MUST export those exact names — map whatever secret holds the connection string (e.g. `PROD_DATABASE_URL`→`SUPABASE_DB_URL`, `PROD_DIRECT_URL`→`SUPABASE_DIRECT_URL`) onto them.

**Why:** exporting `DATABASE_URL`/`DIRECT_URL` (even with valid connection strings) makes Prisma abort at **P1012 "Environment variable not found: SUPABASE_DIRECT_URL"** during schema validation, *before* it ever connects. Symptom: the migrate job fails instantly with exit 1 and all downstream deploy jobs skip, yet the DB is reachable and the pending migration may already be applied from an older run — so the prod schema looks fine while every deploy stays red.

**How to apply:** if a deploy/CI run dies with P1012 on a `*_URL` var, grep the workflow's `env:` block and rename the keys to the `SUPABASE_*` names the schema reads; pooled URL → `url`, direct/session URL → `directUrl` (migrate uses `directUrl`). `nightly-smoke.yml` is the reference template.

**Prod access (Jul 2026):** `PROD_DIRECT_URL` fixed Jul 30 (was stale-password; user re-entered from PROD_DATABASE_URL's password). For psql on `PROD_DATABASE_URL`, strip its query params (`pgbouncer`, `connection_limit`). `prisma migrate diff --from-url` hangs against the prod pooler — verify schema drift with targeted psql checks instead. Pooler auth errors always say user "postgres" even when the URL user is `postgres.<ref>` — that means wrong password, not wrong username.
