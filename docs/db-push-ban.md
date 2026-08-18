# Schema change workflow — `db push` is banned on shared databases

## The rule

**Never run `prisma db push` against the development, staging, or production database.**

`db push` silently alters the live database without writing a migration file.
The next time a fresh database is built — CI, a new developer environment, or a
production deploy — the schema is out of sync and migrations fail.

## Approved workflow

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate a versioned migration file
npx prisma migrate dev --name describe_your_change --schema=./prisma/schema.prisma
# 3. Commit both schema.prisma and the new migration folder
```

`migrate dev` writes a timestamped SQL file in `prisma/migrations/`, applies it
to your local database, and regenerates the Prisma client. The migration file is
what CI, new developer environments, and production all use — so the schema is
always reproducible from scratch.

## Why db push fails in production

`prisma migrate deploy` (used in CI and production) compares each migration's
stored checksum against the file on disk. If you edit a migration after it was
applied, Prisma aborts with P3006. If you add a column via `db push` without a
migration, the column is invisible to fresh databases and the next migration that
references it fails with "column does not exist" (P3018).

Both failures require manual database intervention to repair — the very situation
this rule prevents.

## Safe local uses of db push

`db push` is acceptable **only** against a local scratch database that is
thrown away and rebuilt regularly. If you use it, rename the npm script to make
the scope explicit so it is never confused with a shared-environment command.

Suggested naming: `db:push:local-scratch-only` (mapped to `prisma db push` in
`package.json`). This prevents accidental invocation in CI or against shared URLs.

## The drift gate

CI runs `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code`
in the **prisma-validate** job before the test job runs. A non-zero exit means
the migration history does not reproduce `schema.prisma` and the PR cannot merge.

To run the drift check locally:

```bash
# Start a local Postgres instance with the required Supabase roles, then:
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url postgresql://user:pass@localhost:5432/shadow_db \
  --exit-code
```

## Production runbook for checksum repair

If a migration file must be edited after it has been applied (last resort —
prefer a new migration instead), update the stored checksum on **every** affected
database:

```sql
UPDATE _prisma_migrations
SET checksum = '<sha256 of new file content>'
WHERE migration_name = '<migration_name>';
```

Compute the sha256 with:

```bash
sha256sum prisma/migrations/<migration_folder>/migration.sql
```

Apply this to dev, staging, and production databases. After updating checksums,
run `prisma migrate deploy` to apply any pending migrations.

## History

The drift that prompted this document:

| Migration                                   | What happened                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260813210000_add_featured_dishes_column` | Column `featured_dishes` was originally added via `db push`. This migration was written retroactively with `ADD COLUMN IF NOT EXISTS` so fresh databases have the column. |
| `20260813220000_vendor_slug_redirects`      | Originally contained an unrelated `UPDATE vendors SET featured_dishes = '{}'` (concern mixing). The reset was separated into `20260813221000_reset_featured_dishes`.      |
| `20260813221000_reset_featured_dishes`      | Idempotent data reset; logs the count of affected vendors before clearing.                                                                                                |
