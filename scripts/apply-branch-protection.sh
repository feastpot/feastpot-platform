#!/usr/bin/env bash
# apply-branch-protection.sh — push the committed branch-protection
# config at .github/branch-protection.main.json to GitHub, then read
# it back and verify it landed.
#
# WHY THIS EXISTS
# Branch protection drifts: someone toggles a setting in the GitHub
# UI, the JSON in the repo silently disagrees, and nobody notices
# until something breaks. This script is the only blessed way to
# apply the policy — running it is idempotent and self-verifying.
#
# USAGE
#   bash scripts/apply-branch-protection.sh
#   BRANCH=main bash scripts/apply-branch-protection.sh   # default
#
# REQUIRES
#   - $GITHUB_TOKEN with `Administration: write` (fine-grained PAT) or
#     `repo` scope (classic), so it can mutate branch protection.
#
# EXIT CODES
#   0  applied + verified
#   1  generic failure (network, JSON malformed, etc.)
#   2  GITHUB_TOKEN missing
#   3  payload file missing
#   4  GitHub rejected the apply call
#   5  apply succeeded but readback did not match

set -euo pipefail

readonly REPO_SLUG="feastpot/feastpot-platform"
readonly BRANCH="${BRANCH:-main}"
readonly PAYLOAD_FILE=".github/branch-protection.${BRANCH}.json"
readonly API="https://api.github.com/repos/${REPO_SLUG}/branches/${BRANCH}/protection"

log() { printf '[apply-bp] %s\n' "$*"; }
err() { printf '[apply-bp] ERROR: %s\n' "$*" >&2; }

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  err "GITHUB_TOKEN is not set."
  exit 2
fi
if [[ ! -f "${PAYLOAD_FILE}" ]]; then
  err "Payload file not found: ${PAYLOAD_FILE}"
  exit 3
fi

# Validate JSON before we ship it to GitHub — a stray comma here
# would otherwise produce a confusing 422.
if ! python3 -c "import json,sys; json.load(open('${PAYLOAD_FILE}'))" 2>/dev/null; then
  err "Payload file is not valid JSON: ${PAYLOAD_FILE}"
  exit 1
fi

log "Applying ${PAYLOAD_FILE} to ${REPO_SLUG} branch ${BRANCH}..."
http_code=$(curl -sS -o /tmp/apply-bp-resp.json -w "%{http_code}" \
  -X PUT \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  --data @"${PAYLOAD_FILE}" \
  "${API}")

if [[ "${http_code}" != "200" ]]; then
  err "GitHub returned HTTP ${http_code}. Response:"
  cat /tmp/apply-bp-resp.json >&2
  exit 4
fi
log "Apply OK (HTTP 200). Reading back to verify..."

# Readback — compare every field we set against what GitHub now reports.
curl -sS -o /tmp/apply-bp-readback.json \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "${API}"

python3 - "${PAYLOAD_FILE}" /tmp/apply-bp-readback.json <<'PY'
import json, sys
want = json.load(open(sys.argv[1]))
got  = json.load(open(sys.argv[2]))

def pull(d, *path, default=None):
    cur = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return default
        cur = cur[p]
    return cur

mismatches = []
def check(label, want_val, got_val):
    if want_val != got_val:
        mismatches.append(f"  {label}: want={want_val!r} got={got_val!r}")

check("required_status_checks.contexts (sorted)",
      sorted(pull(want, "required_status_checks", "contexts", default=[])),
      sorted(pull(got,  "required_status_checks", "contexts", default=[])))
check("required_status_checks.strict",
      pull(want, "required_status_checks", "strict"),
      pull(got,  "required_status_checks", "strict"))
check("enforce_admins",
      pull(want, "enforce_admins"),
      pull(got,  "enforce_admins", "enabled"))
check("required_pull_request_reviews.required_approving_review_count",
      pull(want, "required_pull_request_reviews", "required_approving_review_count"),
      pull(got,  "required_pull_request_reviews", "required_approving_review_count"))
check("required_linear_history",
      pull(want, "required_linear_history"),
      pull(got,  "required_linear_history", "enabled"))
check("allow_force_pushes",
      pull(want, "allow_force_pushes"),
      pull(got,  "allow_force_pushes", "enabled"))
check("allow_deletions",
      pull(want, "allow_deletions"),
      pull(got,  "allow_deletions", "enabled"))
check("required_conversation_resolution",
      pull(want, "required_conversation_resolution"),
      pull(got,  "required_conversation_resolution", "enabled"))

if mismatches:
    print("[apply-bp] ERROR: readback does not match payload:", file=sys.stderr)
    for m in mismatches: print(m, file=sys.stderr)
    sys.exit(5)

print("[apply-bp] Readback matches payload on every field. Done.")
PY
