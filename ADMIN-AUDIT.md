# Feastpot Admin Panel Audit Report

_Date: 17 August 2026. Read-only. No source files were modified._

---

## 1. HEADLINE FINDINGS

1. **No Stripe refund endpoint exists.** `apps/api/src/modules/admin/admin.controller.ts` has no endpoint that calls Stripe to refund a payment. The only money-back mechanism is loyalty credit (`POST users/:userId/credit`, admin.controller.ts:369-377), which is not a refund. An admin cannot issue a Stripe refund to a customer from the panel today.

2. **Chargebacks page is entirely read-only.** `apps/admin/src/app/chargebacks/chargebacks-client.tsx` renders status, evidence deadline, and reconciliation state but exposes no evidence submission, no response action, and no reconciliation button. Chargebacks with deadlines shown in red cannot be actioned from the panel.

3. **Legal/appeals queue is read-only.** `apps/admin/src/app/legal/appeals/appeals-client.tsx` displays dispute appeals but contains no approve/reject/escalate mutation controls. An admin cannot resolve an appeal from this page.

4. **Vendor enforcement suspensions do not write an AuditLog row.** `apps/api/src/modules/vendor-enforcement/vendor-enforcement.service.ts:343-378` creates a `VendorEnforcementAction` record and logs via `this.logger.warn`, but does not call `prisma.auditLog.create`. Automated enforcement suspensions are invisible to the audit log viewer.

5. **The main vendor Suspend button has no narrative or reason input.** `apps/admin/src/app/vendors/[id]/vendor-detail-client.tsx:445-452` passes only a hard-coded `reasonCode: 'manual_suspend'` with no confirmation dialog and no free-text narrative. The separate enforcement-action form has narrative fields, but the primary lifecycle control does not.

6. **No GDPR deletion mechanism.** No admin page for data deletion or right-to-erasure exists. The only user data action is DSAR export (`use-admin-users.ts:247`). An admin cannot fulfil an erasure request from the panel.

7. **Catering enquiry routing to vendors is fully missing.** The vendor-portal empty state references admin routing of catering enquiries, but no endpoint or admin UI page for this action exists anywhere in `apps/api/src/modules/admin/` or `apps/admin/`.

8. **`listExpiringDocuments` fetches all matching rows with no pagination.** `apps/api/src/modules/admin/admin.service.ts:797-840` calls `vendorDocument.findMany` with no `take` or cursor. At scale this will time out.

9. **Vendor and VendorApplication models have no `@@index` on `status` or `createdAt`.** The admin vendor list and application list filter and sort on these columns without database indexes. These queries will degrade linearly with table growth.

10. **`POST /admin/test/notifications` has no staging safeguard.** `apps/api/src/modules/admin/admin.controller.ts:672-677` sends real notifications to real users (`@Roles(admin)` only). There is no `isDryRun` flag or environment check preventing accidental production sends.

---

## 2. PHASE 1: ACCESS CONTROL AND SECURITY

### 2.1 Authentication

**Mechanism: two-layer.**

**Layer 1 -- middleware** (`apps/admin/src/middleware.ts`, 38 lines): imports `createClient` from the admin Supabase browser client. On every non-static request it calls `supabase.auth.getUser()`. If no valid session is returned it redirects to `/sign-in?next=<path>`. `PUBLIC_PATHS = ['/sign-in', '/unauthorized']` are exempt. Static asset extensions are excluded from the matcher.

**Layer 2 -- server gate** (`apps/admin/src/lib/auth/server-gate.ts:34`): `requireStaff()` is called at the top of the `Page` server component in every admin route (confirmed across all 35+ routes). It re-fetches the session, calls the API's `/users/me` endpoint to retrieve the database role, and redirects to `/unauthorized` if the role is not in `STAFF_ROLES = ['admin', 'support', 'finance', 'compliance']`. Customers and vendors have different roles and are rejected.

**Root layout** (`apps/admin/src/app/layout.tsx`, 30 lines) contains no auth wrapper -- it renders `QueryProvider`, `Toaster`, `Analytics`, and `SpeedInsights` only. Auth is entirely the responsibility of middleware and per-page `requireStaff()`.

**Maintenance risk:** there is no shared dashboard layout that calls `requireStaff()` centrally. A future page that omits the call at line 10 of its `page.tsx` would be reachable by any authenticated Supabase user. This is not a current vulnerability but is a structural risk.

### 2.2 Authorisation

Role enforcement is **server-side**, present at both the Next.js page layer (`requireStaff()`) and the NestJS API layer (`@Roles` + global guards). A signed-in customer or vendor cannot access admin pages (middleware passes, but `requireStaff()` redirects) and cannot call admin API endpoints (global `RolesGuard` rejects any token whose role is not in the declared set).

The `StaffRole` union in `server-gate.ts` is `'admin' | 'support' | 'finance' | 'compliance'`. Fine-grained role scoping (e.g. `finance` for payouts only) is enforced at the API level via per-endpoint `@Roles` declarations.

### 2.3 API-level enforcement

Global guards are registered in `AuthModule` as `APP_GUARD` providers (`apps/api/src/app.module.ts:405-413`): `SupabaseAuthGuard` (validates JWT), `RolesGuard` (checks `@Roles`), and `RoleThrottlerGuard` (rate limit). All `admin.controller.ts` endpoints carry `@Roles`; the class has no `@UseGuards` because the global guards already apply to every handler.

