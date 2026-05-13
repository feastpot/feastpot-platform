#!/usr/bin/env bash
# git-sync.sh — fetch, rebase, and push `main` to GitHub using GITHUB_TOKEN.
#
# WHY THIS EXISTS
# The Replit Git UI authenticates to GitHub via an OAuth session that
# periodically goes stale and returns UNAUTHENTICATED on push, which the
# UI confusingly renders as PUSH_REJECTED. This script bypasses the UI
# entirely: it uses a Personal Access Token (or fine-grained PAT) stored
# in the Replit Secret `GITHUB_TOKEN` and pushes directly over HTTPS.
#
# USAGE
#   bash scripts/git-sync.sh                       # push the CURRENTLY CHECKED-OUT branch
#   BRANCH=feature/x bash scripts/git-sync.sh      # push branch `feature/x` explicitly
#   DRY_RUN=1 bash scripts/git-sync.sh             # show what would happen, do not push
#
# DEFAULT BEHAVIOUR — IMPORTANT
#   This script REFUSES to push to `main` unless ALLOW_MAIN_PUSH=1 is set
#   AND the user types "yes" at the confirmation prompt. The day-to-day
#   path to main is:  feature branch -> PR -> CI green -> review -> merge.
#   Direct main pushes only exist for documented emergencies (see
#   docs/git-workflow.md §4 "Emergency-push escape hatch"). For
#   non-interactive use (agents, CI), set both ALLOW_MAIN_PUSH=1
#   and CONFIRM_MAIN_PUSH=yes to skip the interactive prompt.
#
# REQUIRES
#   - $GITHUB_TOKEN with `repo` scope (write access to feastpot/feastpot-platform).
#   - Working tree must be clean (no uncommitted changes).
#
# EXIT CODES
#   0  success (or dry-run completed)
#   1  generic failure
#   2  GITHUB_TOKEN missing
#   3  working tree dirty
#   4  rebase conflicts — manual resolution required
#   5  refused to push directly to main without explicit override

set -euo pipefail

readonly REPO_SLUG="feastpot/feastpot-platform"
readonly REMOTE="origin"
# Default to the currently checked-out branch, NOT to main.
readonly BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
readonly DRY_RUN="${DRY_RUN:-0}"
readonly ALLOW_MAIN_PUSH="${ALLOW_MAIN_PUSH:-0}"

log() { printf '[git-sync] %s\n' "$*"; }
err() { printf '[git-sync] ERROR: %s\n' "$*" >&2; }

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  err "GITHUB_TOKEN is not set."
  err "Add it as a Replit Secret with 'repo' scope, then re-run."
  exit 2
fi

# Hard guard: do not let this script casually push to main. The
# enterprise default is PR-only. Pushing directly to main bypasses
# review and CI gates and should be a deliberate, confirmed action.
if [[ "${BRANCH}" == "main" ]]; then
  if [[ "${ALLOW_MAIN_PUSH}" != "1" ]]; then
    err "Refusing to push directly to 'main'."
    err ""
    err "The enterprise flow is: feature branch -> PR -> CI -> review -> merge."
    err "If you have a feature branch, run:"
    err "    git checkout -b feature/your-change"
    err "    bash scripts/git-sync.sh"
    err ""
    err "If this really is an emergency (production down, hotfix, recovering"
    err "from a broken UI), re-run with explicit confirmation:"
    err "    ALLOW_MAIN_PUSH=1 bash scripts/git-sync.sh"
    err "(or for non-interactive: ALLOW_MAIN_PUSH=1 CONFIRM_MAIN_PUSH=yes ...)"
    err ""
    err "See docs/git-workflow.md §4 'Emergency-push escape hatch'."
    exit 5
  fi
  # Non-interactive bypass for agents / CI: setting CONFIRM_MAIN_PUSH=yes
  # skips the prompt. ALLOW_MAIN_PUSH=1 is still required, so a single
  # stray env var can't cause an accidental main push.
  if [[ "${CONFIRM_MAIN_PUSH:-}" == "yes" ]]; then
    log "Main-push override confirmed via CONFIRM_MAIN_PUSH=yes. Proceeding."
  else
    printf '[git-sync] You are about to push directly to main, bypassing PR + review.\n'
    printf '[git-sync] Type "yes" to continue, anything else to abort: '
    read -r confirm
    if [[ "${confirm}" != "yes" ]]; then
      err "Aborted by user."
      exit 5
    fi
    log "Main-push override confirmed. Proceeding."
  fi
fi

# Refuse to push a dirty working tree — surprises here are dangerous.
if ! git diff --quiet || ! git diff --cached --quiet; then
  err "Working tree has uncommitted changes. Commit or stash them first."
  git status --short
  exit 3
fi

# Build the authenticated URL on the fly so the token never gets stored
# in .git/config or printed to logs. Overridable via REMOTE_URL_OVERRIDE
# so the smoke tests can point at a local bare repo instead of GitHub.
authed_url="${REMOTE_URL_OVERRIDE:-https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_SLUG}.git}"

