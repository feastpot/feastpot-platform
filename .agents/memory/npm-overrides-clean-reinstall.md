---
name: npm overrides require clean reinstall
description: Why overrides silently fail in this monorepo and how to make them take effect
---

In this npm-workspaces + Turborepo monorepo, `overrides` in root package.json do NOT take effect on an incremental `npm install`. npm reuses stale per-workspace `node_modules` copies and marks the forced packages "invalid…overridden" while keeping the old version.

**Rule:** to land an override, use an EXACT version pin (not a caret) AND do a FULL clean reinstall: `rm -rf node_modules package-lock.json apps/*/node_modules packages/*/node_modules` then `npm install`.

**Why:** caret ranges + reused node_modules let npm keep the pre-existing resolution. Targeted/partial removal of just the overridden dirs is WORSE — it leaves the tree inconsistent (npm creates empty directory stubs, transitive deps like bull→lodash/uuid go missing) and can produce a corrupt lockfile that throws `Invalid Version`.

**How to apply:** when patching vuln advisories via overrides, expect a full reinstall. Verify by `require()`-ing the forced pkg and reading its `package.json` version, not by `npm audit` alone — a *missing* package also has nothing to flag, so audit "RESOLVED" can mean "gone", not "fixed".

**Replit env gotcha:** a full clean install of this repo exceeds the 2-min bash timeout. The wrapper gets SIGKILL'd but the npm child orphans and survives; re-running `npm install` resumes (each pass does less work) until one pass finishes within the window. Use `--ignore-scripts --prefer-offline` to speed it up, then run `npm run db:generate` (prisma generate) manually afterward since postinstall was skipped.
