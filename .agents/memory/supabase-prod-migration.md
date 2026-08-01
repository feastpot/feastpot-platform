---
name: Dedicated prod Supabase migration (COMPLETE)
description: Status + refs for moving production off the shared dev Supabase project
---

# Dedicated prod Supabase project — migration COMPLETE (31 Jul 2026)

- **Old/shared project (dev-only now):** ref `zibmwuzxgydlvapiddhf`, named "feastpot-prod", Stockholm (eu-north-1), was free-tier.
- **New dedicated prod project:** ref `yeklvhoqanxnogjnhkui`, named "feastpot-production", London (eu-west-2), org on Pro, daily backups on, t3a.micro.

## Completed steps
- CUTOVER 31 Jul 2026 ~14:30 UTC: prod API live on new ref, healthz ok, `REQUIRE_DEDICATED_SUPABASE=true` enforcing.
- Workspace `SUPABASE_SERVICE_ROLE_KEY` rotated to new key for old project (dev use).
- Workspace `PROD_DATABASE_URL` / `PROD_DIRECT_URL` updated to new London session-pooler (port 5432).

## Remaining manual steps (user must complete)
1. **Delete the 4 NEW_SUPABASE_* workspace secrets** (Replit Secrets panel — cannot be deleted via agent tooling):
   - `NEW_SUPABASE_URL`
   - `NEW_SUPABASE_ANON_KEY`
   - `NEW_SUPABASE_SERVICE_ROLE_KEY`
   - `NEW_SUPABASE_DB_URL`
2. **Vercel check**: confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on web/vendor/admin Vercel projects point to `yeklvhoqanxnogjnhkui` and redeploy; verify login on all three portals.

**Why:** prod shared the dev project (30 Jul deploy scare); this file tracks the cut-over so a future session can resume mid-migration.
