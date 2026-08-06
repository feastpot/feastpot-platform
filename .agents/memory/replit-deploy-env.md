---
name: Replit deployment env gotchas
description: How NODE_ENV and scoped secret keys behave in this repo's Replit VM deployment.
---

# Replit VM deployment env gotchas

## NODE_ENV is NOT auto-set to "production" in the deployment
A published VM deployment runs with `NODE_ENV` unset unless you set it. The API gates real
behavior on `NODE_ENV === 'production'` (debug/test endpoints return 404 only in prod, redis
hard-exit on auth failure, required-env hard-exit, log level, prisma logging). If unset, prod
silently runs in dev mode (debug endpoints exposed, etc).

**Symptom:** prod boot log shows `[STARTUP] WARNING: STRIPE_SECRET_KEY is a live key in a
non-production environment` even though it's the live key - that warning means `NODE_ENV !== production`.

**Why not set it as a production env var:** the deploy *build* command runs `npm ci`. With
`NODE_ENV=production` in the environment, `npm ci` omits devDependencies (tsc, nest cli) →
`build:api` fails. So DON'T set NODE_ENV via the Publishing env vars.

**How to apply:** set it runtime-only. `.replit` can't be hand-edited (blocked). The deploy run
cmd calls `npm run start:api`; bake it into that script in root package.json:
`"start:api": "NODE_ENV=production node apps/api/dist/main.js"`. Build phase + dev workflow
(`npm run dev`) are unaffected. Requires a redeploy to take effect.

## Scoped env vars are PLAINTEXT in git-tracked .replit - don't put live keys there
Replit Secrets are encrypted but GLOBAL (same value in dev+prod). Env vars
(`setEnvVars`/`requestEnvVar` requestType "envvar") CAN be scoped per environment, but they're
written to `.replit` `[userenv.production]`/`[userenv.development]` in PLAINTEXT, and `.replit`
is git-tracked. So env-scoping a live `sk_live_…` key writes it into a committed file (leak risk,
esp. with a repo GITHUB_TOKEN). Also: you cannot have an encrypted secret AND an env var of the
same name (`requestEnvVar` errors). So "encrypted + per-env" for ONE canonical name is impossible.

## Org standard: per-env ENCRYPTED secrets + code-based selection by NODE_ENV
**The adopted pattern** (use this, not plaintext env-scoping): store two differently-named
encrypted secrets per credential - `<NAME>_LIVE` and `<NAME>_TEST` - and select at boot in code.
A tiny resolver copies the right one into the canonical name the app reads, keyed on
`NODE_ENV === 'production' ? _LIVE : _TEST`. Resolver MUST run before the required-env gate AND
before NestFactory.create() (ConfigModule snapshots process.env at init); also call it at the top
of any standalone ts-node script that reads the canonical var.
**Why:** keeps live creds encrypted-at-rest and out of git while still giving prod live + dev test
values simultaneously - which a single scoped env var can't do on Replit.
**Edge case:** make the resolver NOT overwrite an already-set canonical var, but then ensure no
stale canonical `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` lingers in deployment env settings, or
it silently overrides the mapping.

## Deployment secrets are a SEPARATE snapshot from workspace App Secrets
A VM deployment carries its own copy of each secret, captured in the Publishing/Deployments config.
Editing a secret in the workspace Secrets tab and re-publishing does NOT overwrite a value the
deployment already holds for that key - the deployment keeps its stored value.
**Symptom seen:** workspace `STRIPE_SECRET_KEY_LIVE` was a real `sk_live_` key (verified at runtime
in dev), yet prod crash-looped `[STARTUP] CRITICAL: STRIPE_SECRET_KEY is a test key in production`
through multiple republishes - because the deployment's own `STRIPE_SECRET_KEY_LIVE` copy was still a
`sk_test_` value from an earlier publish.
**How to apply:** when prod env/secret behavior disagrees with the workspace value, don't keep
re-publishing - update the secret in the deployment's OWN secrets pane (Publish dialog → secrets),
then redeploy. Diagnose key mode without leaking the value: `node -e` printing only
`startsWith('sk_live_')`/`startsWith('sk_test_')` booleans + length.

**Shared Supabase project (Jul 2026 outage):** prod and dev BOTH run on the shared Supabase ref `zibmwuzxgydlvapiddhf` - there is no dedicated prod project. A startup guard that hard-exited on "dev ref in production" took the live API down on republish. Guards about aspirational infra must be opt-in (`REQUIRE_DEDICATED_SUPABASE=true`), never fatal by default. Also: `PROD_DATABASE_URL`/`SUPABASE_DB_URL` point at the same DB.
