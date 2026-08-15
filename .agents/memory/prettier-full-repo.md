---
name: Prettier full-repo formatting
description: How to run Prettier cleanly across the whole monorepo without parse errors
---

`npm run format:check` runs `prettier --check "**/*.{ts,tsx,js,jsx,json,md}"` and uses
`.prettierignore` for exclusions.  When running `prettier --write` manually, cover ALL
app directories — the CI check catches every workspace:

```
apps/admin/src/**/*.{ts,tsx}
apps/vendor/src/**/*.{ts,tsx}
apps/vendor/e2e/**/*.{ts,js,md,json}   # but see exclusion below
apps/web/src/**/*.{ts,tsx}
apps/web/e2e/**/*.{ts,js}
packages/**/*.{ts,tsx}
docs/**/*.md
scripts/**/*.ts
*.md  (CONTRIBUTING.md, IMPLEMENTATION_NOTES.md, etc.)
```

**Known parse error:** `apps/vendor/e2e/helpers/verification-banner-mocks.ts` contains
JSDoc comments with `->` arrows that Prettier's TypeScript parser cannot parse (SyntaxError
at column 36 on a `* - GET /vendors/*/verification -> verificationRecord` line).
This file is added to `.prettierignore`; do not remove it.

**Playwright test-results** (`apps/vendor/test-results/`, `apps/web/test-results/`) are
machine-generated; they are also in `.prettierignore`.

**Why:** Missing any workspace causes a subset of files to be unformatted and CI
`format:check` fails.  The safest pre-push step is `npm run format:check` (uses
.prettierignore automatically) rather than a manual glob with `--ignore-path`.
