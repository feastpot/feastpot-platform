---
name: Prisma array defaults drift
description: Postgres normalises ARRAY[] cast expressions so @default([]) in schema never matches the introspected DB form; use @default(dbgenerated(...)) with the exact normalised string.
---

## Rule
Never use `@default([])` on a `String[]` column that carries a `@db.VarChar(n)` annotation. Prisma's migrate diff represents `@default([])` as `Value(List([]))` internally but Postgres normalises every ARRAY default expression to a double-cast form. They never match, so migrate diff always reports drift.

**Why:** `ALTER TABLE t ALTER COLUMN c SET DEFAULT ARRAY[]::VARCHAR(64)[]` is stored by Postgres as `(ARRAY[]::character varying[])::character varying(64)[]`. Prisma introspects this as `DbGenerated("(ARRAY[]::character varying[])::character varying(64)[]")`. Meanwhile `@default([])` is represented as `Value(List([]))`. The comparison fails regardless of how we SET DEFAULT.

**How to apply:** Use the exact Postgres-normalised expression in the schema:

```prisma
// VarChar(64) arrays
field String[] @default(dbgenerated("(ARRAY[]::character varying[])::character varying(64)[]")) @db.VarChar(64)

// VarChar(120) arrays
field String[] @default(dbgenerated("(ARRAY[]::character varying[])::character varying(120)[]")) @db.VarChar(120)
```

This makes Prisma's introspected value and schema value identical strings, so migrate diff stays silent.

**Note:** This is purely cosmetic — `ARRAY[]::VARCHAR(64)[]` and the normalised form are identical at runtime. The Prisma client still uses the TypeScript-level `@default([])` semantics when generating INSERT queries.
