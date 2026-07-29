---
name: Lockfile leaks Replit package-firewall URLs
description: Regenerating package-lock.json inside Replit poisons it for external CI (GitHub Actions, Vercel)
---
Running `npm install` inside the Replit workspace writes `resolved` URLs like `http://package-firewall.replit.local/npm/...` into package-lock.json. That host only exists inside Replit, so `npm ci`/`npm install` on GitHub Actions and Vercel crash with npm's opaque "Exit handler never called!" (no real error shown, even with verbose logs).

**Why:** Replit routes npm through a local package-firewall proxy and npm records the proxy URL as the resolved source.

**How to apply:** After any lockfile regeneration, before pushing: `grep -c package-firewall package-lock.json` — if nonzero, `sed -i 's|http://package-firewall.replit.local/npm|https://registry.npmjs.org|g' package-lock.json` (integrity hashes stay valid). If external CI fails at install with "Exit handler never called", check for these URLs first.
