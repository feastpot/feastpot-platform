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
NestJS API process — there is no separate worker. Autoscale scales to zero between
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
secret. Signature verification rejects events until then — acceptable pre-launch.

`db:deploy` (`scripts/db-deploy.sh`) is production-safe: psql pre-flight, `prisma
migrate deploy`, then RLS lockdown. It runs on every VM start.
