# `branch-protection.main.json` — what it is and how to apply it

This is the source-of-truth GitHub branch-protection config for
`main` on `feastpot/feastpot-platform`. The JSON file beside this
README is kept as a strict, runnable API payload (no comment keys)
so re-application can never fail GitHub's schema validation.

## Apply / re-apply

```sh
curl -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  --data @.github/branch-protection.main.json \
  https://api.github.com/repos/feastpot/feastpot-platform/branches/main/protection
```

Idempotent — safe to re-run after every change to the JSON.

## Why these contexts and not deploy.yml jobs

`required_status_checks.contexts` lists only PR-time checks from
`.github/workflows/ci.yml`:

- `Typecheck`, `Lint`, `Prisma validate`, `Test (coverage ≥ 70%)`,
  `Build all apps`

GitHub branch protection only honors contexts that can actually
report on a `pull_request`. The deploy gates
(`Migrate production DB`, `Deploy API (Replit Autoscale)`,
`Deploy web/vendor/admin (Vercel)`, `Smoke tests`) live in
`.github/workflows/deploy.yml`, which only triggers on `push` to
`main`. Putting them in branch protection would leave every PR
permanently `mergeable_state: blocked`. Those gates are still
enforced — just inside `deploy.yml` itself via job-level `needs:`
dependencies, which is the correct layer for them.

## Why `enforce_admins: true`

So that even repo admins (i.e. anyone with the PAT in
`GITHUB_TOKEN`) cannot bypass review and CI checks via the API.
The only path to `main` is now: feature branch → PR → green CI →
1 review → squash/rebase merge. `scripts/git-sync.sh` adds the
matching client-side guard.

See `docs/git-workflow.md` and `docs/git-workflow-verification.md`
for the full rationale and the verification log.