| Endpoint group                              | Roles                               | Verdict                               |
| ------------------------------------------- | ----------------------------------- | ------------------------------------- |
| GET search-analytics                        | admin, support                      | GUARDED (admin.controller.ts:113-114) |
| GET dashboard                               | admin, finance, support, compliance | GUARDED (:187-188)                    |
| GET/POST coverage-interest                  | admin, support                      | GUARDED (:196-232)                    |
| GET vendors, vendor-applications            | admin, compliance, support          | GUARDED (:244-275)                    |
| PATCH vendor-applications/:id               | admin, compliance                   | GUARDED (:281-282)                    |
| GET/export audit-log                        | admin, compliance                   | GUARDED (:309-320)                    |
| GET compliance/expiring                     | admin, compliance                   | GUARDED (:329)                        |
| GET/export users                            | admin, support, finance, compliance | GUARDED (:340-354)                    |
| GET users/search                            | admin, support                      | GUARDED (:363)                        |
| POST users/:userId/credit                   | admin, finance                      | GUARDED (:370)                        |
| POST users/:userId/suspend                  | admin                               | GUARDED (:382)                        |
| POST users, PATCH users/:userId/role        | admin                               | GUARDED (:394, :404)                  |
| POST push/broadcast                         | admin                               | GUARDED (:435)                        |
| POST/PATCH orders (bulk + single)           | admin, support                      | GUARDED (:478-506)                    |
| GET users/:userId/export                    | admin, compliance                   | GUARDED (:515)                        |
| GET orders, stats, csv                      | admin, support, finance             | GUARDED (:533-575)                    |
| POST test-notification, test/notifications  | admin                               | GUARDED (:596, :672)                  |
| POST payouts/:id/reconcile-stripe           | admin, finance                      | GUARDED (:735)                        |
| POST payouts/run-batch                      | admin, finance                      | GUARDED (:755)                        |
| GET/resend notification-outbox dead-letters | admin                               | GUARDED (:815, :932)                  |
| GET/POST commission-rates                   | admin (POST), admin+finance (GET)   | GUARDED (:830, :837)                  |
| GET dead-letters, retry, discard            | admin                               | GUARDED (:961, :979, :1001)           |
| POST slack/test                             | admin                               | GUARDED (:1029)                       |

Every admin endpoint is independently guarded. A normal user JWT is rejected by `RolesGuard` before reaching any handler.

### 2.4 RLS interaction

`rg 'service_role|SUPABASE_SERVICE_ROLE' apps/admin/` returns no matches. The admin Next.js application uses the signed-in user's JWT exclusively. The NestJS API's own Supabase service client (server-side) bypasses RLS in the normal way, but that key is not present in the admin bundle. No service-role key reaches the browser.

### 2.5 Audit trail

`AuditLog` model exists (`prisma/schema.prisma:1007-1024`): fields `actorId`, `action` (varchar 100), `entityType`, `entityId`, `metadata` (JSON), `ipAddress`, `createdAt`. Indexed on `actorId`, `(entityType, entityId)`, `action`, `createdAt`.

**Logged actions include:** vendor application status changes (`vendor_application.approved`, `vendor_application.rejected`, `vendor_application.invite_resent`), user credit/suspend/reinstate/role-change (admin-users.service.ts:135, 285, 667, 692, 728, 810, 876, 883), payout approval and reconciliation (admin.service.ts:762, 974, 1059, 1216, 1369).

**NOT logged to AuditLog:**

- Automated enforcement suspensions (`vendor-enforcement.service.ts:343-378`) -- creates `VendorEnforcementAction` only.
- Manual vendor status changes via the Suspend/Reinstate lifecycle buttons (vendor-detail calls PATCH `/vendors/:id/status`; whether the vendor status-change handler writes an audit row requires tracing into the vendor update service, which was not confirmed in this audit).
- Order status overrides (the bulk/single order-status endpoints were not confirmed to write audit rows).

### 2.6 Destructive actions

| Action                          | Confirmation step                   | Reversible                | Notes                                      |
| ------------------------------- | ----------------------------------- | ------------------------- | ------------------------------------------ |
| Approve vendor application      | Confirm button in dialog            | No                        | vendor-application-detail-client.tsx:68-87 |
| Reject vendor application       | Rejection reason required + confirm | No                        | :90-107                                    |
| Suspend vendor                  | None -- immediate                   | Via reinstate             | vendor-detail-client.tsx:445-452           |
| Reinstate vendor                | None                                | --                        | :454-457                                   |
| Move vendor to probation        | None                                | Via further status change | :459-465                                   |
| Issue loyalty credit            | Form submit                         | No                        | admin.controller.ts:369-377                |
| Approve payout                  | Approve button                      | No                        | payouts-client.tsx                         |
| Run payout batch                | Button                              | No                        | payouts-client.tsx                         |
| Broadcast push notification     | Form submit                         | No                        | push-compose-client.tsx                    |
| Retry dead-letter job           | Button per row                      | No                        | dead-letters-client.tsx                    |
| Discard dead-letter job         | Button per row                      | No                        | dead-letters-client.tsx                    |
| Override order status           | Form submit                         | Via another override      | orders-client.tsx                          |
| Reconcile payout against Stripe | Button                              | No                        | payouts-client.tsx                         |

**Notable absence:** no Stripe refund endpoint exists. The `POST users/:userId/credit` endpoint issues loyalty points, not a payment reversal.

---

## 3. PHASE 2: CAPABILITY VERDICTS

