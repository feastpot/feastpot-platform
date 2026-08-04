---
name: Dedicated prod Supabase migration (COMPLETE)
description: Status + refs for moving production off the shared dev Supabase project
---

# Dedicated prod Supabase project — migration COMPLETE (31 Jul 2026)

- **Old/shared project (dev-only now):** ref `zibmwuzxgydlvapiddhf`, named "feastpot-prod", Stockholm (eu-north-1), was free-tier.
- **New dedicated prod project:** ref `yeklvhoqanxnogjnhkui`, named "feastpot-production", London (eu-west-2), org on Pro, daily backups on, t3a.micro.

## Completed steps
- CUTOVER 31 Jul 2026 ~14:30 UTC: prod API live on new ref, healthz ok, `REQUIRE_DEDICATED_SUPABASE=true` enforcing.
- 4 Aug 2026: old project's JWT secret rotated; it now uses NEW-format API keys (`sb_secret_...` / `sb_publishable_...`) — legacy `eyJ` anon key is DEAD. Workspace `SUPABASE_SERVICE_ROLE_KEY` = sb_secret, `NEXT_PUBLIC_SUPABASE_ANON_KEY` = sb_publishable; dev login verified (password grant OK, JWT role=admin). Note: publishable key gets 401/42501 on REST root — expected, dev anon role has no REST grants; auth endpoints are the real test.
- 4 Aug 2026: workspace `PROD_DATABASE_URL` (txn pooler :6543) / `PROD_DIRECT_URL` (session pooler :5432) verified pointing at London ref; psql connect OK.

## Remaining manual steps (user must complete)
1. **Delete the 5 NEW_SUPABASE_* workspace secrets** (Replit Secrets panel — cannot be deleted via agent tooling): NEW_SUPABASE_URL, NEW_SUPABASE_ANON_KEY, NEW_SUPABASE_SERVICE_ROLE_KEY, NEW_SUPABASE_DB_URL, NEW_SUPABASE_DB_URL variants — anything prefixed NEW_SUPABASE_.
2. **Vercel anon key still stale (4 Aug):** all 3 live portals have the new URL but still bundle the old project's dead legacy anon key → live sign-in broken ("Invalid API key"). User must paste the LONDON project's anon/publishable key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` on web/vendor/admin and redeploy, then verify login.
3. Optional: rename old project (still called "feastpot-prod") to avoid prod confusion.

**Why:** prod shared the dev project (30 Jul deploy scare); this file tracks the cut-over so a future session can resume mid-migration.
