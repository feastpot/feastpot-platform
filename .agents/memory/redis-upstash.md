---
name: Redis / Upstash for BullMQ
description: Why this repo's Redis must be on a paid Upstash plan, and how the queues are tuned.
---

# Redis (Upstash) for FeastPot

`REDIS_URL` must be the TLS form `rediss://default:<password>@<host>:6379`. `app.module.ts`
maps `rediss://` → TLS automatically. The Upstash REST token is NOT the Redis password.

**Decision: Upstash must be on pay-as-you-go (not free tier).**
**Why:** the free tier caps at 500,000 commands/month and the app hit it immediately
(`ERR max requests limit exceeded`). BullMQ runs always-on workers (4 queues) plus a
throttler store + cache, so even tuned it generates ~90K idle commands/month and far more
under load — the hard cap makes the free tier unusable for live operation.
**How to apply:** if queues/crons silently stop or Redis returns `max requests limit
exceeded`, check the Upstash plan, not the code. Cost is single-digit dollars/month until
real scale; the per-request rate limiter (2 cmds/request) dominates at high traffic.

The queues are deliberately tuned for low command volume: 5-min blocking polls
(`drainDelay: 300`, `guardInterval: 300_000`, `stalledInterval: 300_000`) instead of
BullMQ's ~1s default. Do not revert this without a cost reason — default polling would
burn tens of millions of idle commands/month.

**Consequence: on-demand jobs (esp. Stripe webhooks) process with up to ~5 min latency, BY DESIGN.**
**Why:** with *named* Bull processors the worker can't use the instant blocking-pop wakeup,
so newly enqueued jobs sit in `active` and are only handled on the next ~5-min poll cycle.
A job can show `active` in healthz for minutes, then complete normally. This is NOT a stuck
worker. Confirmed in prod: a signed `payment_intent.succeeded` test event logged
`PI ... succeeded` ~5.6 min after enqueue.
**How to apply:** before declaring a webhook/worker "broken" because a job lingers in `active`,
wait one full poll cycle (~5 min) and check for the processor log / `failed` count. Also note
healthz caches queue depths for 15s (`REDIS_CHECK_TTL_MS`), and `/v1/healthz` keeps its own
cache instance — rapid re-polls can re-read the same stale snapshot. A missing named handler
fails fast with "Missing process handler for the job type X" (→ `failed`), so `failed: 0` +
lingering `active` means latency, not a routing bug.

Verify Redis from the app env (secret not in the code_execution sandbox):
`cd apps/api && node -e '...ioredis ping...'`. Confirm queues registered by SCANning
`bull:*` keys — expect queues `notifications`, `stripe-webhooks`, `payouts`, `compliance`.