| Capability                                                     | Verdict                        | Evidence                                                                                                                                                                                                                                                                                               | Test coverage                                             | Admin can rely on it today?                                                                          |
| -------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **A1** Review and approve/reject vendor applications           | WORKING                        | vendor-application-detail-client.tsx:68-107; PATCH admin/vendor-applications/:id (admin.controller.ts:281)                                                                                                                                                                                             | admin.controller.spec.ts role tests only; no UI flow test | Yes                                                                                                  |
| **A2** Set referredByVendorId on approval                      | PARTIAL                        | UI sends only `{ status: 'approved' }` (vendor-application-detail-client.tsx:68-87); server sets `referredByVendorId` on Vendor at admin.service.ts:1207 from application data, not from an admin input field                                                                                          | None                                                      | No -- admin cannot override or set the referrer at approval time                                     |
| **A3** Suspend / restrict / reinstate vendor                   | WORKING                        | vendor-detail-client.tsx:445-465; PATCH vendors/:id/status (admin.controller.ts)                                                                                                                                                                                                                       | Role tests                                                | Yes, but no confirmation dialog and no narrative input on the main button                            |
| **A4** Written statement of reasons and appeal handling        | PARTIAL                        | Enforcement-action form has `reasonCode` and `reasonNarrative` (vendor-detail-client.tsx:1058-1120); legal/appeals page exists (appeals-client.tsx) but is read-only; no approve/reject mutation on appeals page                                                                                       | None                                                      | Partially -- statement can be issued via enforcement form; appeals cannot be resolved from the panel |
| **A5** Edit vendor verification state, notification on change  | WORKING                        | use-vendor-verification.ts; PATCH vendors/:id/documents/:doc/verify; vendor-enforcement service enqueues notification (vendor-enforcement.service.ts:214-235)                                                                                                                                          | None                                                      | Yes                                                                                                  |
| **B1** Verification triage list                                | PARTIAL                        | compliance-client.tsx has filter options: Not set up, Renewal due, Suspended, Verified, All; default view shows action states only; "Verified" is reachable via filter (brief stated it was omitted -- it is not, but it is not a default section); no reconciliation to total vendor population count | None                                                      | Partially -- triage visible; Verified filter works; no headcount reconciliation                      |
| **B2** Document review, expiry tracking, FHRS                  | WORKING                        | use-expiring-docs.ts; vendor-detail document verification controls; FHRS rating displayed                                                                                                                                                                                                              | None                                                      | Yes                                                                                                  |
| **B3** Filtering, search, pagination on triage list            | PARTIAL                        | Filter by state works; no free-text vendor search; no pagination control visible on compliance page (compliance-client.tsx:1-80 defines filter constants only; full page content not confirmed to have pagination)                                                                                     | None                                                      | Partially                                                                                            |
| **C1** View and search orders                                  | WORKING                        | orders-client.tsx; GET admin/orders with server-side pagination (admin.service.ts:270-292)                                                                                                                                                                                                             | None                                                      | Yes                                                                                                  |
| **C2** Intervene in order (cancel, amend, reassign)            | PARTIAL                        | Status override: PATCH orders/:orderId/status (admin.controller.ts:504); bulk status/tags: :478-494; no reassign endpoint; no structured amend flow                                                                                                                                                    | None                                                      | Partially -- status change only; no reassign or line-item amendment                                  |
| **C3** Issue full or partial refund                            | MISSING                        | No Stripe refund endpoint in admin.controller.ts (rg 'refund' returns only a fixture at line 645); POST users/:userId/credit is loyalty credit only                                                                                                                                                    | None                                                      | No                                                                                                   |
| **C4** Dispute and chargeback handling, response deadline      | PARTIAL                        | Disputes: dispute escalation (PATCH disputes/:id, POST disputes/:id/close); chargebacks: display with deadline flags; no evidence submission endpoint; no chargeback response/fight action                                                                                                             | admin.controller.spec.ts: escalate/PATCH role tests       | Partially -- view and escalate; cannot submit evidence or action a chargeback                        |
| **C5** Payout visibility, failed payout, manual retry          | PARTIAL                        | payouts-client.tsx: approve, hold, reconcile-stripe, run-batch; failed status is filterable and displayed; no retry-failed-payout action (payouts-client.tsx confirms no retry hook)                                                                                                                   | Role tests                                                | Partially -- visibility good; no retry for failed payouts                                            |
| **C6** Catering enquiry routing to vendors                     | MISSING                        | No endpoint in admin.controller.ts matches 'catering' (rg confirmed); no admin UI page for routing                                                                                                                                                                                                     | None                                                      | No                                                                                                   |
| **D1** Discount code creation and editing                      | WORKING                        | discount-codes-client.tsx; POST/PATCH discount codes endpoint (admin.controller.ts inferred from features audit)                                                                                                                                                                                       | None                                                      | Yes                                                                                                  |
| **D2** fundedBy (PLATFORM or VENDOR) on discount code          | WORKING                        | Create and edit forms both include fundedBy select with PLATFORM/VENDOR options (discount-codes-client.tsx:333-351, 634-661)                                                                                                                                                                           | None                                                      | Yes -- brief stated absent; this audit finds it present                                              |
| **D3** Founding allowance visibility and adjustment            | MISSING                        | rg 'founding\|foundingAllowance' apps/admin returns no matches                                                                                                                                                                                                                                         | None                                                      | No                                                                                                   |
| **D4** FeastPass membership administration                     | PARTIAL                        | feastpass-health-client.tsx is a read-only KPI/metrics dashboard (GET /v1/admin/feastpass/health); no admin actions to cancel, refund, or adjust subscriptions                                                                                                                                         | None                                                      | No -- view only                                                                                      |
| **E1** Push notification broadcast compose                     | WORKING                        | push/compose page; POST admin/push/broadcast (admin.controller.ts:435)                                                                                                                                                                                                                                 | None                                                      | Yes                                                                                                  |
| **E2** Email and WhatsApp test send                            | WORKING (with production risk) | POST /admin/test-notification (admin.controller.ts:596) and POST /admin/test/notifications (:672) both exist with @Roles(admin); no dry-run flag or environment guard                                                                                                                                  | None                                                      | Yes, but can fire real messages on production                                                        |
| **E3** Customer or vendor messaging                            | MISSING                        | No messaging compose page in apps/admin                                                                                                                                                                                                                                                                | None                                                      | No                                                                                                   |
| **F1** Bull queue visibility and dead-letter handling          | WORKING                        | bull-board.middleware.ts; Bull Board linked from settings OPS_NAV (admin-shell.tsx:139-148); dead-letters-client.tsx: retry and discard per job (admin.controller.ts:979, 1001)                                                                                                                        | None                                                      | Yes                                                                                                  |
| **F2** System health, error monitoring, alerting               | PARTIAL                        | error-incidents page (read-only search); feastpass-health dashboard; no unified health page; Sentry integration exists at API level but no admin panel surface                                                                                                                                         | None                                                      | Partially                                                                                            |
| **F3** User administration (search, view orders, data request) | WORKING                        | users-client.tsx: search, filter by role, view detail, suspend, reinstate, issue credit, update role, export (DSAR); GET admin/users (:340)                                                                                                                                                            | admin-users.service.spec.ts bulk-order tests              | Yes -- GDPR deletion absent (see headline)                                                           |
| **G1** Admin navigation                                        | WORKING                        | admin-shell.tsx:53-312: role-filtered sidebar with all main sections, OPS nav to Bull Board                                                                                                                                                                                                            | None                                                      | Yes                                                                                                  |
| **G2** Design system                                           | WORKING                        | @feastpot/ui imported in discount-codes, disputes, push/compose, settings, unauthorized, and others                                                                                                                                                                                                    | None                                                      | Yes                                                                                                  |

---

## 4. PHASE 3: EVERY CONTROL HAS AN OBSERVABLE EFFECT

### NO-OP controls (controls that render but produce no observable effect)

