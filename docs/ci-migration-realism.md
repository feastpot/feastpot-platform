# CI Migration Realism

## Decision: Option B : Vanilla Postgres + Bootstrap Roles

The `prisma-validate` CI job uses a vanilla Postgres 16 service container rather
than `supabase start` (which would require the Docker-in-Docker or Supabase CLI
setup). This decision is recorded here because the trade-off must be revisited
whenever a new migration references a Supabase-specific object.

### Why option B is safe today

All migrations in `prisma/migrations/` have been audited:

- **No `auth.*` function calls** : none of the migration files call `auth.uid()`,
  `auth.role()`, or any other function from the Supabase `auth` schema.
- **No `auth` schema objects** : no migration creates tables, types, or policies
  that depend on `auth.*`.
- **RLS policies** use `USING (false)` / `WITH CHECK (false)` deny-all patterns
  (anon + authenticated) that require no Supabase extensions.

The CI job creates the four Postgres roles that migrations `GRANT` to:

```sql
CREATE ROLE anon         NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role  NOLOGIN;
CREATE ROLE supabase_auth_admin NOLOGIN;
```

This is sufficient for a faithful replay of the full migration history from scratch.

### When to revisit

Switch to option A (`supabase start`) if any migration ever:

- Calls `auth.uid()`, `auth.role()`, or any `auth.*` function in an RLS policy
- Creates a trigger or function that depends on Supabase internal schemas
- Grants privileges to `supabase_realtime`, `supabase_storage_admin`, or similar
  Supabase-managed roles beyond the four listed above

### Shadow database

The drift-check step (`prisma migrate diff --from-migrations --to-schema-datamodel`)
requires an empty shadow database. The CI job creates it explicitly:

```sql
CREATE DATABASE feastpot_shadow;
```

Because the vanilla Postgres service user does not have `CREATEDB` by default,
this step runs as a separate `psql` command after the service is healthy. See
`.github/workflows/ci.yml` (the `Create shadow database for drift check` step).
