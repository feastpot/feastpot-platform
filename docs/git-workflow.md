# Git & Deploy Workflow

This document is the source of truth for how code reaches production at
Feastpot. Read it before pushing to `main` or wiring up new automation.

---

## TL;DR

- **`main` is protected.** Direct pushes are rejected for everyone
  except the emergency-push escape hatch (see §4).
- **All work goes through pull requests.** Even the agent.
- **Merging to `main` triggers `.github/workflows/deploy.yml`**, which
  runs migrations → deploys API → deploys the three Vercel frontends →
  smoke-tests every public URL → notifies Slack.
- **If the Replit Git UI breaks (UNAUTHENTICATED, PUSH_REJECTED, etc.),
  use `bash scripts/git-sync.sh`** — it bypasses the UI's OAuth state
  and pushes via a token-authenticated HTTPS URL.

---

## 1. Day-to-day flow

```
git checkout -b feat/<short-name>     # never commit directly to main
# ...edit, commit...
git push -u origin feat/<short-name>  # opens a PR via GitHub
# Open PR in GitHub UI; CI runs (lint, typecheck, test, build).
# After 1 approving review + green checks → squash-merge to main.
# Merging to main triggers production deploy automatically.
```

### Branch naming

- `feat/<thing>` — new feature
- `fix/<thing>` — bug fix
- `chore/<thing>` — tooling, deps, docs
- `hotfix/<thing>` — emergency prod fix (still goes through PR)

### Commit messages

Use Conventional Commits-style prefixes when convenient
(`feat:`, `fix:`, `chore:`, `docs:`). Keep the first line ≤ 72 chars,
and explain *why* in the body if it isn't obvious from the diff.

---

## 2. What happens when you merge to `main`

`.github/workflows/deploy.yml` runs in this order:

1. **`deploy-database`** — applies pending Prisma migrations to prod
   Supabase. **Gates everything below.** A failed migration aborts the
   deploy with no partial state.
2. **`deploy-api`** — builds `apps/api`, triggers a Replit Autoscale
   deploy, polls until it reports `succeeded` (5-min timeout).
3. **`deploy-web` / `deploy-vendor` / `deploy-admin`** — three Vercel
   deploy hooks fire in parallel, each gated on `deploy-api`.
4. **`smoke-test`** — pings `api.feastpot.co.uk/health`,
   `feastpot.co.uk`, `vendor.feastpot.co.uk`, `admin.feastpot.co.uk`.
5. **`notify`** — green or red Slack message either way.

If smoke-test fails, the Slack message includes the run URL so you can
roll forward (revert PR + merge) within minutes.

---

## 3. Branch protection rules on `main`

These are enforced via GitHub Settings → Branches → `main`:

- Require a pull request before merging.
- Require at least **1 approving review**.
- Require status checks to pass:
  - `Migrate production DB`
  - `Deploy API (Replit Autoscale)`
  - any others wired up in `.github/workflows/`
- Require linear history (no merge commits — squash or rebase only).
- Require conversation resolution before merge.
- **Block force pushes.**
- **Block deletion.**

If you add a new required check, also list it here so future agents
know what's gating merges.

---

## 4. Emergency-push escape hatch — `scripts/git-sync.sh`

**When to use it:** the Replit Git UI shows `UNAUTHENTICATED`, or a
push from the UI keeps failing with `PUSH_REJECTED` even after Pull,
or you need to push from a non-interactive context (a task agent, CI,
a cron).

**Setup (one-time):**

1. Create a GitHub PAT for `feastpot/feastpot-platform`:
   - **Classic PAT:** scopes `repo` AND `workflow`.
   - **Fine-grained PAT:** repository permissions
     `Contents: read & write`, `Pull requests: read & write`,
     `Administration: read & write` (for branch protection),
     **`Workflows: read & write`** (required — without this, any push
     that touches `.github/workflows/*.yml` is rejected with
     "refusing to allow a Personal Access Token to create or update
     workflow ... without `workflow` scope").
2. Add it to **Replit Secrets** as `GITHUB_TOKEN`.

**Use:**

```
bash scripts/git-sync.sh           # fetch + rebase main onto origin/main + push
DRY_RUN=1 bash scripts/git-sync.sh # show what would happen, do not push
BRANCH=foo bash scripts/git-sync.sh # same flow on a different branch
```

The script:

- Refuses to run if the working tree is dirty (exit 3).
- Refuses to run if `GITHUB_TOKEN` is missing or lacks push perms
  (exit 2 / 1).
- Rebases your branch on top of the remote before pushing — never
  force-pushes.
- Surfaces rebase conflicts and exits 4 without a half-finished state.
- Never writes the token to `.git/config` and never echoes it.

**Important:** this is for unblocking the agent / CI when the UI is
broken. It does **not** bypass branch protection — it still has to
target a branch you have write access to. For changes to `main`, open
a PR like normal once your branch is up there.

---

## 5. Why two parallel auth paths?

| Path | Used by | Auth | Failure mode |
| --- | --- | --- | --- |
| Replit Git UI | Humans clicking Pull/Push | OAuth via `Connections → GitHub` | Token goes stale → `UNAUTHENTICATED`. Re-authorize in Settings. |
| `scripts/git-sync.sh` | Agents, CI, recovery | PAT in `GITHUB_TOKEN` secret | Token revoked / wrong scope. Issue a new PAT and update the secret. |

Keep both working. Never delete the secret without a replacement; the
UI is enough for humans, but agent sessions can't use it.

---

## 6. Things explicitly NOT covered here

- **Commit signing / GPG.** Not enforced yet — see follow-up tasks.
- **A dedicated `feastpot-bot` machine user.** Currently every agent
  push uses the human owner's PAT. If we hit rate limits or audit
  needs, switch to a bot account and update `GITHUB_TOKEN`.
- **Rolling back a bad deploy.** Open a `revert` PR, merge, let the
  pipeline redeploy. Do not hand-edit `main`.
