# Runbook - Move production onto a dedicated Supabase project

Production currently shares ONE Supabase project with development
(ref `zibmwuzxgydlvapiddhf`). This caused the 30 Jul 2026 deploy scare and
means a dev mistake can touch live data. This runbook moves production onto
its own project with minimal downtime.

**Owner steps are marked 🧑 (needs the Supabase/Replit dashboards); everything
else can be run by the agent from the workspace once secrets are provided.**

---

## 0. Preconditions

- Pick a low-traffic window (recommended: weekday 02:00–04:00 UK, avoiding
  Monday 02:00 - that's the payout batch).
- Announce a short maintenance window on the status page if available.

## 1. 🧑 Provision the new project

1. Supabase dashboard → New project, **region: London (eu-west-2)** or another
   UK/EU region, plan with **daily backups / PITR** enabled.
2. Note the new project ref (`<NEWREF>`), database password, and from
   Project Settings → API: the project URL, `anon` key and `service_role` key.
3. Do NOT touch the old project.

## 2. 🧑 Hand over the new secrets

Add to the workspace (temporarily, for the migration) as Replit Secrets:

- `NEW_SUPABASE_URL` = `https://<NEWREF>.supabase.co`
- `NEW_SUPABASE_DB_URL` = session-pooler URL (port 5432,
  `postgres.<NEWREF>@aws-…pooler.supabase.com`) - Database → Connection string
  → Session mode
- `NEW_SUPABASE_ANON_KEY`, `NEW_SUPABASE_SERVICE_ROLE_KEY`

## 3. Write freeze + consistent copy (agent-runnable, INSIDE the window)

**The copy must be a single consistent snapshot.** Two separate dumps taken at
different moments (or a dump while writes continue) will produce `public` rows
referencing `auth` users that don't exist, or silently drop orders placed
mid-copy. Therefore:

1. **Freeze writes first.** Stop the API (Replit deployment → Stop) for the
   window, or put it in maintenance mode. Verify no connections are writing:
   `select count(*) from pg_stat_activity where state <> 'idle';`
2. **One dump run, both schemas, same command** so they share a consistent
   snapshot point:

```bash
pg_dump "$SUPABASE_DIRECT_URL" --schema=public --schema=auth \
  --no-owner --no-privileges --format=custom --file=/tmp/prod-snapshot.dump

# Restore public (schema + data), then auth data only (the auth schema
# already exists in every Supabase project; exclude Supabase-managed
# bookkeeping like auth.schema_migrations via a filtered list):
pg_restore --dbname="$NEW_SUPABASE_DB_URL" --schema=public --no-owner --no-privileges /tmp/prod-snapshot.dump
pg_restore -l /tmp/prod-snapshot.dump | grep 'auth\.' | grep -v schema_migrations > /tmp/auth-data.list
pg_restore --dbname="$NEW_SUPABASE_DB_URL" --data-only --disable-triggers -L /tmp/auth-data.list /tmp/prod-snapshot.dump
```

3. **Validate the restore before cutover** (step 6's row-count and login
   checks) - the API stays stopped until validation passes.

Notes:

- `auth.users` restore preserves user ids, so all `public.users` FK links hold.
- The freeze lasts from dump to cutover - budget ~15–30 min. Everything in
  steps 1–2 (project creation, hook SQL prepared, secrets staged) must be done
  BEFORE the freeze starts so the window stays short.

**Rollback:** the old project is untouched throughout. If validation fails at
any point, simply restart the API with the old secrets - zero data was moved
or mutated on the old project. Delete the half-restored new project's data and
retry another day.

## 4. Re-apply the pieces a dump does NOT carry (agent-runnable)

These are project-level, not schema-level (see `.agents/memory/supabase-auth-hook.md`):

1. **Custom access token hook** - create `public.custom_access_token_hook`
   and the RLS policy granting `supabase_auth_admin` SELECT on `public.users`.
   Full SQL + explanation: `docs/supabase-auth-hook.md`.
2. 🧑 Supabase dashboard → Authentication → Hooks → enable the
   **Customize Access Token (JWT)** hook pointing at that function.
3. **RLS enable sweep:**
   `psql "$NEW_SUPABASE_DB_URL" -f scripts/enable-rls-on-public-tables.sql`
   (the same SQL the deploy pipeline runs).
4. 🧑 Authentication → URL configuration: copy the Site URL + redirect URLs
   from the old project.
5. Verify: `npx prisma migrate deploy` against the new DB is a clean no-op,
   and a test login works against the new project (see step 6).

## 5. 🧑 Switch production over (the actual cutover)

In the Replit **deployment** secrets for the API, replace:

- `SUPABASE_URL` → `https://<NEWREF>.supabase.co`
- `SUPABASE_DB_URL`, `SUPABASE_DIRECT_URL`, `DIRECT_URL` → new pooler URLs
- `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` → new keys
- `REQUIRE_DEDICATED_SUPABASE` → `true` (makes the startup guard enforcing)

In **Vercel** (all three frontends): `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` → new values; redeploy.

Republish the API. The write freeze from step 3 stays in effect until this
republish completes - no orders can be placed against the old database after
the snapshot, so nothing is lost in the gap.

## 6. Verify

- `https://api.feastpot.co.uk/v1/healthz` → `supabase.ref` = `<NEWREF>`,
  `environment: "production"`, no `DEV_REF_IN_PRODUCTION` warning.
- Log in as a customer, a vendor, and an admin (JWT role claims come from the
  auth hook - if logins 500, revisit step 4.1/4.2).
- Place a test order end-to-end.
- Row counts spot-check: `orders`, `users`, `vendors` match old vs new.

## 7. Aftercare

- Old project becomes DEV-ONLY. Rotate its service-role key so leaked prod-era
  keys are dead.
- Remove the temporary `NEW_*` workspace secrets.
- Update `.agents/memory/supabase-db-urls.md` and `replit.md`.
- Tick the "Production Supabase project" box in `LAUNCH_CHECKLIST.md`.
