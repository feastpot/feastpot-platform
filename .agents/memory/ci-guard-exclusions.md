---
name: CI guard exclusions
description: Which directories the CI lint guards must exclude, and why
---

The brand-capitalisation guard uses recursive grep over the repository.
It must exclude:

- `--exclude-dir=node_modules`
- `--exclude-dir=.next`
- `--exclude-dir=dist`
- `--exclude-dir=.turbo`
- `--exclude-dir=.git`
- `--exclude-dir=.local`   (Replit skills - auto-generated)
- `--exclude-dir=.agents`  (agent memory files - legitimate em-dashes & brand name refs)
- `--exclude-dir=attached_assets`

**.agents is committed to the repo** so CI sees it.  Omitting it causes every memory
file that quotes the wrong capitalisation or uses em-dashes to fail CI.

**Why:** Memory files intentionally contain the "wrong" strings as counter-examples
or in bullet-point comparisons.  They are not source code.

Typography checks retain the root-level agent, uploaded-input and operator-report
exemptions, but workspace documentation must remain covered. Do not globally
exclude every directory named docs or audit.

**Why:** Operator reports legitimately use narrative punctuation and quote
counterexamples. The user requires all workspaces and source file types to be
checked; a broad directory exclusion could hide application legal copy.

**How to apply:** Limit report exemptions to repository-root report directories.
Construct forbidden-character fixtures without embedding literal forbidden
bytes in the test source.

Do not rewrite applied SQL migrations merely to satisfy a broader typography
check. Grandfather only exact historical snapshots, not all migration files.

**Why:** Prisma stores applied migration checksums; even a comment-only
punctuation edit changes the checksum and can break migration history checks.

**How to apply:** Keep applied migrations byte-identical, allow only their pinned
historical snapshots, and check new or changed SQL files normally.
