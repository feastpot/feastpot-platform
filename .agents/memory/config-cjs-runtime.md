---
name: packages/config CJS runtime entries
description: Why packages/config needs hand-maintained .cjs.js files and how to keep them in sync.
---

## The rule
`packages/config/package.json` exports must include a `"require"` condition pointing to plain CJS `.js` files for every entry used by the NestJS API at runtime (`platform-facts`, `service-fee`, `allergens`).

**Why:** The API's production deployment runs `node apps/api/dist/main.js` (pure Node.js, no TypeScript loader). The compiled dist does `require("@feastpot/config/…")` which resolves via the package `exports` field. Without a `require` condition, the `default` entry (pointing to the `.ts` source) is used. Node.js tries to execute the `.ts` file as ESM (because it has `import` syntax), then fails to resolve the extensionless relative import `'./platform-facts'` — `ERR_MODULE_NOT_FOUND` crash-loop.

Next.js apps (`web`, `vendor`, `admin`) are unaffected because they use a TypeScript loader (Webpack + ts-loader) that can handle `.ts` imports directly.

## Current CJS files
- `packages/config/src/platform-facts.cjs.js` — mirrors `platform-facts.ts`
- `packages/config/src/service-fee.cjs.js` — mirrors `service-fee.ts` (depends on `platform-facts.cjs.js`)
- `packages/config/src/allergens.cjs.js` — mirrors `allergens.ts`

## Sync requirement
**Any change to `platform-facts.ts`, `service-fee.ts`, or `allergens.ts` MUST be mirrored in the corresponding `.cjs.js` file.** Failure to do so will cause a production crash-loop on the next deploy. A proper fix is to add a build step that auto-generates these files (see follow-up task).

**How to apply:** When editing any of the three `.ts` files in `packages/config/src`, open the matching `.cjs.js` file and apply the same change in plain JS (no TypeScript syntax, use `exports.X =` not `export const X`).
