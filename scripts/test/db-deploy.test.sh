#!/usr/bin/env bash
# Exercise the production migration gate with local stubs only. No DB access.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/node_modules/.bin" "$TMP/prisma/migrations"
cp "$ROOT/scripts/db-deploy.sh" "$TMP/db-deploy.sh"

cat > "$TMP/bin/psql" <<'STUB'
#!/usr/bin/env bash
set -eu
if [[ " $* " == *" -f "* ]]; then
  echo RLS >> "$CALLS"
  exit "${RLS_EXIT:-0}"
fi
echo PREFLIGHT >> "$CALLS"
exit "${PREFLIGHT_EXIT:-0}"
STUB

cat > "$TMP/node_modules/.bin/prisma" <<'STUB'
#!/usr/bin/env bash
set -eu
[[ "$*" == "migrate deploy --schema=prisma/schema.prisma" ]] || exit 90
echo MIGRATE >> "$CALLS"
exit "${MIGRATE_EXIT_STUB:-0}"
STUB

for launcher in npm npx; do
  cat > "$TMP/bin/$launcher" <<'STUB'
#!/usr/bin/env bash
echo 'Unexpected package-manager launch during startup' >&2
exit 91
STUB
done
chmod +x "$TMP/bin/"* "$TMP/node_modules/.bin/prisma"

run_case() {
  local name="$1" expected_exit="$2" expected_calls="$3"
  shift 3
  : > "$TMP/calls"
  local actual_exit=0
  (
    cd "$TMP"
    env PATH="$TMP/bin:$PATH" CALLS="$TMP/calls" \
      SUPABASE_DIRECT_URL=postgresql://stub.invalid/test DIRECT_URL= \
      "$@" bash db-deploy.sh > "$TMP/output" 2>&1
  ) || actual_exit=$?
  if [[ "$actual_exit" != "$expected_exit" ]] ||
    [[ "$(paste -sd ',' "$TMP/calls")" != "$expected_calls" ]]; then
    echo "FAIL: $name (exit $actual_exit, expected $expected_exit)"
    cat "$TMP/output" "$TMP/calls"
    exit 1
  fi
  echo "PASS: $name"
}

run_case 'preflight, migrations and RLS retain their order' 0 'PREFLIGHT,MIGRATE,RLS'
run_case 'failed preflight prevents migrations and RLS' 2 'PREFLIGHT' PREFLIGHT_EXIT=1
run_case 'failed migrations prevent RLS and propagate failure' 7 'PREFLIGHT,MIGRATE' MIGRATE_EXIT_STUB=7
run_case 'RLS failure still blocks API startup' 8 'PREFLIGHT,MIGRATE,RLS' RLS_EXIT=8