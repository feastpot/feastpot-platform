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
