#!/usr/bin/env bash
# Vercel "Ignored Build Step" — exit 0 to SKIP build, exit 1 to PROCEED.
#
# Configure per-project in Vercel:
#   Project → Settings → Git → Ignored Build Step:
#     bash scripts/vercel-ignore-build.sh web
#     bash scripts/vercel-ignore-build.sh vendor
#     bash scripts/vercel-ignore-build.sh admin
#
# Skips builds when the diff against the LAST SUCCESSFUL deploy
# (VERCEL_GIT_PREVIOUS_SHA, fallback HEAD^) does not touch the
# selected app or any shared dependency. Diffing only HEAD^..HEAD
# is unsafe: a cosmetic commit on top of a real change would
# incorrectly skip the deploy.

set -e

APP="${1:-web}"

# Paths shared by every Next.js app — any change here must rebuild all.
SHARED_PATHS=(
  packages
  prisma
  package.json
  package-lock.json
  turbo.json
  vercel.json
  scripts/vercel-ignore-build.sh
)

case "$APP" in
  web)    APP_PATHS=(apps/web) ;;
  vendor) APP_PATHS=(apps/vendor) ;;
  admin)  APP_PATHS=(apps/admin) ;;
  *)
    echo "vercel-ignore: unknown app '$APP' — building to be safe."
    exit 1
    ;;
esac

PATHS=("${APP_PATHS[@]}" "${SHARED_PATHS[@]}")

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -n "$BASE" ] && git cat-file -e "$BASE" 2>/dev/null; then
  echo "vercel-ignore[$APP]: diffing against last successful deploy $BASE"
elif git rev-parse HEAD^ >/dev/null 2>&1; then
  BASE="HEAD^"
  echo "vercel-ignore[$APP]: no previous deploy SHA — falling back to HEAD^"
else
  echo "vercel-ignore[$APP]: no parent commit — building."
  exit 1
fi

if git diff --quiet "$BASE" HEAD -- "${PATHS[@]}"; then
  echo "vercel-ignore[$APP]: no relevant changes in ${PATHS[*]} — skipping build."
  exit 0
fi

echo "vercel-ignore[$APP]: relevant changes detected — building."
exit 1
