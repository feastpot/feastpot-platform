---
name: Prisma migrations on Supabase (Feastpot)
description: How to create & apply Prisma migrations in this repo's environment, and the RLS rule for new tables.
---

# Creating a Prisma migration here

`npx prisma migrate dev` does NOT work in this environment — it aborts with
"environment is non-interactive". `prisma migrate dev` also needs a shadow DB
the Supabase pooler won't grant.

**Working flow:**
1. Edit `prisma/schema.prisma`.
2. Generate the SQL without a shadow DB:
   `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
   (compares the LIVE db to the desired datamodel).
3. Hand-write the SQL into `prisma/migrations/<UTC-timestamp>_<name>/migration.sql`
   (timestamp format like `20260530000000_...`).
4. Apply with `npx prisma migrate deploy` (no shadow DB, no interactivity), then `npx prisma generate`.

**Why:** `migrate dev` is the documented path but is blocked here; `migrate deploy`
is what `scripts/db-deploy.sh` uses in prod too, so this stays consistent.

**Gotcha — drift in the diff:** `migrate diff` may surface UNRELATED pre-existing
drift (e.g. a `vendors` array-default ALTER). Do NOT include unrelated statements
in your migration — scope the SQL to only your change.

# RLS is mandatory on every new table
**Rule:** every new public table must `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
and `FORCE ROW LEVEL SECURITY;` with NO policies.
**Why:** the API connects as the privileged postgres role (bypasses RLS), but the
Supabase anon/authenticated keys shipped to the frontends would otherwise get
auto-generated PostgREST access. Deny-by-default = enable+force, no policies.
This invariant was set in `20260513000000_enable_rls_all_tables`; prod also
re-applies it via `scripts/enable-rls-on-public-tables.sql` on deploy.

# Datasource
`url=env("SUPABASE_DB_URL")` (pooled), `directUrl=env("SUPABASE_DIRECT_URL")`.
Never run `prisma migrate reset` — it's a shared/persistent DB.
