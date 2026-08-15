---
name: db push missing migrations
description: Columns added via db push without migration files break CI fresh-postgres runs
---

**Problem:** Any column added to the Supabase dev DB via `prisma db push` (rather than
a versioned migration) exists on dev/prod but not in any `prisma/migrations/*.sql` file.
CI runs `prisma migrate deploy` against a throwaway fresh postgres that only has the
migration files — so those columns are missing and any migration that references them
(UPDATE, ALTER TABLE … USING …, etc.) fails with error code 42703.

**Known incident:** `vendors.featured_dishes` was added via `db push` and referenced
in `20260813220000_vendor_slug_redirects` — fixed by inserting migration
`20260813210000_add_featured_dishes_column` with `ADD COLUMN IF NOT EXISTS`.

**How to apply:**
- When writing a migration that UPDATEs or references an existing column, grep
  `prisma/migrations/` to confirm a prior migration adds that column.
- If the column was added via db push, insert a new migration with a timestamp
  just before the referencing migration that does `ADD COLUMN IF NOT EXISTS`.
  Using IF NOT EXISTS makes it a no-op on dev/prod where the column already exists.
- New migrations should never be inserted between migrations that are already applied
  on prod unless you also update their checksums in `_prisma_migrations`.

**Why:** The intermediate-timestamp approach is safe because Prisma applies migrations
in timestamp order and skips already-applied ones.  A new migration inserted before
an already-applied one will run once on environments that haven't applied it yet (CI,
new dev setups) and be skipped on environments where the column already exists.
