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
# Resolve the URL and ALSO record which variable name we picked, so a future
# Supabase host rotation is obvious in the deploy logs (no more guessing
# which of three env vars is stale).
if [ -n "${DIRECT_URL:-}" ]; then
  DB_URL="$DIRECT_URL"; DB_URL_SOURCE="DIRECT_URL"
elif [ -n "${SUPABASE_DIRECT_URL:-}" ]; then
  DB_URL="$SUPABASE_DIRECT_URL"; DB_URL_SOURCE="SUPABASE_DIRECT_URL"
elif [ -n "${DATABASE_URL:-}" ]; then
  DB_URL="$DATABASE_URL"; DB_URL_SOURCE="DATABASE_URL"
else
  DB_URL=""; DB_URL_SOURCE=""
fi

if [ -z "$DB_URL" ]; then
  echo "[db-deploy] WARNING: no DIRECT_URL / SUPABASE_DIRECT_URL / DATABASE_URL set."
  echo "[db-deploy] RLS lockdown step will be SKIPPED at the end."
  echo "[db-deploy] (Prisma still uses its own DATABASE_URL from schema.prisma.)"
else
  # Extract just the hostname so we never echo the password.
  DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')"
  echo "[db-deploy] RLS step will use \$$DB_URL_SOURCE -> host '$DB_HOST'."

  if ! command -v psql >/dev/null 2>&1; then
    echo "[db-deploy] FATAL: psql not found on PATH. Cannot run RLS lockdown."
    echo "[db-deploy] Aborting before migrations to avoid a migrated-but-locked-out state."
    exit 127
  fi

  echo "[db-deploy] Pre-flight: verifying psql can reach '$DB_HOST'..."
  if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    echo "[db-deploy] FATAL: psql cannot connect using \$$DB_URL_SOURCE."
    echo "[db-deploy] Most likely the host '$DB_HOST' no longer resolves"
    echo "[db-deploy] (Supabase rotates direct-connection hostnames; pooler URLs work fine for psql too)."
    echo "[db-deploy] Update \$$DB_URL_SOURCE in the Deployments secrets and redeploy."
    echo "[db-deploy] Aborting before migrations to avoid a migrated-but-API-down state."
    exit 2
  fi
  echo "[db-deploy] Pre-flight OK."
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
