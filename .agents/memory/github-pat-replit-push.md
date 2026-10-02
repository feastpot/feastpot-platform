---
name: GitHub PAT and Replit push
description: Use the working GitHub connection when shell credentials reject pushes.
---

## Authentication fallback
Git and the GitHub CLI can reject their stored credentials while the installed GitHub connection still works. Prefer that connection over requesting another token.

**Why:** Shell push and CLI authentication failed independently, but authenticated connector requests successfully uploaded the same changes and opened a pull request.

**How to apply:** Use the connection's authenticated proxy for GitHub Git Data API blob, tree, commit, and branch operations when shell push authentication fails. Preserve the intended base and file scope. Never put credentials into remote URLs, shell arguments, or chat.

## Connector request pacing
Pace bulk Git Data uploads and handle HTTP 429 with the returned retry delay.

**Why:** The connector proxy enforces a per-repl 10-requests-per-second limit independently of GitHub's own quota; concurrent immutable-blob uploads exceeded it.

**How to apply:** Sequential uploads with at least 200 ms between requests worked. Use bounded retries for rate-limited immutable operations and verify uploaded blob and tree hashes before creating the branch.

## Merge restrictions
This repository does not allow GitHub automatic merging. Required checks still gate a normal merge.

**Why:** GitHub explicitly rejected enabling auto-merge while required checks were pending.

**How to apply:** Check the current repository capability rather than promising automatic merging. Do not bypass branch protection; report pending checks as an external blocker.
