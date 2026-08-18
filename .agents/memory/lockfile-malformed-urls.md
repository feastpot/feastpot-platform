---
name: Lockfile malformed resolved URLs
description: Two patterns of bad resolved URLs in package-lock.json that break npm ci in CI/Vercel
---

## Pattern 1 - Replit firewall URLs

Regenerating the lockfile inside Replit can produce:

```
"resolved": "http://package-firewall.replit.local/..."
```

These are unreachable from external CI. Fix:

```bash
sed -i 's|http://package-firewall.replit.local/|https://registry.npmjs.org/|g' package-lock.json
```

The deploy.yml typecheck job has a guard that fails fast if any of these remain.

## Pattern 2 - Spurious /npm/ path segment

A lockfile entry for `svix` was found with an extra `/npm/` path segment:

```
"resolved": "https://registry.npmjs.org/npm/svix/-/svix-1.99.1.tgz"
```

Correct form:

```
"resolved": "https://registry.npmjs.org/svix/-/svix-1.99.1.tgz"
```

This causes a 404 on `npm ci` in every CI job (typecheck, migrate-db, build-api).

**Why:** Unknown how this was introduced - possibly a Replit npm proxy quirk or a lockfile merge conflict artefact. The pattern to grep for:

```bash
grep -c "registry.npmjs.org/npm/" package-lock.json
```

Fix:

```bash
sed -i 's|https://registry.npmjs.org/npm/<package>/-/|https://registry.npmjs.org/<package>/-/|g' package-lock.json
```

Or generically (be careful - only fixes the double-npm prefix pattern, not legitimate scoped packages):

```bash
# List candidates first
grep "registry.npmjs.org/npm/" package-lock.json | grep resolved
```

## Pattern 3 - Test artefacts with lint-tripping content

Playwright test-results directories can contain captured page content (headings, text) that trips CI lint guards:

- `FeastPot` capitalisation guard
- em-dash guard

**Fix:** `apps/web/.gitignore` now covers `test-results/`, `e2e-report/`, `e2e-results.json`. Never commit these.
