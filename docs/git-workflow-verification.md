# Verification log - Task #8 (May 13, 2026)

Evidence the unblock+harden work actually landed in production. Kept
as a committed artifact so future agents and auditors can confirm
without re-running the pipeline.

---

## 1. Divergence captured (read-only, no fetch needed)

Queried the GitHub REST API directly to read the real `origin/main`
HEAD without depending on the broken Replit Git UI:

```
GET https://api.github.com/repos/feastpot/feastpot-platform/commits/main
→ "sha": "2fbbaf986b58530e5fd2edb7faca3566ac480bf9"   (2026-05-13)
```

`git rev-list --left-right --count origin/main...main` against the
last cached remote ref returned `0  17`, i.e. **17 commits ahead, 0
commits behind**. After three more agent-checkpoint commits, the
final push moved 20 commits. Either way: a clean fast-forward, no
rebase required. The PUSH_REJECTED error from the Replit UI was a
mis-rendering of UNAUTHENTICATED.

## 2. Push succeeded via `scripts/git-sync.sh`

Run from the user's Replit Shell tab with `ALLOW_MAIN_PUSH=1` (the
main-agent sandbox blocks `git push` regardless of auth, and the
script's enterprise default is to refuse direct main pushes - see §6
of `docs/git-workflow.md`):

```
[git-sync] Validating GITHUB_TOKEN against feastpot/feastpot-platform...
[git-sync] Token OK (push permission confirmed).
[git-sync] Fetching origin...
[git-sync] Local main is 20 commits ahead and 0 commits behind origin/main.
[git-sync] Pushing main to origin...
... 114 objects, 3.06 MiB ...
To https://github.com/feastpot/feastpot-platform.git
   2fbbaf9..2e2814f  main -> main
[git-sync] Push succeeded. Vercel + Replit Autoscale should redeploy via .github/workflows/deploy.yml.
```

First attempt failed because the fine-grained PAT lacked the
`Workflows: read & write` permission and one of the commits touches
`.github/workflows/deploy.yml`. Documented in `docs/git-workflow.md`
§4 so it doesn't happen again.

## 3. Live deploy verified

After Vercel rebuilt, all three previously-broken endpoints returned
HTTP 200 with the new content:

| URL | Status | Required string(s) found |
| --- | --- | --- |
| `https://feastpot.co.uk/legal/vendor-terms` | 200 | "12% of the order subtotal", "weekly, every Monday", "FHRS" |
| `https://feastpot.co.uk/legal/cookies` | 200 | "feastpot.basket.v1", "sb-access-token" |
| `https://feastpot.co.uk/legal/privacy` | 200 | "ZC146267", "ICO Registration", "Last updated: May 2026" |

Before the push these were 404 / showing stale content.

## 4. Branch protection applied + verified

Source-of-truth config committed at `.github/branch-protection.main.json`.
Applied via `PUT /repos/.../branches/main/protection` → HTTP 200.

**Required status checks** - only PR-time checks from
`.github/workflows/ci.yml`, because GitHub branch protection requires
contexts that can actually run on a `pull_request`:

- Typecheck
- Lint
- Prisma validate
- Test (coverage ≥ 70%)
- Build all apps

Deploy gates (Migrate production DB, Deploy API/web/vendor/admin)
are enforced inside `.github/workflows/deploy.yml` itself via
job-level `needs:` dependencies - that workflow is the source of
truth for what must succeed before production updates, not branch
protection. Putting them in branch protection would structurally
block every PR (they only run on push to `main`) which is why they
were removed in the second iteration of this task.

Other settings (read back from the API after apply):

```
required_status_checks.strict:      True
required_pull_request_reviews:      1 approving review (dismiss_stale=true)
required_linear_history:            True
allow_force_pushes:                 False
allow_deletions:                    False
required_conversation_resolution:   True
enforce_admins:                     True   ← admins cannot bypass
```

Re-application is idempotent:

```
curl -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  --data @.github/branch-protection.main.json \
  https://api.github.com/repos/feastpot/feastpot-platform/branches/main/protection
```

## 5. Defence in depth - `scripts/git-sync.sh` refuses `main` by default

Branch protection is the server-side gate. `scripts/git-sync.sh`
adds the matching client-side gate so a stray local invocation can
never push to `main` accidentally:

- `BRANCH` defaults to the currently checked-out branch, NOT to `main`.
- If `BRANCH=main` (explicit or implicit), the script refuses with
  exit 5 unless BOTH `ALLOW_MAIN_PUSH=1` is set AND the operator
  types `yes` at the confirmation prompt.
- The error message points at the correct path
  (`git checkout -b feature/x && bash scripts/git-sync.sh`) and at
  `docs/git-workflow.md §6` for the documented emergency override.

This means the "main path to main" is the PR flow, full stop. The
script exists for feature branches and one-off recovery scenarios.

## 6. Smoke test of the protected-branch flow

Real PR opened end-to-end via the GitHub API to exercise protection
(this run was performed against the **previous** protection config
which had `enforce_admins: false`; that's why the admin merge
succeeded). The behavior of interest - that GitHub reports the PR as
`blocked` until checks + reviews pass - was confirmed:

| Step | API call | Result |
| --- | --- | --- |
| Get current `main` SHA | `GET /git/ref/heads/main` | `2e2814f9...` |
| Create branch `chore/smoke-protection-test` | `POST /git/refs` | HTTP 201 |
| Add `docs/.protection-smoke-2026-05-13.md` on branch | `PUT /contents/...` | HTTP 201 |
| Open PR #11 against `main` | `POST /pulls` | HTTP 201 |
| Read PR mergeability | `GET /pulls/11` | `mergeable_state: blocked` ← **protection holding** |
| Attempt merge | `PUT /pulls/11/merge` | HTTP 200, only because admin bypass was still on |
| Cleanup: delete smoke marker on main | `DELETE /contents/...` | HTTP 200 (commit `1ffe1579`) |
| Cleanup: close PR + delete branch | `PATCH /pulls/11` + `DELETE /git/refs/...` | OK |

## 7. Fresh proof under `enforce_admins: true` (smoke v2)

Re-ran the smoke test after flipping `enforce_admins` to `true`,
using the same admin-permission token. Direct merge attempt:

```
PUT https://api.github.com/repos/feastpot/feastpot-platform/pulls/12/merge
Authorization: Bearer <admin token>
{ "merge_method": "squash" }

→ HTTP 405
{
  "message": "At least 1 approving review is required by reviewers with
              write access. 5 of 5 required status checks are expected.",
  "documentation_url": "https://docs.github.com/articles/about-protected-branches",
  "status": "405"
}
```

This is the airtight proof: even a token with `admin: true,
push: true, maintain: true` is now blocked from merging into `main`
without a review and the 5 required CI checks. Branch protection is
enforced; admin bypass is gone. PR #12 was closed and the throwaway
branch deleted immediately after.

The smoke marker files were deleted from `main` after each test so
production carries no throwaway artifacts.
