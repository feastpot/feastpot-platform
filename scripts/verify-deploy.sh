#!/usr/bin/env bash
# verify-deploy.sh — automated, repeatable verification that:
#   1. The live legal pages on https://feastpot.co.uk return 200 with
#      the expected post-task content.
#   2. The branch protection on `main` matches the committed payload
#      at .github/branch-protection.main.json.
#
# This is the executable counterpart to docs/git-workflow-verification.md
# — narrative log + this script together = airtight evidence.
#
# USAGE
#   bash scripts/verify-deploy.sh
#
# REQUIRES
#   - curl
#   - python3
#   - $GITHUB_TOKEN (only for the branch-protection check; endpoint
#     probes work anonymously)
#
# EXIT CODES
#   0  all checks passed
#   1  one or more checks failed (details printed)

set -uo pipefail

readonly SITE="https://feastpot.co.uk"
readonly REPO="feastpot/feastpot-platform"

pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n          %s\n' "$1" "$2"; failures=$((failures+1)); }

failures=0

echo "verify-deploy.sh — live endpoint + branch-protection probes"
echo

# ---------- Endpoint probes ----------
probe_endpoint() {
  local path="$1"; shift
  local label="$1"; shift
  # Remaining args: required substrings.
  local url="${SITE}${path}"
  local body
  local code
  body=$(curl -fsSL -A "verify-deploy/1.0" "${url}" 2>/dev/null) || {
    fail "$label" "GET ${url} did not return 2xx"
    return
  }
  for needle in "$@"; do
    if ! grep -qF "$needle" <<<"$body"; then
      fail "$label" "GET ${url} missing required string: ${needle}"
      return
    fi
  done
  code=$(curl -s -o /dev/null -w "%{http_code}" -A "verify-deploy/1.0" "${url}")
  pass "$label (HTTP ${code})"
}

probe_endpoint "/legal/vendor-terms" "vendor-terms" \
  "12% of the order subtotal" "weekly, every Monday" "FHRS"
probe_endpoint "/legal/cookies" "cookies" \
  "feastpot.basket.v1" "sb-access-token"
probe_endpoint "/legal/privacy" "privacy" \
  "C1931679" "ICO Registration"

# ---------- Branch protection check ----------
echo
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "  SKIP  branch-protection check (set GITHUB_TOKEN to enable)"
else
  curl -fsSL -o /tmp/verify-bp.json \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/branches/main/protection" \
    2>/dev/null || {
      fail "branch-protection readback" "GitHub API call failed (token expired or revoked?)"
    }

  if [[ -s /tmp/verify-bp.json ]]; then
    python3 - <<'PY' && pass "branch-protection matches .github/branch-protection.main.json" || {
import json, sys
want = json.load(open(".github/branch-protection.main.json"))
got  = json.load(open("/tmp/verify-bp.json"))
diffs = []
def W(*p, default=None):
    c = want
    for x in p:
        if not isinstance(c, dict) or x not in c: return default
        c = c[x]
    return c
def G(*p, default=None):
    c = got
    for x in p:
        if not isinstance(c, dict) or x not in c: return default
        c = c[x]
    return c
def cmp(label, w, g):
    if w != g: diffs.append(f"{label}: want={w!r} got={g!r}")
cmp("required_status_checks.contexts (sorted)",
    sorted(W("required_status_checks","contexts", default=[])),
    sorted(G("required_status_checks","contexts", default=[])))
cmp("required_status_checks.strict",
    W("required_status_checks","strict"),
    G("required_status_checks","strict"))
cmp("enforce_admins", W("enforce_admins"), G("enforce_admins","enabled"))
cmp("required_pull_request_reviews.required_approving_review_count",
    W("required_pull_request_reviews","required_approving_review_count"),
    G("required_pull_request_reviews","required_approving_review_count"))
cmp("required_pull_request_reviews.dismiss_stale_reviews",
    W("required_pull_request_reviews","dismiss_stale_reviews"),
    G("required_pull_request_reviews","dismiss_stale_reviews"))
cmp("required_linear_history", W("required_linear_history"),
    G("required_linear_history","enabled"))
cmp("allow_force_pushes", W("allow_force_pushes"),
    G("allow_force_pushes","enabled"))
cmp("allow_deletions", W("allow_deletions"),
    G("allow_deletions","enabled"))
cmp("required_conversation_resolution", W("required_conversation_resolution"),
    G("required_conversation_resolution","enabled"))
if diffs:
    for d in diffs: print("    drift:", d, file=sys.stderr)
    sys.exit(1)
PY
      fail "branch-protection matches payload" "drift detected (see above)"
    }
  fi
fi

echo
if [[ $failures -gt 0 ]]; then
  echo "FAILED — ${failures} check(s) did not pass."
  exit 1
fi
echo "All checks passed."