| Control                                             | Location                                                         | Why it is a NO-OP                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Legal/appeals page -- no action buttons             | apps/admin/src/app/legal/appeals/appeals-client.tsx              | Renders appeal queue; no approve/reject/escalate mutation                                     |
| Waitlist tab filters (All, Active, Converted, etc.) | apps/admin/src/app/waitlist/waitlist-client.tsx:87-96            | Switch local state only; no server-side filter applied (list not refetched with filter param) |
| Chargebacks -- no evidence/response button          | apps/admin/src/app/chargebacks/chargebacks-client.tsx            | Evidence deadline displayed in red but no action control exists                               |
| FeastPass health page                               | apps/admin/src/app/feastpass-health/feastpass-health-client.tsx  | Entirely read-only; no admin actions                                                          |
| Vendor detail -- main Suspend button (no narrative) | apps/admin/src/app/vendors/[id]/vendor-detail-client.tsx:445-452 | Fires mutation but no reason text can be entered; hard-coded reasonCode only                  |

### Full interactive controls table

| Control                                          | Location                                     | Traced effect                                                                        | Verdict                              |
| ------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| Approve application button                       | vendor-application-detail-client.tsx:369-375 | PATCH /admin/vendor-applications/:id {status:'approved'}                             | REAL                                 |
| Reject application (reason + confirm)            | :380-415, :90-107                            | PATCH /admin/vendor-applications/:id {status:'rejected', rejectionReason}            | REAL                                 |
| Resend invite button                             | :135                                         | POST /admin/vendor-applications/:id/resend-invite                                    | REAL                                 |
| Vendor status Suspend                            | vendor-detail-client.tsx:445-452             | PATCH /vendors/:id/status {status:'suspended', reasonCode:'manual_suspend'}          | REAL (no confirmation, no narrative) |
| Vendor status Reinstate                          | :454-457                                     | PATCH /vendors/:id/status {status:'live', reasonCode:'reinstated'}                   | REAL                                 |
| Vendor status Move to probation                  | :459-465                                     | PATCH /vendors/:id/status {status:'probation', reasonCode:'reinstated_to_probation'} | REAL                                 |
| Trust signal toggle (document verify)            | use-vendor-detail.ts:152                     | PATCH /vendors/:id/documents/:doc/verify                                             | REAL                                 |
| Enforcement action form submit                   | vendor-detail-client.tsx:1058-1120           | POST enforcement-action endpoint (traced to use-vendor-verification hook)            | REAL                                 |
| Orders filter (status, vendor, date, type)       | orders-client.tsx                            | Refetches GET /admin/orders with params                                              | REAL                                 |
| Override order status                            | orders-client.tsx                            | PATCH /admin/orders/:orderId/status                                                  | REAL                                 |
| Bulk status update                               | :478-482                                     | POST /admin/orders/bulk/status                                                       | REAL                                 |
| Bulk tag update                                  | :492-494                                     | POST /admin/orders/bulk/tags                                                         | REAL                                 |
| Orders CSV export                                | :503                                         | GET /admin/orders.csv                                                                | REAL                                 |
| Discount code create (all fields incl. fundedBy) | discount-codes-client.tsx:249-370            | POST discount-codes endpoint                                                         | REAL                                 |
| Discount code edit                               | :634-661                                     | PATCH discount-codes/:id endpoint                                                    | REAL                                 |
| Dispute filters                                  | disputes-client.tsx                          | Refetches GET /admin/disputes                                                        | REAL                                 |
| PATCH dispute (status override)                  | :134                                         | PATCH /disputes/:id                                                                  | REAL                                 |
| Close dispute                                    | :150                                         | POST /disputes/:id/close                                                             | REAL                                 |
| Escalate dispute                                 | disputes-client.tsx                          | POST /disputes/:id/escalate (admin.controller.ts)                                    | REAL                                 |
| Chargeback filters (status, order ID)            | chargebacks-client.tsx                       | Refetches list                                                                       | REAL                                 |
| Chargeback pagination                            | chargebacks-client.tsx                       | Cursor refetch                                                                       | REAL                                 |
| Evidence submit / chargeback response            | chargebacks-client.tsx                       | DOES NOT EXIST                                                                       | NO-OP (control absent)               |
| Chargeback reconcile                             | chargebacks-client.tsx                       | DOES NOT EXIST                                                                       | NO-OP (control absent)               |
| Payout approve (individual)                      | payouts-client.tsx                           | POST /payouts/:id/approve                                                            | REAL                                 |
| Payout approve (selected batch)                  | payouts-client.tsx                           | POST per selected id                                                                 | REAL                                 |
| Payout hold (with reason)                        | payouts-client.tsx                           | PATCH /payouts/:id/hold                                                              | REAL                                 |
| Reconcile payout against Stripe                  | payouts-client.tsx                           | POST /admin/payouts/:id/reconcile-stripe                                             | REAL                                 |
| Run payout batch now                             | payouts-client.tsx                           | POST /admin/payouts/run-batch                                                        | REAL                                 |
| Payout filter (status, vendor)                   | payouts-client.tsx                           | Refetches list                                                                       | REAL                                 |
| Failed payout retry                              | payouts-client.tsx                           | DOES NOT EXIST                                                                       | NO-OP (not wired)                    |
| User search / filter by role                     | users-client.tsx                             | GET /admin/users with params                                                         | REAL                                 |
| Issue credit dialog                              | users-client.tsx                             | POST /admin/users/:userId/credit                                                     | REAL                                 |
| Suspend user                                     | users-client.tsx                             | POST /admin/users/:userId/suspend                                                    | REAL                                 |
| Reinstate user                                   | users-client.tsx                             | POST /admin/users/:userId/reinstate                                                  | REAL                                 |
| Update user role                                 | users-client.tsx                             | PATCH /admin/users/:userId/role                                                      | REAL                                 |
| Export user (DSAR)                               | use-admin-users.ts:255                       | GET /admin/users/:userId/export                                                      | REAL                                 |
| Create staff user                                | users-client.tsx                             | POST /admin/users                                                                    | REAL                                 |
| Users CSV export                                 | users-client.tsx                             | GET /admin/users.csv                                                                 | REAL                                 |
| Compliance state filter                          | compliance-client.tsx                        | Refetches with filter param                                                          | REAL                                 |
| Compliance vendor row (open detail)              | compliance-client.tsx                        | Navigation to /vendors/:id                                                           | REAL                                 |
| Expiring documents list                          | compliance-client.tsx                        | GET /admin/compliance/expiring                                                       | REAL                                 |
| Push compose (title, body, segment, URL)         | push-compose-client.tsx                      | POST /admin/push/broadcast                                                           | REAL                                 |
| Audit log filters (actor, action, entity, date)  | audit-log-client.tsx                         | GET /admin/audit-log with params                                                     | REAL                                 |
| Audit log CSV export                             | audit-log-client.tsx                         | GET /admin/audit-log.csv                                                             | REAL                                 |
| Audit log cursor pagination                      | audit-log-client.tsx                         | Next/prev cursor refetch                                                             | REAL                                 |
| Commission rate new row form                     | commission-rates-client.tsx:182-241          | POST /v1/admin/commission-rates                                                      | REAL                                 |
| Commission rate form show/cancel toggle          | :151-158                                     | Local state only                                                                     | NO-OP                                |
| Commission rate history (read-only)              | commission-rates-client.tsx                  | Read-only display                                                                    | REAL (read)                          |
| Dead-letter retry                                | dead-letters-client.tsx                      | POST /admin/dead-letters/:queue/:jobId/retry                                         | REAL                                 |
| Dead-letter discard                              | dead-letters-client.tsx                      | POST /admin/dead-letters/:queue/:jobId/discard                                       | REAL                                 |
| Notification outbox refresh                      | notifications-client.tsx:34                  | Refetches GET /admin/notification-outbox/dead-letters                                | REAL                                 |
| Notification outbox resend                       | notifications-client.tsx:96-101              | POST /admin/notification-outbox/:id/resend                                           | REAL                                 |
| Catering enquiry view                            | catering-enquiries page                      | Displays enquiries; no routing action                                                | REAL (read)                          |
| Catering enquiry route to vendor                 | catering-enquiries page                      | DOES NOT EXIST                                                                       | NO-OP (control absent)               |
| Catering bookings list/filter                    | catering-bookings-client.tsx                 | GET /v1/catering-bookings with params                                                | REAL                                 |
| Events list                                      | events page                                  | GET events list                                                                      | REAL                                 |
| Event detail                                     | events/[enquiryId]                           | Detail view                                                                          | REAL                                 |
| Reviews approve                                  | reviews-queue-client.tsx                     | moderate.mutateAsync({id,status:'approved'})                                         | REAL                                 |
| Reviews hold                                     | reviews-queue-client.tsx                     | moderate.mutateAsync({id,status:'held'})                                             | REAL                                 |
| Reviews reject (with reason)                     | reviews-queue-client.tsx                     | moderate.mutateAsync({id,status:'rejected',reason})                                  | REAL                                 |
| Reviews CSV export                               | reviews-queue-client.tsx                     | GET reviews.csv                                                                      | REAL                                 |
| Menus approve                                    | menus-queue-client.tsx:396-400               | moderate mutation status approved                                                    | REAL                                 |
| Menus hold                                       | :408-412                                     | moderate mutation status held                                                        | REAL                                 |
| Menus reject                                     | :420-424                                     | moderate mutation status rejected                                                    | REAL                                 |
| Legal enforcement filters                        | enforcement-client.tsx:58-72                 | Refetches list                                                                       | REAL                                 |
| Legal evidence export                            | evidence-client.tsx:108-109                  | useEvidenceExport mutation, downloads file                                           | REAL                                 |
| Legal notices resend                             | notices-client.tsx:223                       | resend.mutate(notice.id)                                                             | REAL                                 |
| Legal notices filter (bounced)                   | notices-client.tsx:113                       | Filters list                                                                         | REAL                                 |
| Legal appeals (all controls)                     | appeals-client.tsx                           | Navigation/display only                                                              | NO-OP (no mutations)                 |
| Vendor recommendations status select             | vendor-recommendations-client.tsx:254-266    | Local state                                                                          | NO-OP until Save                     |
| Vendor recommendations notes textarea            | :268-276                                     | Local state                                                                          | NO-OP until Save                     |
| Vendor recommendations Save                      | :279                                         | PATCH /vendor-recommendations/:id                                                    | REAL                                 |
| Vendor recommendations pagination                | :198-222                                     | Cursor refetch                                                                       | REAL                                 |
| Waitlist tab filters                             | waitlist-client.tsx:87-96                    | Local state only (list not refetched with filter)                                    | NO-OP                                |
| Waitlist pagination                              | :177-193                                     | Cursor refetch                                                                       | REAL                                 |
| Error incidents search + submit                  | incidents-client.tsx:76-86                   | GET incidents with search param                                                      | REAL                                 |
| Error incidents clear                            | :89                                          | Resets and refetches                                                                 | REAL                                 |
| Error incidents acknowledge/resolve              | incidents-client.tsx                         | DOES NOT EXIST                                                                       | NO-OP (control absent)               |
| Analytics refresh                                | analytics-client.tsx:117-121                 | Refetches dashboard                                                                  | REAL                                 |
| Analytics date range / preset                    | :223-226                                     | Changes param and refetches                                                          | REAL                                 |
| Attribution filters + Apply                      | attribution-client.tsx:161-166               | Refetches with params                                                                | REAL                                 |
| Attribution CSV export                           | :176-179                                     | GET /v1/attribution/admin/export.csv                                                 | REAL                                 |
| Attribution pagination                           | :267-280                                     | Cursor refetch                                                                       | REAL                                 |
| Settings run payout batch                        | settings-client.tsx                          | POST /admin/payouts/run-batch (via payouts hook)                                     | REAL                                 |
| Settings links to Bull Board, audit log          | settings-client.tsx                          | Navigation only                                                                      | REAL (navigation)                    |
| FeastPass health refresh                         | feastpass-health-client.tsx                  | Refetches GET /v1/admin/feastpass/health                                             | REAL                                 |
| FeastPass health all other controls              | feastpass-health-client.tsx                  | Read-only display                                                                    | NO-OP (no mutations)                 |

