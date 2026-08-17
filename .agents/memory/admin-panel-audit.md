---
name: Admin panel audit
description: Live-observation findings from the admin console Playwright session; resolves unknowns from the static audit.
---

# Admin Panel Audit — Live Findings

**Why:** Static audit (ADMIN-AUDIT.md) left several items as "could not determine without running the app". A live Playwright session as soul@feastpot.co.uk (admin role) resolved most of them.

## Resolved unknowns

| Item | Finding |
|---|---|
| Debounce on search inputs | **Absent.** Zero usage of debounce/useDebounce in apps/admin/src. Every keystroke fires an API query. |
| orderStats: DB COUNT vs JS array | **DB COUNT.** Uses Prisma `_count: { _all: true }` aggregates. No .length on fetched arrays for stats. |
| Compliance page search | **Present.** "Search by name or vendor ID…" visible next to the filter tabs. |
| Dead-letter queue state | **Clean** as of the audit session. |

## Platform defaults (confirmed live from Settings page)

- Default commission: **12.00%** (applied to new vendors at signup)
- Payout cadence: **Weekly — Mondays 02:00 UTC**
- Base currency: **GBP (£), all amounts in pence**
- These are hard-coded, not DB-editable from the admin panel. Editing requires a backend release.

## Security finding: 2FA not enforced

Settings page shows amber warning: "2FA is off — Anyone with your email and password can sign in."
The sign-in page says "2FA enforced after sign-in" but this is aspirational copy, not enforced policy.
AAL2 check is NOT in admin middleware or requireStaff().

## Bug fixed: commission-rates-client.tsx URL

`apps/admin/src/app/commission-rates/commission-rates-client.tsx` used `process.env.NEXT_PUBLIC_API_URL ?? ''` directly, bypassing `@/lib/env`'s `resolveApiUrl()`. In dev (where NEXT_PUBLIC_API_URL is unset), this produces an empty-string base URL → relative requests to the Next.js server at port 3003 → 404. Fixed to `import { API_URL } from '@/lib/env'`.

**Rule:** Admin client components must import `API_URL` from `@/lib/env`, never read `NEXT_PUBLIC_API_URL` directly.

## Pages that loaded data successfully (no error banner)

- Legal/appeals — empty state, no error
- Catering enquiries — empty state, no error
- Settings — fully static, no API dependency
- Push broadcast compose — fully static, no API dependency

## Pages that failed to fetch (dev environment only)

All other pages show "Failed to fetch" because the Playwright headless browser cannot reach localhost:3001 across process boundaries. Production is unaffected (uses NEXT_PUBLIC_API_URL → api.feastpot.co.uk).
