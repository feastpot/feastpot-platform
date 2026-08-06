---
name: P3009 migration failure recovery in production
description: Two-pattern playbook for resolving Prisma P3009 (failed migration blocks all deploys), covering both "nothing applied" and "objects already exist" cases.
---

# P3009 - migration failed, future deploys blocked

Prisma records a started-but-failed migration in `_prisma_migrations` and refuses all subsequent `migrate deploy` calls until it is resolved.

## Diagnosis first

```sql
-- Always run against PROD_DIRECT_URL, never PROD_DATABASE_URL (wrong region)
SELECT migration_name, applied_steps_count, finished_at, rolled_back_at, logs
FROM _prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL
ORDER BY started_at DESC;
```

Then check whether the objects actually exist:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (...);
SELECT typname FROM pg_type WHERE lower(typname) IN (...);
```

## Pattern A - nothing was applied (applied_steps_count = 0, objects absent)

The migration ran inside a transaction that rolled back. Objects are NOT in the DB.

1. Fix the migration SQL (e.g. TEXT → UUID to match `@db.Uuid` in the Prisma schema).
2. Mark as rolled-back so Prisma will re-apply the corrected SQL:
   ```sql
   UPDATE _prisma_migrations
   SET rolled_back_at = now()
   WHERE migration_name = '<name>' AND finished_at IS NULL;
   ```
3. Commit + push the corrected SQL. CI `migrate deploy` re-applies it.

## Pattern B - objects exist but migration is untracked (applied_steps_count = 0, objects present)

Objects were created outside Prisma (direct SQL, manual task). Migration was attempted later and failed because types/tables already exist.

1. Do NOT roll back - re-running the SQL would still fail.
2. Mark as applied so Prisma skips it:
   ```sql
   UPDATE _prisma_migrations
   SET finished_at = now(), applied_steps_count = 1, rolled_back_at = NULL
   WHERE migration_name = '<name>' AND finished_at IS NULL;
   ```
3. Push an empty commit (`git commit --allow-empty`) to trigger CI.

## Why `prisma migrate resolve` often fails here

`prisma migrate resolve --rolled-back <name>` uses the `DATABASE_URL`/`DIRECT_URL` env vars. In this repo, Replit injects those secrets before inline shell assignments, so `DATABASE_URL="$PROD_DIRECT_URL" npx prisma...` still targets whatever the injected `DATABASE_URL` secret holds (which is the wrong region). **The direct psql UPDATE is always the reliable fallback.**

## Common root cause: hand-written SQL doesn't match @db annotations

When you hand-write a migration (as required for dev - see `prisma-migrations-dev.md`), always check Prisma schema `@db.*` attributes:
- `@db.Uuid` → column must be `UUID`, NOT `TEXT`
- `@db.VarChar(n)` → `VARCHAR(n)`, not `TEXT`

The Prisma schema is authoritative; the migration SQL must match it or the FK constraint will fail with error 42804 (datatype mismatch) at deploy time.
