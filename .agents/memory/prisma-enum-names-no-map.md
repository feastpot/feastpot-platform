---
name: Prisma enum names without @@map
description: Prisma enum names without @@map must match the DB type name exactly; hand-written snake_case SQL names vs PascalCase schema = CI drift; fix with idempotent ALTER TYPE RENAME.
---

## Rule
When a migration hand-writes `CREATE TYPE snake_case_name AS ENUM (...)` but the Prisma schema declares `enum PascalCaseName` without `@@map("snake_case_name")`, every `prisma migrate diff` run reports the enum as a change. Prisma requires exact name alignment when no `@@map` is present.

**Why:** Without `@@map`, Prisma compares the schema enum name directly against the Postgres type name. `feast_pass_plan` ≠ `FeastPassPlan` → perpetual CI drift.

**How to fix:**
Option A (preferred): Add a drift migration that renames the DB type:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feast_pass_plan' AND typtype = 'e') THEN
    ALTER TYPE feast_pass_plan RENAME TO "FeastPassPlan";
  END IF;
END $$;
```
`ALTER TYPE RENAME` is safe: Postgres updates the OID reference in all columns that use the type automatically. No data is affected.

Option B: Add `@@map("snake_case_name")` to the schema enum.

**How to prevent:** When hand-writing enum creation SQL in a migration, quote the name in PascalCase to match the schema (`CREATE TYPE "FeastPassPlan" AS ENUM (...)`), or use Prisma to generate the migration rather than writing raw SQL.