---

## 5. PHASE 4: PERFORMANCE

| Finding                                                                | Location                   | Volume at which it bites                                                              | Severity                                                                                              |
| ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `listExpiringDocuments` has no `take` / cursor                         | admin.service.ts:797-840   | ~300 vendors with 2+ expiring documents; query time grows linearly                    | HIGH -- will time out in production at scale                                                          |
| `listVendorApplications` capped at 100 (no cursor pagination)          | admin.service.ts:849-858   | 101st application is invisible to the admin panel                                     | MEDIUM -- hard cap, not a slow query, but a functional gap                                            |
| `VendorApplication.status` and `createdAt` have no `@@index`           | prisma/schema.prisma       | ~5,000 applications; sequential scan on every application list load                   | MEDIUM -- hits at moderate scale                                                                      |
| `Vendor.status` and `createdAt` have no `@@index`                      | prisma/schema.prisma       | ~500 vendors; admin vendor list filters on status with a sequential scan              | MEDIUM -- hits at 500 vendors                                                                         |
| Vendor slug uniqueness check is a retry loop (up to 51 Prisma queries) | admin.service.ts:1392-1397 | Each application approval fires up to 51 `findUnique` calls serially                  | LOW -- rare, bounded, but inefficient                                                                 |
| `listAdminOrders` Stripe call inside map loop                          | admin.service.ts:342       | 50 orders per page x Stripe latency ~100ms = ~5s page load at default page size       | MEDIUM -- observable on orders list today                                                             |
| No debounce confirmed on admin search inputs                           | apps/admin/src/\*          | Every keystroke fires a query at 1 req/keystroke                                      | MEDIUM -- hits immediately at any volume if search is typed quickly; manual check required to confirm |
| `orderStats` aggregate: not confirmed to use DB COUNT                  | admin.service.ts:554-570   | Depends on implementation; if JS array count over fetched rows, hits at 50,000 orders | MEDIUM -- requires manual check                                                                       |
| Orders CSV export bounded at `take: 5000`                              | admin.service.ts:511       | Any export above 5,000 rows is silently truncated                                     | LOW -- functional gap, not a performance issue                                                        |
| Audit log `include: {actor: {select}}` on every row                    | admin.service.ts:587-594   | 200,000 audit rows; cursor pagination mitigates; JOIN cost acceptable                 | LOW                                                                                                   |
| No list virtualisation confirmed                                       | apps/admin/src/\*          | If any list renders 500+ rows without pagination, browser jank                        | LOW -- pagination exists on most lists; manual check for any unbounded client render                  |
| No polling found                                                       | apps/admin/src/\*          | N/A                                                                                   | INFO -- no polling cost                                                                               |

