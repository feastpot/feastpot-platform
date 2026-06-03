---
name: Queue-infra crons & queues.module circular import
description: Where to host queue-monitoring crons and why they can't live in queues.module
---

# Hosting queue-monitoring crons (depth/health alarms)

`queues.module.ts` exports the Bull queue-name constants (NOTIFICATIONS_QUEUE,
etc.) AND registers the Bull queue providers. Any service that uses `@InjectQueue`
imports those constants from `queues.module`.

**Rule:** Do NOT add such a service to `QueuesModule`'s own `providers`. Doing so
makes `queues.module` import the service while the service imports the constants
back from `queues.module` — a circular import. The `@InjectQueue(CONST)`
decorators evaluate at class-definition time, before the constants are defined in
the half-loaded `queues.module`, so the queue name resolves to `undefined`.

**How to apply:** Host queue-monitoring crons in a *separate* module (e.g.
`QueueMonitorModule`) registered in `app.module`. The queue providers (from the
`@Global` QueuesModule) and `RedisCacheService` (also `@Global`) inject fine
without re-importing anything. `ScheduleModule.forRoot()` in app.module discovers
`@Cron` methods on any instantiated provider, so no extra wiring is needed.

**Why:** This is how Task #39's QueueDepthMonitorService is wired. Two monitors
now read the same queues: daily email digest (`DlqMonitorService`, admin module)
and the 5-min Sentry depth alarm (`QueueDepthMonitorService`).
