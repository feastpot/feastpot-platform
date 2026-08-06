---
name: npm overrides require clean reinstall
description: Why overrides silently fail in this monorepo and how to make them take effect
---

In this npm-workspaces + Turborepo monorepo, `overrides` in root package.json do NOT take effect on an incremental `npm install`. npm reuses stale per-workspace `node_modules` copies and marks the forced packages "invalid…overridden" while keeping the old version.

**Rule:** to land an override, use an EXACT version pin (not a caret) AND do a FULL clean reinstall: `rm -rf node_modules package-lock.json apps/*/node_modules packages/*/node_modules` then `npm install`.

**Why:** caret ranges + reused node_modules let npm keep the pre-existing resolution. Targeted/partial removal of just the overridden dirs is WORSE - it leaves the tree inconsistent (npm creates empty directory stubs, transitive deps like bull→lodash/uuid go missing) and can produce a corrupt lockfile that throws `Invalid Version`.

**How to apply:** when patching vuln advisories via overrides, expect a full reinstall. Verify by `require()`-ing the forced pkg and reading its `package.json` version, not by `npm audit` alone - a *missing* package also has nothing to flag, so audit "RESOLVED" can mean "gone", not "fixed".

**Replit env gotcha:** a full clean install of this repo exceeds the 2-min bash timeout. The wrapper gets SIGKILL'd but the npm child orphans and survives; re-running `npm install` resumes (each pass does less work) until one pass finishes within the window. Use `--ignore-scripts --prefer-offline` to speed it up, then run `npm run db:generate` (prisma generate) manually afterward since postinstall was skipped. Running it detached via `nohup npm install ... &` survives the bash-tool timeout but still gets OOM-killed mid-reify (packumentCache heap >> maxSize); just keep re-running, it resumes.

**Poisoned lockfile from a corrupt tree (the killer trap):** if you run `npm install --package-lock-only` while `node_modules` is in a half-installed state (leftover `.<pkg>-<hash>` temp stub dirs from interrupted/SIGKILL'd passes), npm writes the lockfile's OPTIONAL platform-binding nodes (`@unrs/resolver-binding-*`, `@next/swc-*`, `@img/sharp-*`) WITHOUT a `version` field. Both `npm install` AND `npm ci` then crash with `TypeError: Invalid Version:` (empty) inside `Node.canDedupe`. Detect: `python3` load the lockfile, list non-link `packages` entries missing `version` - healthy ones all have it. Fix: delete `node_modules` + `apps/*/node_modules` + `packages/*/node_modules` + `package-lock.json` ENTIRELY, regenerate the lockfile with `--package-lock-only` from ZERO node_modules so npm fetches real manifests (every optional node gets a version), then reify. Before any pass, sweep stubs: `find node_modules apps/*/node_modules packages/*/node_modules -type d -name ".*-*" -prune -exec rm -rf {} +`.

**Override reaching `next`'s nested dep:** a root override (e.g. `postcss`) only collapses `next`'s own nested copy (`apps/*/node_modules/next/node_modules/postcss`) when the lockfile is regenerated from a CLEAN tree. A full `npm install` over a partly-populated tree can leave `next` pinned to its declared exact dep; verify the nested dir is gone, not just that root resolved.

**multer HIGH without a NestJS major bump:** the `multer`→`@nestjs/platform-express` HIGH advisories (GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm) cover multer ≤2.1.1 only. `npm audit` says "no fix" because platform-express still requires `multer@2.1.1`, but multer `2.2.0` is patched and same-major - add `"multer": "2.2.0"` to root overrides; platform-express stays on 11.x, no breaking upgrade. Upload routes use `FileInterceptor(..., { limits: { fileSize, files } })` as defense-in-depth.
