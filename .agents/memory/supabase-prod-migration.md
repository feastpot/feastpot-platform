---
name: Dedicated prod Supabase migration (in progress)
description: Status + refs for moving production off the shared dev Supabase project
---

# Dedicated prod Supabase project — migration in progress (31 Jul 2026)

- **Old/shared project (dev + current prod):** ref `zibmwuzxgydlvapiddhf`, named "feastpot-prod", Stockholm (eu-north-1), was free-tier. Becomes DEV-ONLY after cutover; rotate its service-role key then.
- **New dedicated prod project:** ref `yeklvhoqanxnogjnhkui`, named "feastpot-production", London (eu-west-2), org on Pro, daily backups on, t3a.micro.
- Runbook: `docs/runbooks/supabase-prod-migration.md` (write-freeze single-snapshot dump; auth hook + RLS re-apply per `supabase-auth-hook.md`; rollback = restart API with old secrets).
- Handover secrets expected from user: `NEW_SUPABASE_URL` / `NEW_SUPABASE_ANON_KEY` / `NEW_SUPABASE_SERVICE_ROLE_KEY` / `NEW_SUPABASE_DB_URL` (session pooler :5432). Remove after cutover.
- After cutover: flip `REQUIRE_DEDICATED_SUPABASE=true` in deployment secrets; update `supabase-db-urls.md`.
- **Prep rehearsal done 31 Jul 2026:** full public+auth copy restored to new project, counts verified, RLS script + auth-hook SQL applied, `migrate deploy` = no-op. pg_dump 16 fails vs server 17 — use `/nix/store/269nimkimaaivb4z46bjc1rnjv9jpc0l-postgresql-17.6/bin/pg_dump`. Data-only auth restore hits FK ordering (identities/sessions load before users alphabetically) — restore those tables one-by-one afterwards in dependency order. Rehearsal data must be wiped (truncate public+auth data) and re-copied under write freeze at cutover.
- **CUTOVER DONE 31 Jul 2026 ~14:30 UTC:** prod API live on new ref, healthz ok, guard enforcing (`REQUIRE_DEDICATED_SUPABASE=true` in deployment secrets). JWT hook + URL config enabled in new dashboard; hook verified via direct SQL call (admin→admin, unknown→customer).
- Deployment secrets were unlinked per-row from workspace values (workspace keeps OLD project for dev). No `DATABASE_URL`/`SUPABASE_ANON_KEY` rows exist in the deployment.
- Pending mop-up: Vercel NEXT_PUBLIC_* swap + redeploys, login tests, rotate old project's service_role key, workspace PROD_DATABASE_URL/PROD_DIRECT_URL → new pooler, delete NEW_* secrets.

**Why:** prod shared the dev project (30 Jul deploy scare); this file tracks the cut-over so a future session can resume mid-migration.
