---
name: db push missing migrations
description: Columns added via db push without migration files break CI fresh-postgres runs; drift gate now in CI prisma-validate job
---

**Problem:** Any column added to the Supabase dev DB via `prisma db push` (rather than
a versioned migration) exists on dev/prod but not in any `prisma/migrations/*.sql` file.
CI runs `prisma migrate deploy` against a throwaway fresh postgres that only has the
migration files — so those columns are missing and any migration that references them
(UPDATE, ALTER TABLE … USING …, etc.) fails with error code 42703.

**Known incident:** `vendors.featured_dishes` was added via `db push` and referenced
in `20260813220000_vendor_slug_redirects` — fixed by inserting migration
`20260813210000_add_featured_dishes_column` with `ADD COLUMN IF NOT EXISTS`.
The related data reset was then separated into `20260813221000_reset_featured_dishes`
to keep each migration single-purpose.

**Drift gate (CI):** `prisma-validate` job runs `prisma migrate diff --from-migrations
--to-schema-datamodel --exit-code` against a shadow postgres before the test job runs.
Any future drift now fails the PR before migrations are even applied to the test DB.
The shadow DB needs Postgres roles at the cluster level:
`anon`, `authenticated`, `service_role`, `supabase_auth_admin` (created in the same job step).

**Checksum repair pattern:** If a migration file must be changed after it is applied,
update `_prisma_migrations.checksum` on EVERY affected database:
```sql
UPDATE _prisma_migrations
SET checksum = '<sha256sum of new file content>'
WHERE migration_name = '<migration_name>';
```
Compute with `sha256sum prisma/migrations/<folder>/migration.sql`.

**Production note:** After splitting `20260813220000`, prod's stored checksum for that
migration (`c1b5c5329fc4ffc69419934e942f014e49879074dcbcfeec07af17047c3b6362`) will not
match the edited file (`a8f727f2f0f9f57050c27fa613d67c5deeb01aaa58ade0ca03690bce4150ff15`).
Prod needs the checksum updated before the next `migrate deploy` or it will fail P3006.
See docs/db-push-ban.md for the full runbook.

**How to apply:**
- When writing a migration that UPDATEs or references an existing column, grep
  `prisma/migrations/` to confirm a prior migration adds that column.
- If the column was added via db push, insert a new migration with a timestamp
  just before the referencing migration that does `ADD COLUMN IF NOT EXISTS`.
  Using IF NOT EXISTS makes it a no-op on dev/prod where the column already exists.
- Never insert a migration between already-applied ones on prod without also updating
  their checksums in `_prisma_migrations`.
- One migration, one concern. Data resets go in a separate migration from DDL.

**Why:** The intermediate-timestamp approach is safe because Prisma applies migrations
in timestamp order and skips already-applied ones. A new migration inserted before
an already-applied one will run once on environments that haven't applied it yet (CI,
new dev setups) and be skipped on environments where the column already exists.
