---
name: Branch vs squash merges
description: Keeping the long-lived work branch mergeable after squash merges to main
---
The audit work lives on a long-lived branch that gets squash-merged into main in chunks.
**Why:** a squash rewrites history, so the branch and main immediately diverge; the next PR from the same branch reports `mergeable_state: dirty` and CI won't gate it properly.
**How to apply:** after any squash merge lands, `git fetch` main and merge it into the branch before opening/refreshing a PR. Typical conflict is only `.agents/memory/MEMORY.md` - resolve with `git checkout --ours`. Also verify what the squash actually contained: a merge can happen mid-session and miss commits pushed after the recorded PR head (compare `git diff main..branch --stat`).
