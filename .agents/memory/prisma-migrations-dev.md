---
name: Prisma migrations against the dev Supabase DB
description: How to add a schema migration in this repo - dev DB isn't fully baselined, RLS is applied centrally not per-migration. db push is banned.
---

# Applying a new Prisma migration in this repo

**The rule:** Schema changes MUST go through `prisma migrate dev` (produces a migration
file) — never `prisma db push` against shared databases. `db push` leaves no migration
file, causing CI and fresh installs to fail. See `docs/db-push-ban.md`.

**Why this is fiddly:** the DEV Supabase DB is NOT tracked in `_prisma_migrations`
(it was evolved by direct SQL, not `migrate deploy`). So in dev:
- `prisma migrate dev` fails - interactive command, the agent shell is non-interactive.
- `prisma migrate deploy` fails with **P3005** ("schema is not empty") because none
  of the ~30 migration folders are recorded as applied.
- `prisma migrate diff --from-migrations` is misleading: the migration *history*
  lags the real schema, so it emits a huge destructive drift (drops/recreates FKs,
  re-adds columns the live DB already has). **Never apply that wholesale.**

**How to apply (dev):**
1. Edit `prisma/schema.prisma`.
2. Hand-write a MINIMAL `prisma/migrations/<ts>_<name>/migration.sql` containing only
   the new objects (match the style of an existing minimal migration like
   `..._add_chargebacks`). You can run `migrate diff` to crib the exact DDL, then
   keep ONLY the statements for your new table/columns.
3. `npx prisma db execute --file <that file> --schema prisma/schema.prisma` (uses
   `directUrl` = `SUPABASE_DIRECT_URL`).
4. `npx prisma generate`.
5. **RLS:** migrations do NOT carry RLS. `scripts/enable-rls-on-public-tables.sql`
   (run by `scripts/db-deploy.sh` in prod) enables deny-by-default RLS on every
   public table lacking it. After `db execute` in dev, run that script so the new
   table is protected like the rest: `psql "$SUPABASE_DIRECT_URL" -f scripts/enable-rls-on-public-tables.sql`.

**Prod** is baselined and uses `npm run db:deploy` (→ `migrate deploy` + the RLS
script), so the committed migration folder is applied there normally.

**Dev DB checksum state (Aug 2026):**
- `20260813220000_vendor_slug_redirects` stored checksum was updated to `a8f727f2…`
  after the migration file was edited (UPDATE moved to 20260813221000).
- `20260813210000_add_featured_dishes_column` is NOT in dev `_prisma_migrations`
  (column was added via db push; migration was written retroactively).

**How to apply:** any time you add a table/column for this project.
