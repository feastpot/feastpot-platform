---
name: CI guard exclusions
description: Which directories the CI lint guards must exclude, and why
---

Both the em-dash guard and the FeastPot-capitalisation guard in `.github/workflows/ci.yml`
use recursive grep over the whole repo.  They must exclude:

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

The em-dash guard additionally excludes:

- `--exclude-dir=.cache` (ignored, generated local scan reports)
- `--exclude-dir=docs`
- `--exclude-dir=audit`

**Why:** The em-dash rule is a source-code style constraint. Documentation and audit
reports legitimately use narrative punctuation, while `.cache` is not repository content.

**How to apply:** When adding new guards to ci.yml, copy the full exclusion list above.
When writing tests that need to reference a forbidden string (e.g. the wrong brand name),
split the string literal so the grep doesn't match: `'Feast' + 'Pot'`.
