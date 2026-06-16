---
name: Recovering an empty/drifted Feastpot DB
description: Steps when the app DB has schema drift / no data / no _prisma_migrations.
---
# Recovering an empty or drifted Supabase DB

The app's Supabase project can end up with the schema
present but NO `_prisma_migrations`, drifted columns, and 0 rows in
public.users/vendors while `auth.users` still has accounts. Recovery order that
works:

1. `npx prisma migrate diff --from-url "$SUPABASE_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` to preview drift.
2. `npx prisma db push --accept-data-loss --skip-generate` to realign schema
   (safe when data is empty; uses directUrl = session pooler 5432).
3. `npm run db:seed` — idempotent; caches existing auth users (won't dup), upserts
   public.users + vendors + menus. It can exceed the 2-min shell cap (auth
   metadata update loop) — run in background (`nohup ... &`) and poll row counts.
4. Re-apply the Supabase auth hook + RLS policy — see supabase-auth-hook.md.
   db push does NOT restore it, and without it login is broken.

**Why:** auth.users (Supabase-managed) survives an app-schema reset, but
public.* (Prisma-managed) and the auth hook function/policy do not, so login
silently breaks even though credentials are valid.
