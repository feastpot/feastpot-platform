---
name: GitHub PAT and Replit push
description: Use the working GitHub connection when shell credentials reject pushes.
---

## Authentication fallback
Resolve the GitHub CLI path with `command -v gh` at the time of use; do not retain an absolute Nix-store path across workspace restarts.

**Why:** A previously working Nix-store executable path disappeared after an environment restart even though `gh` was still available.

**How to apply:** Resolve the executable dynamically when configuring a process-scoped Git credential helper.

Git and the GitHub CLI can reject their stored credentials while the installed GitHub connection still works. Prefer that connection over requesting another token, but successful reads do not prove write access.

**Why:** Shell push and CLI authentication failed independently, but authenticated connector requests successfully uploaded the same changes and opened a pull request.

**How to apply:** Use the connection's authenticated proxy for GitHub Git Data API blob, tree, commit, and branch operations when shell push authentication fails. Preserve the intended base and file scope. Never put credentials into remote URLs, shell arguments, or chat.

An existing PAT can be consumed by GitHub CLI through a process-scoped `GH_TOKEN`, without displaying or persisting the secret. Resolve the CLI's absolute executable path when invoking it from a Git credential helper.

**Why:** The default CLI credential was invalid and a nested Git helper could not find `gh`, while the existing PAT worked with an explicit process-scoped CLI credential and absolute helper path.

**How to apply:** Keep credentials inside the consuming process, never in remote URLs or logs. A PAT that can push may still lack permission to read branch protection; use the working connection for that read, and never bypass the required checks.

Repository permission flags describe the account's access, not necessarily the connection's ability to write.

**Why:** Repository reads reported admin and push permissions while a Git Data tree creation returned HTTP 404.

**How to apply:** Verify the actual write operation before promising a connector push. Diagnose failed writes independently of successful reads, and request replacement credentials securely when needed.

## Connector request pacing
Pace bulk Git Data uploads and handle HTTP 429 with the returned retry delay.

**Why:** The connector proxy enforces a per-repl 10-requests-per-second limit independently of GitHub's own quota; concurrent immutable-blob uploads exceeded it.

**How to apply:** Sequential uploads with at least 200 ms between requests worked. Use bounded retries for rate-limited immutable operations and verify uploaded blob and tree hashes before creating the branch.

Do not use terminal-normalized output to transfer exact Git file bytes.

**Why:** The programmatic shell helper discarded NUL-delimited output and lost the beginning of a large base64 stream without reporting truncation.

**How to apply:** Export bulk data to a temporary file and read it through a byte-preserving file operation. Keep operation budgets bounded, exclude generated report assets, and verify blob hashes before updating any branch.

## Merge restrictions
This repository does not allow GitHub automatic merging. Required checks still gate a normal merge.

**Why:** GitHub explicitly rejected enabling auto-merge while required checks were pending.

**How to apply:** Check the current repository capability rather than promising automatic merging. Do not bypass branch protection; report pending checks as an external blocker.
