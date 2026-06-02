#!/usr/bin/env bash
# Production migration runner.
#
# Order of operations (and why):
#   1. PRE-FLIGHT: pick the DB URL for the RLS step and verify psql can
#      actually reach the host. We do this BEFORE running migrations so
#      a stale DIRECT_URL cannot leave us in a half-state where the
#      schema is migrated but `npm run start:api` never runs because the
#      RLS lockdown step aborts the deploy.
#   2. SELF-HEAL: mark the legacy `20260516120000_add_scale_indexes`
#      migration rolled-back if it is stuck in a `failed` state in
#      `_prisma_migrations`. That migration first shipped with
#      `CREATE INDEX CONCURRENTLY` inside Prisma's wrapping transaction
#      (Postgres SQLSTATE 25001); the replacement drops CONCURRENTLY and
#      prepends `DROP INDEX IF EXISTS`. The resolve call is a no-op
#      (and exits non-zero) when the migration is not failed, so we
#      tolerate failure on that specific call.
#   3. `prisma migrate deploy` (must succeed).
#   4. RLS lockdown via psql. Prisma creates tables with RLS disabled by
#      default which exposes them through Supabase's auto-generated
#      PostgREST API to anyone holding the anon key. Our backend uses a
#      role that bypasses RLS, so enabling RLS with no policies =
#      deny-by-default for anon/authenticated, safely.
set -u
SCHEMA="prisma/schema.prisma"
STUCK_MIGRATION="20260516120000_add_scale_indexes"

# ---------------------------------------------------------------------------
# 1. Pre-flight: pick + verify the DB URL used for the RLS step.
# ---------------------------------------------------------------------------
# Supabase rotates/deprecates the legacy direct-connection host
# (db.<ref>.supabase.co), which can leave a previously-good DIRECT_URL pointing
# at a host that no longer resolves. Rather than trust a fixed priority and
# abort on the first stale var, we PROBE each candidate and use the FIRST that
# psql can actually connect to. This self-heals across Supabase host rotations
# instead of crash-looping the deploy.
#
# Candidate order favours SUPABASE_DIRECT_URL because that is exactly the var
# Prisma uses for `directUrl` in schema.prisma, so the RLS step and
# `prisma migrate deploy` stay on the same connection.
#
# DATABASE_URL is intentionally NOT a candidate: in this project it points at
# the Replit built-in 'helium' database, NOT Supabase, so running the RLS
# lockdown through it would target the wrong database.
if ! command -v psql >/dev/null 2>&1; then
  echo "[db-deploy] FATAL: psql not found on PATH. Cannot run RLS lockdown."
  echo "[db-deploy] Aborting before migrations to avoid a migrated-but-locked-out state."
  exit 127
fi

DB_URL=""; DB_URL_SOURCE=""
for _candidate in SUPABASE_DIRECT_URL DIRECT_URL; do
  _val="${!_candidate:-}"
  [ -z "$_val" ] && continue
  _host="$(printf '%s' "$_val" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')"
  echo "[db-deploy] Pre-flight: trying \$$_candidate -> host '$_host'..."
  if psql "$_val" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    DB_URL="$_val"; DB_URL_SOURCE="$_candidate"
    echo "[db-deploy] Pre-flight OK: using \$$_candidate (host '$_host')."
    break
  fi
  echo "[db-deploy] \$$_candidate host '$_host' did not connect - trying next candidate."
done

if [ -z "$DB_URL" ]; then
  echo "[db-deploy] FATAL: no usable direct/session DB URL among SUPABASE_DIRECT_URL / DIRECT_URL."
  echo "[db-deploy] (Supabase rotates direct-connection hostnames; the session pooler URL"
  echo "[db-deploy]  'aws-<n>-<region>.pooler.supabase.com:5432' works for psql + migrations.)"
  echo "[db-deploy] Update SUPABASE_DIRECT_URL in the Deployments secrets and redeploy."
  echo "[db-deploy] Aborting before migrations to avoid a migrated-but-API-down state."
  exit 2
fi

# ---------------------------------------------------------------------------
# 2. Self-heal the legacy stuck migration (no-op when not failed).
# ---------------------------------------------------------------------------
echo "[db-deploy] Attempting to mark $STUCK_MIGRATION as rolled-back (no-op if not failed)..."
npx prisma migrate resolve --rolled-back "$STUCK_MIGRATION" --schema="$SCHEMA" || \
  echo "[db-deploy] resolve --rolled-back returned non-zero (expected when migration is not in failed state)."

# ---------------------------------------------------------------------------
# 3. Apply migrations.
# ---------------------------------------------------------------------------
echo "[db-deploy] Running prisma migrate deploy..."
npx prisma migrate deploy --schema="$SCHEMA"
MIGRATE_EXIT=$?
if [ $MIGRATE_EXIT -ne 0 ]; then
  echo "[db-deploy] prisma migrate deploy failed with exit $MIGRATE_EXIT"
  exit $MIGRATE_EXIT
fi

# ---------------------------------------------------------------------------
# 4. RLS lockdown (skipped if no DB_URL was resolved above).
# ---------------------------------------------------------------------------
if [ -n "$DB_URL" ]; then
  echo "[db-deploy] Enabling RLS on any public tables that don't have it (via \$$DB_URL_SOURCE)..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/enable-rls-on-public-tables.sql
else
  echo "[db-deploy] Skipping RLS hardening: no DIRECT_URL / SUPABASE_DIRECT_URL / DATABASE_URL set."
fi