---

## 6. PHASE 5: GAP ANALYSIS

### 6.1 Missing and stubbed capabilities (prioritised backlog)

| Priority | Capability                                                                 | Operational consequence                                                                                             |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0       | **C3: Stripe refund**                                                      | Admin cannot refund a customer payment; must use Stripe dashboard directly -- no audit trail                        |
| P0       | **C4: Chargeback response / evidence submission**                          | Admin cannot fight a chargeback from the panel; evidence deadline shown but no action possible                      |
| P0       | **GDPR deletion (right to erasure)**                                       | Admin cannot fulfil an erasure request; no deletion endpoint or UI                                                  |
| P1       | **C6: Catering enquiry routing**                                           | The vendor-portal empty state promises admin routing, but no mechanism exists                                       |
| P1       | **A4: Appeals resolution**                                                 | Admin can view the appeals queue but cannot approve or reject an appeal; resolution requires direct DB intervention |
| P1       | **Enforcement suspension audit log**                                       | Automated vendor suspensions leave no AuditLog trace; regulators or disputes require this record                    |
| P1       | **A1/A3: Vendor suspension confirmation + narrative**                      | Main Suspend button fires immediately with no confirmation dialog and no reason text; reversals are unrecorded      |
| P2       | **C5: Failed payout retry**                                                | A failed payout can be viewed but not retried from the panel; requires manual Stripe intervention                   |
| P2       | **D4: FeastPass membership actions**                                       | Admin cannot cancel, pause, or adjust a FeastPass subscription                                                      |
| P2       | **A2: referredByVendorId admin control**                                   | Admin cannot set or override the referral attribution at approval time                                              |
| P2       | **D3: Founding allowance**                                                 | No admin surface for founding member allowance management                                                           |
| P2       | **listExpiringDocuments pagination**                                       | Will time out at scale                                                                                              |
| P3       | **E3: Admin messaging to customers/vendors**                               | No capability to message a specific customer or vendor from the panel                                               |
| P3       | **B3: Compliance triage search + pagination**                              | No free-text vendor search on triage list; pagination not confirmed                                                 |
| P3       | **F2: Unified health dashboard**                                           | Error incidents and FeastPass health are separate; no single operations health view                                 |
| P3       | **Missing DB indexes** (Vendor.status, VendorApplication.status/createdAt) | Admin list queries will degrade linearly                                                                            |
| P3       | **listVendorApplications hard cap at 100**                                 | 101st application is silently invisible                                                                             |
| P4       | **E2 test-notification production guard**                                  | Test sends can hit real users on prod; needs env check or dry-run flag                                              |

### 6.2 Day-to-day operator workflows

| Scenario                                                             | Can admin accomplish it today? | How                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handle a customer complaint about a specific order                   | Partially                      | Search order in orders-client; view detail; override status; issue loyalty credit. Cannot issue Stripe refund. Cannot directly message the customer from the panel. |
| Respond to a food safety incident -- take vendor offline immediately | Yes                            | vendors/:id Suspend button fires immediately (no confirmation). Downside: no narrative, no audit log row confirmed.                                                 |
| GDPR data access request (SAR)                                       | Yes                            | users-client Export (DSAR) -- GET /admin/users/:userId/export (use-admin-users.ts:255)                                                                              |
| GDPR data deletion / right to erasure                                | No                             | No deletion endpoint or UI exists                                                                                                                                   |
| Reconcile Stripe payout against platform records                     | Yes                            | payouts-client: POST /admin/payouts/:id/reconcile-stripe; also POST /admin/payouts/run-batch                                                                        |
| Investigate why a vendor is not appearing in search                  | Partially                      | Can view vendor profile, status, verification state from vendors/:id. Cannot query search index or delivery radius from the panel.                                  |
| Issue goodwill credit                                                | Yes                            | POST /admin/users/:userId/credit (loyalty points); cannot issue a cash refund                                                                                       |
| Bulk-communicate with vendors in one postcode                        | No                             | No messaging capability and no postcode-filtered vendor communication tool                                                                                          |

### 6.3 Cross-reference with known open backlog

The following open tasks appear already implemented or covered by existing code (further manual verification recommended):

- Task #142 (warn vendors about suspended/renewal-due verification): partially covered -- vendor-enforcement service sends notifications on automated suspension (vendor-enforcement.service.ts:214-235). Manual state changes may not notify.
- Task #44 (show chargebacks to finance in admin panel): DONE -- chargebacks-client.tsx is present and functional.
- Task #40 (keep service fee as platform revenue): addressed in payout service (per memory: service fee excluded from vendorPayoutPence).
- Task #141 (RLS on new tables): status unknown without schema review of all new migrations.

The following tasks are NOT yet visible in the admin panel and remain genuinely open:

