---
name: Admin UI conventions
description: How @feastpot/admin pages are structured and the role-gating rule for action buttons
---

## Page pattern
Every admin route is a server `page.tsx` that calls `requireStaff(pathname, allowedRoles?)`
(from `@/lib/auth/server-gate`), wraps children in `<StaffShell user={user}>`, and renders a
`'use client'` `*-client.tsx` sibling. List/detail data comes from TanStack Query v5 hooks in
`@/hooks/*` that go through `useApi()` → `request<T>(path)` (path includes the query string).
Shared building blocks: `PageHeader`, `TabPills`/`TabPillItem`, `StatusPill`/`StatusTone`,
`EmptyState`, `Dialog`/`DialogContent/Header/Title`, `useToast` (`@/components/ui/toaster`),
`formatDate`/`formatDateTime` (`@/lib/format`). Nav lives in `MAIN_NAV` in
`components/layout/admin-shell.tsx` (internal routes) vs `OPS_NAV` (external `target="_blank"`
links only — do NOT put internal routes there).

## Role-gating rule (the lesson)
A page's view roles are often BROADER than the roles allowed to mutate. The backend `@Roles`
on a GET can include `support` while the PATCH/POST on the same resource is `admin`/`compliance`
only. **The UI must hide/disable mutating actions to match the mutation endpoint's roles**, not
the page-view roles — otherwise lower-privilege users see buttons that always 403.

**Why:** a review flagged exactly this (support saw Approve/Reject/Resend that the API rejects).
**How to apply:** read the role off `requireStaff` in the server page, compute a capability flag
(e.g. `canModerate = role === 'admin' || role === 'compliance'`), pass it to the client, and gate
the action block on it (show a read-only notice otherwise). Backend `@Roles` stays as defense in
depth. Check the controller's per-endpoint `@Roles` — list/detail and mutation can differ.
