# Contributing to Feastpot

## Typography rules

### Em dashes are banned (U+2014 `-`)

Em dashes must not appear anywhere in the codebase: source files, templates,
copy strings, seed data, documentation, or commit messages.

**Why.** Em dashes render inconsistently across operating systems and screen
readers. They also look informal in a marketplace context and have caused
incorrect page titles in production.

**Approved alternatives**

| Context                     | Instead of                              | Use                                                                         |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Page title separator        | `Feastpot - African Food`               | `Feastpot \| African Food`                                                  |
| Prose aside / parenthetical | `Fresh chops - puff puff and samosa`    | `Fresh chops: puff puff and samosa` or `Fresh chops (puff puff and samosa)` |
| Sentence continuation       | `Order placed - we will match you soon` | `Order placed. We will match you soon.`                                     |
| List of items               | `small chops - puff puff, samosa`       | `small chops: puff puff, samosa`                                            |
| Error or status message     | `Payout failed - retry`                 | `Payout failed. Please retry.`                                              |
| Null / empty display value  | `-` in a table cell                     | `–` (en dash, U+2013)                                                       |

**Enforcement**

1. **ESLint** - `no-restricted-syntax` in `packages/config/eslint-base.js`
   catches em dashes in string literals and template expressions at lint time.

2. **Pre-commit hook** (`.husky/pre-commit`) - blocks any staged change that
   introduces a U+2014 character.

3. **CI grep** - the `lint` job in `.github/workflows/ci.yml` runs the same
   grep across all tracked source files and fails the build if any are found.

If you believe an em dash is genuinely necessary (it almost certainly is not),
raise it in a PR comment and the team will agree on an alternative together.

### En dashes (U+2013 `–`)

En dashes are permitted only as a null / empty placeholder in admin table cells
(e.g. `{value ?? '–'}`). Do not use them in prose or page copy.

---

## Development setup

```bash
npm install          # install all workspace dependencies
npm run dev          # start all apps in watch mode
npm run typecheck    # TypeScript across all workspaces
npm run lint         # ESLint across all workspaces
npm run test         # Jest (API unit / integration suite)
npm run format       # Prettier
```

## Branch workflow

- Branch off `main`.
- Open a PR; CI must be green before merge.
- Squash-merge into `main`; delete the branch.
- After merging, fetch `main` back into any long-lived branches to keep them
  current.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
