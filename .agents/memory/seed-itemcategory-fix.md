---
name: Seed ItemCategory and section ordering
description: Two recurring seed bugs -- ItemCategory import from Prisma client (removed from schema) and cleanup/create ordering trap.
---

# Seed: ItemCategory + section ordering

## Rule 1 -- ItemCategory is not a Prisma enum
`MenuItem.category` is a plain `VARCHAR(64)` column (not a DB enum). The Prisma generated client does NOT export `ItemCategory`. Importing it from `@prisma/client` yields `undefined` at runtime, causing `TypeError: Cannot read properties of undefined (reading 'soup')` at the first use site.

**Fix:** Define `const ItemCategory = { soup: 'soup', tray: 'tray', ... } as const` locally in `prisma/seed.ts` and remove the import.

**Why:** The enum was removed from the schema but not from the seed import; after any `prisma generate`, the import silently becomes `undefined`.

**How to apply:** Any time `prisma generate` is run after a schema change that touches `MenuItem.category`, re-check the import list.

## Rule 2 -- cleanup (2b) must come BEFORE fixture creation (2c/2d/2e)
The seed has a cleanup block (section 2b) that calls `deleteMany` on discountCodes, vendorMembers, vendorVerifications. Any fixture section that creates these rows must come AFTER 2b, not before. Creating fixtures before the cleanup causes them to be immediately deleted.

**Why:** Discovered 18 Aug 2026 -- sections 2c/2d/2e were placed before 2b, resulting in 0 verifications, 0 discount codes, 0 vendor members after every seed run.

## Rule 3 -- seedTerms() references old column name
`prisma/seed-terms.ts` still uses `summary` but the column was renamed to `change_summary` in migration `20260808120000_extend_terms_tables`. The main seed exits 0 but seedTerms() crashes silently. Fix: update all `summary` references in seed-terms.ts to `change_summary`.
