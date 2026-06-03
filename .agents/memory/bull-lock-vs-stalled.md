---
name: Bull lockDuration vs stalledInterval invariant
description: Why lengthening stalledInterval for Upstash quota requires also raising lockDuration, or jobs falsely fail as "stalled".
---

# Bull stalled-job false-failure invariant

When Bull's idle-poll settings are tuned UP to save Upstash command quota
(`stalledInterval`/`guardInterval` 30s→300s, `drainDelay` 5s→300s), you MUST
also raise `lockDuration` so it **exceeds `stalledInterval`**. The defaults
(`lockDuration` 30s, `lockRenewTime` 15s, `maxStalledCount` 1) are unsafe once
`stalledInterval` is 5min.

**Why:** Bull marks a job "stalled" only if it sits in the `active` list with no
`:lock` key (see `moveStalledJobsToWait`). With a 30s lock but a 5min sweep, a
job's lock expires ~4.5min before the sweep meant to protect it. If Upstash drops
a single `moveToCompleted`/`extendLock` command (normal for a remote,
quota-limited Redis with `maxRetriesPerRequest:3`), the job is left locked-less in
active and the next sweep force-fails it with **"job stalled more than allowable
limit"** — even though the handler already ran (symptom: duplicate success logs
like `review-trigger: requested=4` right next to the failure, and a steadily
growing `failed` count across *every* queue, not just one).

**How to apply:** Set `lockDuration` > `stalledInterval` (e.g. 600s vs 300s),
`lockRenewTime` < `stalledInterval` (e.g. 150s), and bump `maxStalledCount`
(e.g. 3) so a transient stall is reprocessed, not failed — safe only because the
handlers are idempotent. Trade-off: a genuinely crashed worker's job recovers in
~lockDuration+stalledInterval (~15min), acceptable for non-latency-critical
cron/webhook queues.

Also: Bull's `@OnQueueFailed` gate `attemptsMade >= opts.attempts` SKIPS stalled
failures (they arrive with `attemptsMade=0`, default `attempts=1`), so they never
reach Sentry. Report stalled failures explicitly (shared `shouldReportQueueFailure`
helper). And set `removeOnFail` on every queue or the failed ZSET grows forever.
