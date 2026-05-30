---
name: NestJS global exception filter ordering
description: Counterintuitive registration order for app.useGlobalFilters and a @nestjs/throttler v6 Retry-After header quirk
---

# Global filter precedence is REVERSE of registration

Nest reverses the global filter list during resolution (`router-exception-filters.js` calls `setCustomFilters(filters.reverse())`) and selects via `selectExceptionFilterMetadata` which is a plain `.find()` first-match where an empty-`@Catch()` (catch-all) matches ANY exception.

**Net effect:** the LAST filter passed to `app.useGlobalFilters(...)` is checked FIRST.

**How to apply:** a specific typed filter (e.g. `@Catch(ThrottlerException)`) must be registered AFTER a catch-all `@Catch()` filter, or the catch-all swallows it. Order specific-last:
`useGlobalFilters(prismaFilters..., HttpExceptionFilter (catch-all), ThrottlerExceptionFilter (specific))`.

**Why:** verified empirically — a `@Catch(ThrottlerException)` filter registered FIRST was beaten by the catch-all `HttpExceptionFilter` registered last; the 429 came out with the catch-all's envelope. Moving it last fixed it.

**Gotcha discovered:** this means a catch-all registered before other specific filters silently shadows them. In this codebase the Prisma filters sit before the catch-all and so appear shadowed by it — flag if Prisma-specific envelopes ever matter.

# @nestjs/throttler v6 Retry-After

v6 sets per-throttler headers `Retry-After-{name}` (e.g. `Retry-After-short`), NOT a canonical `Retry-After`, and `ThrottlerException` carries no ttl. To expose a standard header, override `ThrottlerGuard.throwThrottlingException(context, detail)` and `res.header('Retry-After', detail.timeToBlockExpire)` (seconds) before calling super; a filter can then read it.
