#!/usr/bin/env bash
# Vercel "Ignored Build Step" — exit 0 to SKIP build, exit 1 to PROCEED.
# Configure in Vercel: Project → Settings → Git → Ignored Build Step:
#   bash scripts/vercel-ignore-build.sh
#
# Skips builds when the diff since the LAST SUCCESSFUL deploy touches no
# paths that affect the customer web app. Diffing only HEAD^..HEAD is
# unsafe: a cosmetic commit pushed on top of a real web change would
# incorrectly skip the deploy. We use Vercel's `VERCEL_GIT_PREVIOUS_SHA`
# (the commit of the last successful build) when present and fall back
# to HEAD^ for the very first deploy.

set -e

PATHS=(
  apps/web
  packages
  prisma
  package.json
  package-lock.json
  turbo.json
  vercel.json
  scripts/vercel-ignore-build.sh
)

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -n "$BASE" ] && git cat-file -e "$BASE" 2>/dev/null; then
  echo "vercel-ignore: diffing against last successful deploy $BASE"
elif git rev-parse HEAD^ >/dev/null 2>&1; then
  BASE="HEAD^"
  echo "vercel-ignore: no previous deploy SHA — falling back to HEAD^"
else
  echo "vercel-ignore: no parent commit — building."
  exit 1
fi

if git diff --quiet "$BASE" HEAD -- "${PATHS[@]}"; then
  echo "vercel-ignore: no relevant changes in ${PATHS[*]} — skipping build."
  exit 0
fi

echo "vercel-ignore: relevant changes detected — building."
exit 1
