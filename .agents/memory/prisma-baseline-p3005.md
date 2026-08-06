---
name: Prisma baseline / P3005 recovery on shared Supabase DB
description: Why prod deploy crash-loops with P3005 after a db push, and how to baseline the shared DB safely.
---

# Symptom
Prod VM deploy crash-loops: `scripts/db-deploy.sh` → `prisma migrate deploy`
exits with **P3005** ("database schema is not empty"), the stuck-migration
self-heal also errors `Invariant violation: called markMigrationRolledBack on a
database without migrations table`, `start:api` never runs, healthcheck 500s.

# Root cause
`prisma db push` (used to fix dev schema drift) syncs the schema but creates **no
`_prisma_migrations` history**. The shared Supabase DB is then "non-empty but
un-baselined", so `migrate deploy` refuses to run.
**Why it matters:** dev (repl) and prod share ONE Supabase DB, so a db push done
to fix dev login silently breaks the prod deploy. Any new feature migration (T001
style) would also hit P3005 against this DB.

# Recovery - baseline the DB (mark all migrations applied)
The schema already matches `prisma/schema.prisma`, so record every dir in
`prisma/migrations/` as applied:
1. Authoritative + creates the table: `npx prisma migrate resolve --applied <first_migration>`.
2. Batch the rest in one psql round trip - Prisma's checksum == `sha256sum migration.sql`
   (verified equal), so INSERT into `public._prisma_migrations`
   (id=gen_random_uuid()::text, checksum=<sha256>, finished_at=now(), migration_name,
   started_at=now(), applied_steps_count=1) for each remaining dir.
3. Verify: `prisma migrate status` → "Database schema is up to date!";
   `prisma migrate deploy` → "No pending migrations to apply."

**Gotcha:** backgrounded shell jobs (nohup &) die when the bash tool call returns -
run the baseline loop synchronously, or use the one-shot psql INSERT above.

**Prevention:** never `db push` the shared Supabase DB without baselining afterward.
