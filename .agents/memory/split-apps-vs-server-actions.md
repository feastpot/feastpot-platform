---
name: Split apps — no shared server actions
description: Frontends (web/vendor/admin Next.js) can only reach data via the NestJS API over HTTP; briefs assuming Next server actions/helpers need endpoints first.
---
The monorepo runs four separate apps: Next.js customer web, vendor portal, admin, and a NestJS API. Prisma and all server data helpers live ONLY in the API.

**Why:** A pasted brief assumed components could "use the existing server helpers" directly (Next server-action style). That's impossible here — the Next apps have no DB access; the only bridge is versioned HTTP endpoints on the API (`apiRequest` clients in each app's `lib/api/`).

**How to apply:** When a brief forbids touching API routes but requires data the frontend can't currently fetch, stop and flag it — a small read/write endpoint addendum is required first. Batch endpoints (e.g. `GET /vendors/card-extras?ids=`) are the convention for card/list surfaces to avoid per-card fetches; public routes with literal path segments must be declared before `@Get(':id')` in Nest controllers.
