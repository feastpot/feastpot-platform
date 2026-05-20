#!/usr/bin/env bash
# Production migration runner.
#
# Wraps `prisma migrate deploy` with a self-heal step for the
# `20260516120000_add_scale_indexes` migration that previously got stuck
# in a `failed` state in `_prisma_migrations` because its first version
# used `CREATE INDEX CONCURRENTLY` inside Prisma's wrapping transaction
# (Postgres SQLSTATE 25001). The replacement migration drops CONCURRENTLY
# and prepends `DROP INDEX IF EXISTS` to clean up any INVALID leftovers.
#
# `prisma migrate resolve --rolled-back` is a no-op (and exits non-zero)
# when the migration is not in a failed state, so we tolerate failure on
# that specific call. `prisma migrate deploy` afterwards must succeed.
set -u
SCHEMA="prisma/schema.prisma"
STUCK_MIGRATION="20260516120000_add_scale_indexes"

echo "[db-deploy] Attempting to mark $STUCK_MIGRATION as rolled-back (no-op if not failed)..."
npx prisma migrate resolve --rolled-back "$STUCK_MIGRATION" --schema="$SCHEMA" || \
  echo "[db-deploy] resolve --rolled-back returned non-zero (expected when migration is not in failed state)."

echo "[db-deploy] Running prisma migrate deploy..."
npx prisma migrate deploy --schema="$SCHEMA"
MIGRATE_EXIT=$?
if [ $MIGRATE_EXIT -ne 0 ]; then
  echo "[db-deploy] prisma migrate deploy failed with exit $MIGRATE_EXIT"
  exit $MIGRATE_EXIT
fi

# Lock down any newly-created public tables. Prisma creates tables with
# RLS disabled by default, which exposes them through Supabase's
# auto-generated PostgREST API to anyone holding the anon key. Our
# backend uses a role that bypasses RLS, so enabling RLS with no
# policies = deny-by-default for anon/authenticated, safely.
DB_URL="${DIRECT_URL:-${SUPABASE_DIRECT_URL:-${DATABASE_URL:-}}}"
if [ -n "$DB_URL" ]; then
  echo "[db-deploy] Enabling RLS on any public tables that don't have it..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/enable-rls-on-public-tables.sql
else
  echo "[db-deploy] Skipping RLS hardening: no DIRECT_URL / SUPABASE_DIRECT_URL / DATABASE_URL set."
fi
