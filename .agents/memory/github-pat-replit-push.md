---
name: GitHub PAT and Replit push
description: How to push from Replit to a GitHub org repo when the embedded PAT is expired.
---

## The rule
Classic PATs (`ghp_…`) work for org repos via HTTPS. Fine-grained PATs (`github_pat_…`) are rejected by org repos unless the org admin approves them — don't use them.

**Why:** `feastpot/feastpot-platform` is an organisation repo. GitHub rejects fine-grained tokens for org repos without explicit org-level approval.

## ShellExec secret-caching gotcha
`ShellExec` inherits the agent process environment, which is loaded at session start. If a Replit Secret is updated mid-session, `ShellExec` **does not see the new value** — the old value is served from the cached environment. The only reliable workaround is for the user to paste the token inline in the shell command directly (bypassing the env var), e.g.:

```bash
git remote set-url origin https://x-access-token:ghp_ACTUAL_TOKEN@github.com/feastpot/feastpot-platform.git
git push origin main
```

**How to apply:** Any time a secret needs to be used mid-session for a one-off shell command (e.g. git push), ask the user to run the command themselves in the Replit Shell tab with the token inline, rather than relying on the `${SECRET}` env var in ShellExec.
