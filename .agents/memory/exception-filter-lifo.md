---
name: Exception filter LIFO ordering
description: NestJS resolves global filters in reverse registration order; catch-all must be first; non-HttpException messages must never reach the response body.
---

## Rule
Register `@Catch()` (catch-all) exception filters FIRST in `useGlobalFilters`. NestJS iterates the array in reverse (LIFO), so the last-registered filter runs first.

Correct order for Feastpot API:
```
app.useGlobalFilters(
  new HttpExceptionFilter(),       // catch-all fallback: FIRST (lowest priority)
  new PrismaValidationFilter(),
  new PrismaExceptionFilter(),
  new ThrottlerExceptionFilter(),  // most specific: LAST (highest priority)
);
```

**Why:** Registering `HttpExceptionFilter` last caused it to execute before the Prisma-specific filters, turning them into dead code. Any Prisma error (missing table, constraint violation) that wasn't caught by a specific filter then hit the catch-all, which was naively echoing `exception.message` — exposing table names, file paths, and schema details to callers.

**How to apply:** Any time a new `ExceptionFilter` is added, put it closer to the end of the array than the catch-all. The catch-all stays at index 0 forever.

## Sanitisation and references
An `HttpException` can also wrap a raw provider message, so all exception classes require sanitization. Preserve machine-readable application codes and HTTP status, never raw messages or stacks.

Log original diagnostics privately against a genuinely persisted incident reference. A random correlation ID can assist tracing, but is not a saved support reference. See [User-facing error references](user-error-references.md).
