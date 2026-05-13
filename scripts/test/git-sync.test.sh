#!/usr/bin/env bash
# Smoke tests for scripts/git-sync.sh.
#
# Pure-local tests — no network, no GITHUB_TOKEN required. We exercise
# only the script's pre-push decision logic by stubbing the
# token-validation curl and the actual `git push`. We verify:
#
#   T1: refuses to run without GITHUB_TOKEN          (exit 2)
#   T2: refuses to run with a dirty working tree     (exit 3)
#   T3: refuses direct main push without override    (exit 5)
#   T4: first-push of a brand-new branch is detected as "ahead"
#       (NOT mis-reported as "Nothing to push") and `git push` is
#       invoked with --set-upstream
#   T5: existing branch with no new commits is correctly reported
#       as "Nothing to push" and `git push` is NOT invoked
#
# Run: bash scripts/test/git-sync.test.sh

set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/git-sync.sh"
[[ -f "$SCRIPT" ]] || { echo "FAIL: cannot find $SCRIPT"; exit 1; }

pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n  -> %s\n' "$1" "$2"; exit 1; }

# Build a sandbox: tmp dir with two git repos (a "remote" bare repo
# and a "local" working repo wired to it as origin), plus a
# stubs/ dir on PATH that fakes `curl` and (optionally) `git push`.
setup_sandbox() {
  local sandbox
  sandbox=$(mktemp -d)
  mkdir -p "${sandbox}/stubs" "${sandbox}/local"

  # Stub curl: pretend the GitHub API returned HTTP 200 with push perm.
  cat > "${sandbox}/stubs/curl" <<'CURL'
#!/usr/bin/env bash
# Find the -o <file> argument and write a fake API response there.
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *)  shift ;;
  esac
done
if [[ -n "$out" ]]; then
  printf '{"name":"feastpot-platform","permissions":{"admin":true,"maintain":true,"push":true,"triage":true,"pull":true}}\n' > "$out"
fi
printf '200'
CURL
  chmod +x "${sandbox}/stubs/curl"

  # Bare "remote" repo
  git init -q --bare "${sandbox}/remote.git"

  # Local working repo with one commit on main, pushed to origin.
  (
    cd "${sandbox}/local"
    git init -q -b main
    git config user.email "test@example.com"
    git config user.name  "Test"
    echo "hello" > README.md
    git add README.md
    git -c commit.gpgsign=false commit -q -m "initial"
    git remote add origin "${sandbox}/remote.git"
    git push -q origin main
  ) >/dev/null

  echo "${sandbox}"
}

run_script() {
  local sandbox="$1"; shift
  (
    cd "${sandbox}/local"
    PATH="${sandbox}/stubs:$PATH" \
      GITHUB_TOKEN="${GITHUB_TOKEN:-fake}" \
      REMOTE_URL_OVERRIDE="${sandbox}/remote.git" \
      "$@" \
      bash "$SCRIPT"
  )
}

echo "git-sync.sh smoke tests"

# ---- T1: missing GITHUB_TOKEN -> exit 2 -------------------------------
SANDBOX=$(setup_sandbox)
set +e
output=$( cd "${SANDBOX}/local" && env -u GITHUB_TOKEN bash "$SCRIPT" 2>&1 )
code=$?
set -e
[[ $code -eq 2 ]] || fail "T1 missing GITHUB_TOKEN" "expected exit 2, got $code. Output: $output"
pass "T1 refuses without GITHUB_TOKEN (exit 2)"
rm -rf "$SANDBOX"

# ---- T2: dirty working tree -> exit 3 ---------------------------------
# Use a feature branch so the main-refusal guard (T3) doesn't fire first.
SANDBOX=$(setup_sandbox)
( cd "${SANDBOX}/local" && git checkout -q -b feature/dirty ) >/dev/null
echo "uncommitted" >> "${SANDBOX}/local/README.md"
set +e
output=$( run_script "$SANDBOX" 2>&1 )
code=$?
set -e
[[ $code -eq 3 ]] || fail "T2 dirty tree" "expected exit 3, got $code. Output: $output"
pass "T2 refuses dirty working tree (exit 3)"
rm -rf "$SANDBOX"

# ---- T3: direct main push without override -> exit 5 -----------------
SANDBOX=$(setup_sandbox)
set +e
output=$( run_script "$SANDBOX" 2>&1 )
code=$?
set -e
[[ $code -eq 5 ]] || fail "T3 main push refused" "expected exit 5, got $code. Output: $output"
echo "$output" | grep -q "Refusing to push directly to 'main'" \
  || fail "T3 main push refused" "expected refusal message, got: $output"
pass "T3 refuses direct main push without override (exit 5)"
rm -rf "$SANDBOX"

# ---- T4: first push of a new branch is detected, push runs ----------
SANDBOX=$(setup_sandbox)
(
  cd "${SANDBOX}/local"
  git checkout -q -b feature/new
  echo "feature" > feature.txt
  git add feature.txt
  git -c commit.gpgsign=false commit -q -m "feat: add feature"
) >/dev/null
set +e
output=$( run_script "$SANDBOX" 2>&1 )
code=$?
set -e
[[ $code -eq 0 ]] || fail "T4 first push" "expected exit 0, got $code. Output: $output"
echo "$output" | grep -q "first push" \
  || fail "T4 first push" "expected 'first push' log line, got: $output"
echo "$output" | grep -qi "Nothing to push" \
  && fail "T4 first push" "must NOT short-circuit as 'Nothing to push'. Output: $output"
# Verify the branch actually landed on the remote
( cd "${SANDBOX}/remote.git" && git show-ref --verify --quiet refs/heads/feature/new ) \
  || fail "T4 first push" "branch was not pushed to remote"
pass "T4 first push of a new branch pushes successfully (no 'nothing to push' bug)"
rm -rf "$SANDBOX"

# ---- T5: up-to-date branch -> "Nothing to push", no push call -------
SANDBOX=$(setup_sandbox)
(
  cd "${SANDBOX}/local"
  git checkout -q -b feature/uptodate
  echo "x" > x.txt; git add x.txt
  git -c commit.gpgsign=false commit -q -m "x"
  git push -q origin feature/uptodate
) >/dev/null
set +e
output=$( run_script "$SANDBOX" 2>&1 )
code=$?
set -e
[[ $code -eq 0 ]] || fail "T5 up-to-date" "expected exit 0, got $code. Output: $output"
echo "$output" | grep -q "Nothing to push" \
  || fail "T5 up-to-date" "expected 'Nothing to push', got: $output"
pass "T5 up-to-date branch correctly short-circuits with 'Nothing to push'"
rm -rf "$SANDBOX"

echo ""
echo "All git-sync.sh smoke tests passed."
