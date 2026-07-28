---
name: GitHub push rejected — workflow scope
description: Why pushes touching .github/workflows fail with PUSH_REJECTED from this repl
---
Pushes to feastpot/feastpot-platform fail with PUSH_REJECTED whenever any outgoing commit adds/modifies a file under `.github/workflows/` — the Replit GitHub OAuth token lacks the `workflow` scope, and GitHub rejects the whole push (real error only visible on a raw `git push`: "refusing to allow an OAuth App to create or update workflow ... without `workflow` scope").

**Why:** OAuth apps need explicit `workflow` scope to touch CI files; the gitPush callback surfaces this only as a generic PUSH_REJECTED, which looks like branch protection or secret scanning.

**How to apply:** If a push is rejected and the outgoing commits touch `.github/workflows/`, don't hunt for secrets/protection — tell the user to push with a PAT that has `repo`+`workflow` scopes or via SSH. Pushing a different branch name won't help.
