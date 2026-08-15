---
name: Lockfile leaks Replit package-firewall URLs
description: Regenerating package-lock.json inside Replit poisons it for external CI (GitHub Actions, Vercel)
---
Running `npm install` inside the Replit workspace writes `resolved` URLs like `http://package-firewall.replit.local/npm/...` into package-lock.json. That host only exists inside Replit, so `npm ci` on GitHub Actions and Vercel crashes.

**Why:** Replit routes npm through a local package-firewall proxy and npm records the proxy URL as the resolved source. The firewall path format is `/npm/<package>` — the `/npm/` segment is part of the firewall path, not the npm registry path.

**Correct sed (run before every push after a lockfile regeneration):**
```
sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json
```
Note: the trailing `/npm/` in the pattern strips the firewall-specific segment so the result is `https://registry.npmjs.org/@scope/pkg/-/...` not `https://registry.npmjs.org/npm/@scope/pkg/-/...`. The wrong pattern (`s|.replit.local/|.npmjs.org/|g`) leaves a spurious `npm/` prefix that causes a 404 on CI.

**How to apply:** After any `npm install`/`npm ci` in Replit, before pushing: `grep -c package-firewall package-lock.json` — if nonzero, run the sed above. If external CI fails at install with a 404 on a resolved URL, check for `registry.npmjs.org/npm/` URLs in the lockfile.