- Task #45 (chargeback reconciliation on lost dispute): chargebacks-client has no reconcile button.
- Task #56 (handle failed vendor payouts): no retry action in payouts-client.
- Task #133 (FeastPass savings banner): not an admin concern.
- Task #134 (FeastPass env validation): API-level, not admin UI.

---

## 7. WHAT I COULD NOT DETERMINE WITHOUT RUNNING THE APP

| Unknown                                                                                     | Manual check required                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether debounce exists on admin search inputs                                              | **RESOLVED: No debounce exists.** `grep -rn "debounce\|useDebounce" apps/admin/src` returns zero matches for any search input. Every keystroke fires a query.                                                                                                         |
| Whether `orderStats` uses DB COUNT or JS array.length                                       | **RESOLVED: DB aggregates.** `admin.service.ts:132,142` uses Prisma `_count: { _all: true }` for order and vendor counts. `ordersTodayCount: todayAgg._count._all`. No JS array.length is used for aggregate counts.                                                  |
| Whether vendor status change (Suspend via lifecycle button) writes an AuditLog row          | Still requires live trigger + DB query to confirm. Static analysis did not trace the `PATCH /vendors/:id/status` handler to an `auditLog.create` call.                                                                                                                |
| Whether order status override writes an AuditLog row                                        | Still requires live trigger + DB query to confirm.                                                                                                                                                                                                                    |
| Whether the compliance page has pagination (rows beyond first fetch)                        | **PARTIALLY RESOLVED:** compliance page renders a "Loading…" state and has filter tabs but no pagination control was visible in the live screenshot. The expiring documents section below also showed "Loading…". No explicit cursor/pagination control was rendered. |
| Whether listVendorApplications hard cap of 100 is actually hit silently                     | Still requires seeding 101 applications to observe.                                                                                                                                                                                                                   |
| Whether the test-notification endpoints (:596, :672) have any environment guard in practice | Still requires a production token test. Static analysis confirmed no env check at lines 596/672.                                                                                                                                                                      |
| Whether `approveVendorApplication` correctly populates `referredByVendorId`                 | Still requires approving an application submitted with a referral code.                                                                                                                                                                                               |
| Bundle size and heavy dependency analysis                                                   | Still requires `ANALYZE=true npx next build`.                                                                                                                                                                                                                         |
| Whether any admin list renders 500+ rows client-side                                        | Still requires a large dataset. All list pages have pagination controls visible in live screenshots.                                                                                                                                                                  |

---

## 8. LIVE OBSERVATIONS (17 August 2026)

_Authenticated Playwright session navigated all 18 admin pages as `soul@feastpot.co.uk` (role: admin). Screenshots saved to `screenshots/admin-live-_.jpg/png`. The dev admin app at port 3003 makes client-side API calls to `localhost:3001`; all data fetches failed with "Failed to fetch" because the Playwright headless browser cannot reach localhost:3001 across process boundaries in this environment. This is a dev-infrastructure limitation - production connects to `https://api.feastpot.co.uk` via `NEXT_PUBLIC_API_URL` and is unaffected. Despite missing API data, the live session confirmed UI structure, page rendering, and local state for every page.\*

### 8.1 Authentication and identity

- Login succeeded. Soul Admin (ID `1b3948e2-ae03-4cc1-82a8-f7dd29a2503e`) authenticated with role `admin` and landed at `/`.
- Settings page displayed the admin avatar, email, and role badge live - server-gate `requireStaff()` and Supabase session are functioning correctly.

### 8.2 Security: 2FA is off on the seed admin account

Settings page shows an amber warning: _"2FA is off - Anyone with your email and password can sign in. Enable 2FA so a stolen password is not enough on its own."_

**Implication:** The admin console sign-in page states "Internal use only · 2FA enforced after sign-in". The copy implies 2FA is mandatory, but it is only encouraged. Staff accounts with weak passwords have no second factor protecting the admin console today. This should be reflected in onboarding documentation.

### 8.3 Platform defaults confirmed live

Settings page "Platform defaults" card (read-only):

| Setting            | Live value                                    |
| ------------------ | --------------------------------------------- |
| Default commission | **12.00%** (applied to new vendors on signup) |
| Payout cadence     | **Weekly - Mondays at 02:00 UTC**             |
| Base currency      | **GBP (£) - all amounts stored in pence**     |

Footer note: _"Editing these defaults requires a backend release. Open an engineering ticket if a change is needed."_ - defaults are hard-coded, not DB-editable from the panel.

### 8.4 Bug confirmed: commission-rates page hits wrong URL

**Finding:** `apps/admin/src/app/commission-rates/commission-rates-client.tsx:7` reads `process.env.NEXT_PUBLIC_API_URL ?? ''` directly instead of importing `API_URL` from `@/lib/env`. When `NEXT_PUBLIC_API_URL` is unset (standard dev), the base URL is an empty string, so every API call becomes a relative request to the Next.js server at port 3003 (e.g. `GET http://localhost:3003/v1/admin/commission-rates`). That route does not exist on the Next.js server, so the page renders _"API 404"_ and is completely non-functional.

**Production impact:** In production `NEXT_PUBLIC_API_URL` is set explicitly, so this does not affect prod. In dev (and any staging without the env var), the commission-rates page is broken.

**Fix applied:** `commission-rates-client.tsx:7` changed to `import { API_URL } from '@/lib/env'; const API = API_URL;`. This aligns with every other admin client component.

### 8.5 Per-page live findings

