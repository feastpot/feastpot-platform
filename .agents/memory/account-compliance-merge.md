---
name: Account compliance merge
description: /compliance, /account-status, /terms merged into /account-and-compliance
---

## What changed
Three separate vendor portal pages replaced by one `/account-and-compliance` page.
Old routes now redirect (one-line page files, no data fetching).

| Old route        | Action                               |
|------------------|--------------------------------------|
| /compliance      | redirect → /account-and-compliance  |
| /account-status  | redirect → /account-and-compliance  |
| /terms           | redirect → /account-and-compliance  |

## New page structure
Three ordered sections inside a single scrollable page:
1. **Standing** — AccountStatusClient (enforcement actions, client-fetched)
2. **Compliance** — ComplianceClient with `embedded` prop (suppresses its own h1)
3. **Terms and notices** — TermsClient (server-hydrated from SSR)

Server page fetches: vendor/me + vendor/:id/verification + terms view + terms history (all in parallel).

## Key files
- `apps/vendor/src/app/account-and-compliance/page.tsx` — server page
- `apps/vendor/src/app/account-and-compliance/account-and-compliance-client.tsx` — merged client
- `apps/vendor/src/app/compliance/compliance-client.tsx` — added `embedded?: boolean`; when true wraps <header>/<h1> in `{!embedded && (...)}`

## Navigation changes
- SideNav Account section: 3 items → 1 item (href=/account-and-compliance)
- TopNav: compliance + account-status + terms → single /account-and-compliance entry
- Removed `ShieldAlert` and `FileText` from side-nav imports (unused after merge)
- `use-vendor-members.ts`: kitchen_manager + finance now match /^\/account-and-compliance/
  instead of /^\/compliance/; finance updated /^\/analytics/ → /^\/performance/

**Why:** Three small pages with overlapping auth/status content; merging ensures enforcement
(Standing) is always the first thing a vendor sees and reduces navigation clutter.

**How to apply:** The `embedded` prop on ComplianceClient is the pattern to use whenever
compliance content needs to be included inside a parent page that provides its own heading.
