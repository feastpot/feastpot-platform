---
name: Deployment (FeastPot monorepo)
description: How to deploy this 4-app monorepo on Replit; why the API is VM, and the Stripe webhook bootstrap.
---

# Deploying FeastPot

Replit publishes **one service per repl**. This monorepo has 4 deployable apps
(API + web + vendor + admin), so this repl deploys the **API**; the three Next.js
frontends deploy from their own repls.

**The API must deploy as a VM (always-on), NOT autoscale.**
**Why:** the BullMQ queue workers (4 queues) and the `@Cron` jobs (Monday 02:00
payout batch, hourly event reminders, daily loyalty/DLQ) all run *inside* the
NestJS API process - there is no separate worker. Autoscale scales to zero between
requests, so crons would never fire and queued jobs would sit unprocessed.
**How to apply:** keep `deploymentTarget = "vm"`. Build `npm ci && db:generate &&
build:api`; run `db:deploy && start:api`. The API binds `process.env.PORT` (default
3001), so don't hardcode a port in the run command.

**Stripe webhook chicken-and-egg.**
**Why:** `required-env.ts` hard-exits in production if `STRIPE_WEBHOOK_SECRET` is
missing, but you can't get the real signing secret until the API is live and Stripe
can reach `/v1/webhooks/stripe`. **How to apply:** set a temporary placeholder
`STRIPE_WEBHOOK_SECRET` in the *production* env so the first publish boots, then
register the webhook against the live URL and replace the placeholder with the real
secret. Signature verification rejects events until then - acceptable pre-launch.

`db:deploy` (`scripts/db-deploy.sh`) is production-safe: psql pre-flight, `prisma
migrate deploy`, then RLS lockdown. It runs on every VM start.

**A failing `db:deploy` crash-loops the VM and surfaces as a 502, not a build error.**
**Why:** the VM run command is `db:deploy && start:api`, so if `db:deploy` exits
non-zero (e.g. P3005 before the prod DB was baselined) `start:api` never runs, the
required port (3001) never opens, healthchecks fail, and Replit suspends the
deployment. `getDeploymentInfo()` still shows `isDeployed:true, hasSuccessfulBuild:true`
because the *build* was fine - the failure is purely runtime. **How to apply:** if
`api.feastpot.co.uk` returns 502 "deployment could not be reached", read deployment
logs for the `db:deploy` failure, fix the DB, then **Redeploy** (republish) - the VM
won't self-recover from a suspended state.

**Merges to `main` don't reach the prod front-ends if the Vercel deploy-hook secrets are unset.**
**Why:** deploy.yml's `deploy-web`/`deploy-vendor`/`deploy-admin` jobs are just
`curl -fsS -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_<APP> }}"`. When those GitHub
`production`-environment secrets are empty, the URL is `""` → `curl: (3) URL rejected:
Malformed input` → the front-end jobs fail while `deploy-database`+`build-api` pass, so
production keeps serving the *old* Vercel deployment (look for a huge `age:` +
`x-vercel-cache: HIT` on the live site - that's a stale deployment, not edge cache).
**How to apply:** the user must set `VERCEL_DEPLOY_HOOK_WEB/VENDOR/ADMIN` (from each
Vercel project's Settings → Git → Deploy Hooks) as GitHub Actions secrets in the
`production` environment. Quick one-off fix without the secrets: manually Redeploy the
project from the Vercel dashboard (uses latest `main`). Note: prod web is served at
the `www.` apex (`feastpot.co.uk` 307-redirects to `www.feastpot.co.uk`).

**The GitHub Actions `deploy-api` job cannot actually deploy the Replit API.**
**Why:** it POSTs to `https://api.replit.com/v0/deployments` with a `deployment_key`,
but that host/endpoint returns 404 for everything - there is no public Replit API to
trigger a deployment from external CI. Replit deploys are user-initiated (Publish) or
via `suggestDeploy()`. **How to apply:** the real API deploy happens on Replit, not in
the pipeline. To make deploy.yml green, the `deploy-api` job must be reworked (build-
check only, or removed) and the Vercel front-end jobs re-gated off `deploy-database`.

**Production verification prerequisite:** Replit's production database is not
available to this repl until the API is published. A configured external
production database can still be queried read-only, but live Replit deployment
behavior and publish-time schema application cannot be verified beforehand.
**Why:** Preview and workspace environments do not create the Replit production
resource or its stable production URL.
**How to apply:** keep production configuration and behavioral verification
blocked until the user explicitly approves publishing.

**Keep pre-listener deployment work within the VM health-check budget.**
**Why:** Replit health checking starts before the synchronous `db:deploy` step
finishes. The API itself takes about 21 seconds to become ready; an obsolete
migration-repair probe once added 30-35 seconds and caused healthy code to be
killed before port 3001 opened.
**How to apply:** keep `db:deploy` limited to connectivity preflight, `prisma
migrate deploy`, and RLS lockdown. Run exceptional migration-history repairs
separately instead of adding them to every VM start.