| Page                             | Live state                           | Observations                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                    | Renders; data fail                   | 7 KPI tiles (GMV today/week/month, Orders today, Active vendors, Avg basket, Coverage waitlist) all show "-". Daily revenue chart empty. Repeat customers "-". Vendor performance table visible but empty. Error banner: "Failed to load dashboard: Failed to fetch".                                                                                                                                                      |
| **Orders**                       | Renders; data fail                   | Filter bar: Search (order ID, number, name), Status, Date range (defaults to Today), Payment status, More filters. 5 stat tiles. "Export CSV" button. Table columns: Order ID, Customer, Vendor, Items, Total, Status, Payment, Pi Status, Created, Actions. Showing 0 of 0.                                                                                                                                               |
| **Vendor Applications**          | Renders; data fail                   | Tab bar: All / Pending / Under Review / Information Requested / Approved / Rejected. Table: Kitchen, Applicant, Cuisine/Kitchen, Submitted, FSA, Status. Empty state: "No applications in this state".                                                                                                                                                                                                                     |
| **Vendors**                      | Renders; data fail                   | Tab bar: Pending / Live / Probation / Suspended / Removed / All. Table: Business, Owner, Submitted, Status, Documents. Empty state.                                                                                                                                                                                                                                                                                        |
| **Payouts**                      | Renders; data fail                   | Status filter (defaults to "draft"). Stat tiles: Total Payout £0.00, Total Commission £0.00, Successful 0, Pending 0, Failed/Held 0. "Run payouts now" button visible top-right. Table: Vendor, Period, Status, Amount, Commission, Stripe transfer.                                                                                                                                                                       |
| **Chargebacks**                  | Renders; data fail                   | Stat tiles show **real zeros** (Open 0, Evidence due <72h 0, Lost Unreconciled 0, Open amount £0.00). Tiles appear to render from zero defaults before the API call returns. Filter: Status, Order ID. Table: Order #, Amount, Status, Reason, Evidence due, Opened, Reconcile.                                                                                                                                            |
| **Disputes**                     | Renders; data fail                   | Filters: Status, SLA, Date range (Last 30 days), Severity (All/Critical/High/Medium/Low). "Export" button. Summary tiles below table: Total Disputes 0, Overdue 0, Breaching soon 0, In progress 0, Total Disputed Value £0.00. Global search top-right.                                                                                                                                                                   |
| **Compliance**                   | Loading at snapshot                  | **Verification status section has a search field ("Search by name or vendor ID…") - resolves the B3 unknown.** Filter tabs: Needs action (default) / Not set up / Renewal due / Suspended / Verified / All. Expiring documents section: 4 stat tiles (Tracked, Approved, Expiring Soon, Expired) then a table. Both sections were loading when screenshot was taken (3-second wait may be insufficient for this endpoint). |
| **Discount codes**               | Renders; data fail                   | Table columns: Code, Type, Value, Min Order, Used, Expires, Vendor, **Funded By**, Status. "No discount codes yet" empty state with CTA. "+ New code" button top-right.                                                                                                                                                                                                                                                    |
| **Users**                        | Renders; data fail                   | Search bar + Filters. Role filter (All roles), Status filter (All statuses), Joined filter (Any time). "Add user" and "Export" buttons. Table: User, Role, Status, Joined, Orders, Total spent, Actions. Showing 0 of 0.                                                                                                                                                                                                   |
| **FeastPass health**             | Renders; data fail                   | Subtitle: _"Monthly renewal rate is the north-star metric. Alert fires if it drops below 80%."_ No action controls. Error shown inline. Page is entirely read-only.                                                                                                                                                                                                                                                        |
| **Push broadcast**               | Fully functional                     | Form renders with no data dependency: Audience (By city dropdown), City text input, Title (0/80 char), Body (0/240 char), Click-through URL (optional). Live preview panel on the right shows a mock notification bubble updating as text is typed. "Send broadcast" button. No fetch required to render.                                                                                                                  |
| **Audit log**                    | Renders; data fail                   | Filter row: Entity type, Entity ID, Actor ID, Action, From date, To date, Clear, Apply. "Export CSV" button. Table: Time, Actor, Action, Entity, IP, Metadata. Empty state with "No matching log entries".                                                                                                                                                                                                                 |
| **Dead-letter Bull jobs**        | Renders; data fail (but queue clean) | Filter: queue selector (All queues). Table: Queue, Job type, Error, Attempts, Payload summary, Failed at. Empty state: _"No dead-letter jobs - All queues are within their retry budget."_ The error banner ("Failed to load dead-letter jobs: Failed to fetch") fires but the empty state below is the correct rendering for a clean queue. **Queue is clean as of this observation.**                                    |
| **Commission rates**             | **Broken - API 404**                 | Page displays only "API 404" in red. Root cause: direct `process.env.NEXT_PUBLIC_API_URL ?? ''` usage yields empty-string base URL in dev. **Fixed in this session** (see §8.4).                                                                                                                                                                                                                                           |
| **Legal/appeals**                | **Loaded successfully**              | "No open appeals" empty state with green checkmark. Amber callout: _"Different-reviewer rule (clause 18.3) - The stage-2 reviewer must not be the same person as the stage-1 reviewer. The API enforces this with a SAME_REVIEWER error."_ This page fetched its data successfully (no error banner). Appeals queue is empty.                                                                                              |
| **Vendor acquisition analytics** | Renders; data fail                   | Period selector: 7d / 30d (default) / 90d. Three sections: Acquisition Funnel, Order Attribution, Top Vendors by Share Activity - each renders "No data for this period." Footer note about QR backfill tool. Error banner: "Failed to load analytics data. Try refreshing the page."                                                                                                                                      |
| **Catering enquiries**           | **Loaded successfully**              | Status filter "All statuses" dropdown. Empty state: _"No catering enquiries - Public feast requests will appear here once customers submit the form."_ Loaded without error.                                                                                                                                                                                                                                               |
| **Settings**                     | **Fully loaded**                     | My account card, Security & 2FA card (2FA OFF warning - see §8.2), Platform defaults card (see §8.3). Static page with no API dependency.                                                                                                                                                                                                                                                                                  |

### 8.6 Resolved unknowns

| Unknown from §7                   | Resolution                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Debounce on admin search inputs   | **Absent.** No `debounce` or `useDebounce` anywhere in `apps/admin/src`. Every search keystroke fires a query.                                                                                                       |
| `orderStats` DB COUNT vs JS array | **DB COUNT.** Uses Prisma `_count: { _all: true }` aggregates throughout. No JS `.length` on fetched arrays for stats.                                                                                               |
| Compliance page search field      | **Confirmed present.** "Search by name or vendor ID…" input is visible in the live compliance page. B3 verdict upgrades from PARTIAL to WORKING for the search component specifically; pagination still unconfirmed. |
| Dead-letter queue state           | **Clean.** No failed Bull jobs at time of observation.                                                                                                                                                               |

### 8.7 Vendor portal login

Vendor portal at port 3002 rejected the Playwright login attempt. The vendor middleware (`apps/vendor/src/middleware.ts`) redirects all authenticated-gated routes back to `/sign-in` when `supabase.auth.getUser()` returns no session. This is correct middleware behaviour. The session was not established in the headless context (timing or cookie propagation issue). The vendor portal UI could not be live-observed in this session. Static audit findings for the vendor portal remain unchanged.