# Sanity check: confirm the token can actually see the repo before we
# try to push. Fails fast on revoked / wrong-scope tokens.
if [[ -z "${SKIP_TOKEN_CHECK:-}" ]]; then
  log "Validating GITHUB_TOKEN against ${REPO_SLUG}..."
  http_code=$(curl -sS -o /tmp/git-sync-perms.json -w "%{http_code}" \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    "https://api.github.com/repos/${REPO_SLUG}")
  if [[ "${http_code}" != "200" ]]; then
    err "GitHub API returned HTTP ${http_code} for ${REPO_SLUG}."
    err "Token is missing, expired, or lacks read access."
    cat /tmp/git-sync-perms.json >&2 || true
    exit 1
  fi
  can_push=$(grep -oE '"push"[^,]*true' /tmp/git-sync-perms.json | head -1 || true)
  if [[ -z "${can_push}" ]]; then
    err "Token can read ${REPO_SLUG} but does NOT have push permission."
    err "Issue a new PAT with 'repo' scope (classic) or 'Contents: read & write' (fine-grained)."
    exit 1
  fi
  log "Token OK (push permission confirmed)."
fi

log "Fetching ${REMOTE}..."
git fetch --prune "${authed_url}" "+refs/heads/*:refs/remotes/${REMOTE}/*"

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "${current_branch}" != "${BRANCH}" ]]; then
  err "On branch '${current_branch}', but BRANCH='${BRANCH}'. Checkout first."
  exit 1
fi

# Detect first-push case: feature branch that doesn't yet exist on
# origin. We must NOT compute ahead/behind against a non-existent
# ref — `git rev-list` would fail and the fallback "0 0" would make
# the script wrongly conclude "nothing to push".
first_push=0
if ! git show-ref --verify --quiet "refs/remotes/${REMOTE}/${BRANCH}"; then
  first_push=1
  ahead=$(git rev-list --count HEAD)
  behind=0
  log "Branch '${BRANCH}' does not exist on ${REMOTE} yet — this will be a first push (${ahead} commits)."
else
  ahead_behind=$(git rev-list --left-right --count "${REMOTE}/${BRANCH}...${BRANCH}")
  behind=$(echo "${ahead_behind}" | awk '{print $1}')
  ahead=$(echo "${ahead_behind}" | awk '{print $2}')
  log "Local ${BRANCH} is ${ahead} commits ahead and ${behind} commits behind ${REMOTE}/${BRANCH}."
fi

if [[ "${first_push}" -eq 0 && "${behind}" -gt 0 ]]; then
  log "Rebasing onto ${REMOTE}/${BRANCH}..."
  if ! git rebase "${REMOTE}/${BRANCH}"; then
    err "Rebase produced conflicts. The repo is now in a"
    err "rebase-in-progress state — finish or abort it before doing"
    err "anything else. Inspect, then choose ONE of:"
    err ""
    err "  # 1. Abort and return to the pre-rebase state:"
    err "       git rebase --abort"
    err ""
    err "  # 2. Resolve the conflicts and continue:"
    err "       git status                       # see conflicting files"
    err "       \$EDITOR <conflicted-files>     # fix the markers"
    err "       git add <conflicted-files>"
    err "       git rebase --continue"
    err ""
    err "Re-run scripts/git-sync.sh after either path completes."
    exit 4
  fi
  # Recompute after rebase — the rebased commits have new SHAs, so the
  # pre-rebase ahead/behind numbers are no longer accurate.
  ahead_behind=$(git rev-list --left-right --count "${REMOTE}/${BRANCH}...${BRANCH}" || echo "0 0")
  behind=$(echo "${ahead_behind}" | awk '{print $1}')
  ahead=$(echo "${ahead_behind}" | awk '{print $2}')
  log "After rebase: ${ahead} commits ahead, ${behind} behind ${REMOTE}/${BRANCH}."
fi

if [[ "${ahead}" -eq 0 ]]; then
  log "Nothing to push — already up to date."
  exit 0
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  log "DRY_RUN=1 — would push ${ahead} commit(s) to ${REMOTE}/${BRANCH}. Skipping."
  exit 0
fi

if [[ "${first_push}" -eq 1 ]]; then
  log "Pushing ${BRANCH} to ${REMOTE} (first push, setting upstream)..."
  git push --set-upstream "${authed_url}" "${BRANCH}:${BRANCH}"
  log "Push succeeded. Open a PR at https://github.com/${REPO_SLUG}/pull/new/${BRANCH}"
else
  log "Pushing ${BRANCH} to ${REMOTE}..."
  git push "${authed_url}" "${BRANCH}:${BRANCH}"
  log "Push succeeded. Vercel + Replit Autoscale should redeploy via .github/workflows/deploy.yml."
fi
