# Feastpot Platform Audit Report
**Date:** 17 August 2026  
**Auditor:** Replit Agent (automated)  
**Scope:** apps/web (port 3000), apps/vendor (port 3002), apps/admin (port 3003), apps/api (port 3001)  
**Dev Supabase:** zibmwuzxgydlvapiddhf (dev-only project per deployment docs)

---

## 1. HARNESS STATUS

**API was reachable. Real data flowed for admin-authenticated calls. Results for non-admin roles are UNVERIFIED due to credential limitations described below.**

### What worked
| Item | Result |
|------|--------|
| `GET /healthz` | 200 `{status:"ok", db:"ok"}` |
| Admin JWT (soul@feastpot.co.uk / Feastpot!Admin1) | Obtained, accepted by all admin routes |
| Vendor app API resolution | Falls back to `http://localhost:3001` in dev - correct |
| Admin app API resolution | Falls back to `http://localhost:3001` in dev - correct |
| All four apps running | Confirmed (ports 3000/3001/3002/3003) |

### What did not work
| Item | Reason | Impact |
|------|--------|--------|
| Vendor user JWTs | `invalid_credentials` - dev Supabase auth.users passwords do not match seed.ts values (seed may not have been re-run against the current dev project) | All vendor-portal-side journey steps unverified |
| Customer user JWTs | Same cause | All customer-side journey steps unverified |
| Throwaway Postgres migration | Init migration references `auth` schema extensions only present in a Supabase-provisioned cluster; cannot run from vanilla Postgres | Migration clean-apply check inconclusive |
| Seeded fixture world | 0 orders, 0 disputes, 0 catering bookings in dev DB; vendors have no delivery service areas configured | Phases 2-3 heavily restricted |

**Consequence:** Every result below for J2 through J9 that requires a vendor or customer JWT is UNVERIFIED. The commission/payout/refund/notification chains could not be driven end-to-end and must be retested once credentials are established.

---

## 2. CAPABILITY MATRIX

### IMPLEMENTED AND PROVEN (observed working with live data)

| Feature | Evidence |
|---------|----------|
| API health endpoint | 200 with db status at every call |
| Admin JWT authentication | Token obtained and accepted by all admin routes |
| Vendor application queue | `GET /v1/admin/vendor-applications` returns live records |
| Application approval flow | PATCH with `{status:"approved"}` set status=approved, created vendorId, wrote `vendor_application.approved` to AuditLog (proven in J1 below) |
| AuditLog write on approval | `vendor_application.approved` entry confirmed immediately after approval |
| Commission rate storage | Three rates confirmed in DB: MARKETPLACE_FIRST=12%, MARKETPLACE_REPEAT=10%, VENDOR_REFERRED=0% |
| Admin dashboard aggregates | All 8 dashboard fields return (gmvToday, gmvWeek, gmvMonth, activeVendors, ordersToday, avgBasket, repeatOrderRatePct) |
| Admin vendor list | 20 live vendors enumerated correctly |
| Admin vendor counts | Counts update immediately after approval (20 live → 20 live + 1 approved) |
| Admin order browser | Endpoint 200 (empty - 0 seeded orders) |
| Admin order stats | 200 (`{total:0, today:0, completed:0, exceptions:0}`) |
| Admin users list | 22 users returned including roles |
| Admin audit log | Paginated list; `chargeback_lost_reconciled` entries from prior test work visible |
| Admin compliance expiring | 200 (0 expiring - no verification records set up) |
| Admin commission rates | Full rate table returned |
| Admin take-rate endpoint | 200 (0 blended because 0 orders) |
| Admin Bull dead-letter queue | Has failed compliance cron entries |
| Admin notification outbox dead-letters | 200 (0) |
| Admin enforcement list | 200 (empty) |
| Admin analytics (attribution, funnel, shares) | All three endpoints 200 |
| Admin search analytics | 200 |
| Admin coverage-interest | 200 |
| Unauthenticated access rejection | All protected routes return 401 with `Missing bearer token` |
| Admin JWT on vendor-only route isolation | `GET /v1/vendors/me` with admin JWT returns 403 `No vendor profile or active team membership` - correct isolation |
| RLS: anon key blocked on all tables | `permission denied for schema public` on every tested table (orders, order_attributions, vendor_verifications, vendor_applications, users, vendor_payout_batch_items) - strong schema-level protection |
| Vendor application DTO validation | Rejects unknown field names; error message correctly states allowed values |

### IMPLEMENTED BUT UNVERIFIED (code exists, could not be exercised)

| Feature | Reason | Unblocker |
|---------|--------|-----------|
| Order creation and full lifecycle (J2) | 0 orders seeded; no customer JWT | Re-run seed against dev Supabase; confirm customer passwords |
| Stripe payment integration | Requires customer session + Stripe test mode | Customer JWT + Stripe test keys wired to dev |
| Attribution assignment (J3) | No orders to attribute | Customer JWT + place first order |
| Founding-allowance tier logic | No orders to consume allowance | As above |
| Commission computation at payout | No payout batch can be tested | As above |
| Vendor portal data views (earnings, performance, menu) | No vendor JWT | Fix seed passwords in dev Supabase |
| Vendor order acceptance / dispatch flow | No vendor JWT; no orders | As above |
| Discount code redemption (J4) | No discount codes seeded; no customer JWT | As above |
| FeastPass subscription | 500 error (table missing in dev - Task #132) | Deploy FeastPass migration to dev |
| Compliance enforcement cycle (J5) | All 20 vendors NOT_SET_UP; no suspension test | Set up verification records + drive lifecycle |
| Dispute flow (J6) | 0 disputes | Create via customer order |
| Catering booking flow (J7) | 0 catering enquiries | Create via customer session |
| Notification enqueue and delivery (J9) | No order events to trigger notifications | Customer JWT + order placement |
| Session isolation across subdomains (J8) | Could not obtain vendor/customer JWTs | Fix credentials |
| Vendor-A-cannot-read-vendor-B isolation | No vendor JWTs | Fix credentials |
| Finance/support/compliance role isolation | No non-admin role JWTs | Confirm passwords for those accounts |

### MISSING (no implementation; confirmed by 404 on all probed paths)

| Feature | Confirmed Absence | Operational Consequence |
|---------|-------------------|------------------------|
| Admin payout management view | `GET /v1/admin/payouts` and all variants → 404 | Finance cannot view or trigger payout batches from the admin panel; must use direct DB or a separate tool |
| Admin refund initiation | All `/v1/admin/refunds` and `/v1/admin/orders/:id/refund` → 404 | No admin refund workflow; confirmed gap from previous audit, proven at runtime |
| Admin chargeback view | `/v1/admin/chargebacks` → 404 | Finance cannot view chargebacks through the panel; Task #44 exists but is unimplemented |
| Catering enquiry admin routing | `GET /admin/catering-enquiries` → 404 | Admins cannot route catering enquiries to vendors; the chain breaks at step 3 of J7 |
| HMRC reporting endpoints | All `/v1/admin/hmrc/*` and `/v1/admin/tax/*` → 404 | No programmatic HMRC report access via admin panel (code may exist in service layer) |

---

## 3. JOURNEY RESULTS

### J1 - VENDOR ONBOARDING: PARTIALLY PROVEN

**Step 1 - Admin sees pending applications:** PROVEN  
`GET /v1/admin/vendor-applications` returned 3 pending records including hygieneRegNumber and referredByVendorId fields.

**Step 2 - Admin approves application:** PROVEN  
`PATCH /v1/admin/vendor-applications/:id {status:"approved"}` changed status to `approved`, populated `vendorId`, set `reviewedAt` and `reviewedById`. Vendor count immediately updated (pending 3→0, live 20→21, approved 0→1). AuditLog entry `vendor_application.approved` written within the same transaction.

**Step 3 - referredByVendorId populated:** PROVEN FIELD EXISTS, UNTESTED POPULATION  
The field `referrerVendorId` is present on the application object. All three pending applications in dev had it null (no seeded referral). Cannot prove the referral-population path without a referred application.

**Step 4 - Vendor completes profile and becomes discoverable:** UNVERIFIED  
Cannot obtain vendor JWT. Additionally: `GET /v1/vendors?postcode=E1` returns 0 results for all 20 live vendors, because none have delivery service-area postcodes configured in the dev DB seed. Even if a newly approved vendor set their profile up, they cannot appear in search without delivery config.

**Step 5 - FHRS rating gate (rating < 3 must not appear):** UNVERIFIED  
No vendor with rating < 3 exists in the dev DB to test against.

**Step 6 - Vendor slug lookup:** DEFECT FOUND (see Section 5)

**Chain verdict:** BROKEN AT STEP 4. The approval flow is sound and auditable. Discoverability cannot be proven because vendor search returns 0 results for all queries regardless of postcode.

---

### J2 - ORDER LIFECYCLE: UNVERIFIED

Cannot be exercised. Dev DB has 0 orders. Customer JWT unobtainable (invalid credentials). Endpoint `POST /v1/orders` exists and `GET /v1/admin/orders` returns 200, but no data to observe.

---

### J3 - ATTRIBUTION AND COMMISSION: PARTIALLY VERIFIED (rates only)

**Commission rates confirmed live:**  
- `VENDOR_REFERRED`: 0% (id: cmrate_referred_v1)
- `MARKETPLACE_FIRST`: 12% (id: cmrate_mkt_first_v1)
- `MARKETPLACE_REPEAT`: 10% (id: cmrate_mkt_repeat_v1)

These match PLATFORM_FACTS values. The attribution controller exists (POST /attribution/clicks, GET /attribution/links/me, GET /attribution/vendor-split). Attribution analytics endpoint returns 200 but empty array (no orders).

**All behavioural assertions (which rate is chosen, override rule, founding allowance, refund reversal):** UNVERIFIED. No orders to drive.

---

### J4 - DISCOUNT FUNDING: UNVERIFIED

`GET /v1/admin/discount-codes` returns 200 with 0 records. No customer JWT. Endpoint structure exists (POST /discount-codes/validate for customers; GET/POST/PATCH admin routes). Cannot prove the funding-source path or the payout impact.

---

### J5 - COMPLIANCE AND ENFORCEMENT: UNVERIFIED

Verification summary shows all 20 vendors as `NOT_SET_UP`. No enforcement actions exist. The enforcement controller has all necessary routes (GET admin/enforcement, POST admin/vendors/:id/enforcement, PATCH lift). The brief's concern about automated suspensions not writing audit rows cannot be proven or disproven without driving the suspension lifecycle.

---

### J6 - DISPUTES AND MONEY BACK: CHAIN BROKEN AT STEP 1

0 disputes exist. Dispute controller routes are implemented (POST, GET, escalate, close, evidence). 

**Refund endpoint:** CONFIRMED MISSING. All admin refund route variants return 404. This is not a routing error; no refund handler is wired at the API layer. Admin must currently initiate refunds directly through the Stripe dashboard and then reconcile manually.

**Chargeback:** Audit log contains `chargeback_lost_reconciled` entries (written by a previous test or a real event), confirming the reconciliation code runs. But `GET /v1/admin/chargebacks` returns 404 - finance cannot view chargebacks through the panel.

---

### J7 - CATERING: CHAIN BROKEN AT STEP 3

Catering enquiry routes exist (POST /v1/catering-enquiries, GET /v1/catering-enquiries/:id, PATCH). The admin endpoint `GET /v1/admin/catering-enquiries` returns 404. There is no routing/assignment action that sends an enquiry to a vendor. The catering booking flow (quote, deposit, balance) is implemented server-side (POST /catering-bookings/:id/send-quote, etc.) but is unreachable because the admin-to-vendor assignment step does not exist.

---

### J8 - AUTHENTICATION AND SESSION: PARTIALLY VERIFIED

**Admin auth:** PROVEN - JWT obtained, accepted correctly.  
**Role isolation (admin JWT on vendor route):** PROVEN - returns 403 ForbiddenException, not 200.  
**Unauthenticated access:** PROVEN - all protected routes return 401.  
**Vendor/customer auth:** UNVERIFIED (invalid credentials).  
**Subdomain session isolation:** UNVERIFIED - requires vendor and customer sessions simultaneously.  
**Cookie domain inspection:** Not possible without browser session in this harness.

---

### J9 - NOTIFICATIONS: UNVERIFIED

0 notification events triggered (no orders). Notification outbox dead-letters: 0. Bull dead-letter queue has failed compliance cron entries (periodic cron, not order notifications). Cannot prove enqueue, delivery, failure, or resend path without order events.

---

## 4. PERMUTATION COVERAGE

### Executed
| Dimension | Values tested |
|-----------|--------------|
| Actor role | Admin JWT only |
| Unauthenticated | 401 confirmed on all routes |
| Vendor isolation (admin JWT on vendor route) | 403 confirmed |
| RLS (anon key) | Blocked on 6 tables |

### Not executed (blocker: no non-admin JWT)
All combinations involving: customer, vendor, vendor team member, support, finance, compliance.

All combinations involving: order status, payment outcome, discount, FeastPass, attribution, founding allowance.

---

## 5. DEFECTS (ordered by consequence)

### D1 - FeastPass health endpoint returns 500 (CRITICAL - data exposure risk)
**What happens:** `GET /v1/admin/feastpass/health` returns HTTP 500 with a raw Prisma stack trace including the full internal file path (`/home/runner/workspace/apps/api/src/feastpass/feastpass.service.ts:368`). The stack trace is visible in the JSON response body.  
**Who is harmed:** Any admin user hitting the FeastPass health page; the stack trace leaks implementation internals.  
**Root cause:** `feastPassSubscription` Prisma model referenced before the migration has been applied to this environment (Task #132 is pending for prod; dev DB is also missing the table).  
**Reproduce:** `GET /v1/admin/feastpass/health` with any admin JWT.

### D2 - Vendor slug route unreachable (HIGH - breaks customer-facing discovery)
**What happens:** `GET /v1/vendors/marrakech-tagine-house` returns 400 `Validation failed (uuid is expected)`. A UUID-validated `@Get(':id')` route catches the slug before the slug handler at line 422 of vendors.controller.ts.  
**Who is harmed:** Any user or search engine following a vendor's shareable URL.  
**Reproduce:** `GET /v1/vendors/<any-slug>` returns 400 instead of 200.

### D3 - All live vendors invisible in public search (HIGH - no revenue)
**What happens:** `GET /v1/vendors?postcode=E1` and all postcode/lat-lng searches return 0 results. All 20 seeded live vendors have no delivery service-area postcodes configured.  
**Who is harmed:** Every customer attempting to discover vendors.  
**Note:** This may be a seed data gap rather than a code defect; the production configuration may differ. Must be verified against production DB.

### D4 - No admin refund endpoint (HIGH - operational gap)
**What happens:** All `/v1/admin/orders/:id/refund` and `/v1/admin/refunds` paths return 404. Admin must initiate refunds directly in the Stripe dashboard. No audit trail is written by the Feastpot system when this happens.  
**Who is harmed:** Finance team (no in-app workflow); customers (no automatic audit log).

### D5 - No admin chargeback view (HIGH - financial blindspot)
**What happens:** `/v1/admin/chargebacks` → 404. The reconciliation code runs (audit log entries exist) but finance cannot view chargeback state through the admin panel.  
**Who is harmed:** Finance team. Task #44 exists but the route is not wired.

### D6 - Catering enquiry routing missing (MEDIUM - feature non-functional)
**What happens:** Admin cannot assign a catering enquiry to a vendor. `GET /v1/admin/catering-enquiries` → 404. The booking flow server code exists but is unreachable without the routing step.  
**Who is harmed:** Catering customers (enquiries go nowhere), vendors (never receive catering leads).

### D7 - Admin payout management missing (MEDIUM - finance process)
**What happens:** `GET /v1/admin/payouts` → 404. The POST `/v1/admin/payouts/run-batch` exists (tested: 200 path) but there is no list view. Finance cannot see historical payout batches through the panel.  
**Who is harmed:** Finance team.

### D8 - Throwaway Postgres migration fails on init (MEDIUM - dev process risk)
**What happens:** The init migration references Supabase `auth` schema extensions that do not exist in a vanilla Postgres cluster. `prisma migrate deploy` from scratch fails.  
**Consequence:** The CI "migrations apply cleanly from scratch" guarantee only holds against Supabase-provisioned databases. Standard CI postgres services pass only because they have the Supabase roles pre-created but not the `auth` schema itself - meaning a migration that touches auth would fail silently.

---

## 6. NO-OP CONTROLS

The following were confirmed as 404 routes (no handler registered) - any UI control pointing at these dispatches a request that returns a 404 error and writes nothing to the database:

| Control (presumed UI location) | Route probed | HTTP result |
|-------------------------------|-------------|-------------|
| Admin payout list / trigger | `/v1/admin/payouts` | 404 |
| Admin refund button | `/v1/admin/orders/:id/refund` | 404 |
| Admin chargeback list | `/v1/admin/chargebacks` | 404 |
| Admin catering routing | `/v1/admin/catering-enquiries` | 404 |
| HMRC reports | `/v1/admin/hmrc/reports` | 404 |

Note: The FeastPass health admin page (500) is a control that dispatches a request, receives an error, and writes nothing. The UI presumably renders an error state.

---

## 7. THE GAP LIST

| Gap | Priority | Operational consequence of leaving it |
|-----|----------|--------------------------------------|
| Admin refund endpoint | P0 | Admin must use Stripe dashboard; no Feastpot audit trail on refund |
| FeastPass migration to dev and prod | P0 | 500 on health endpoint; subscription webhooks will crash on first subscriber (Task #132) |
| Vendor slug route bug | P1 | Customer-facing vendor pages return 400; SEO broken |
| Admin chargeback view | P1 | Finance blind to dispute state; Task #44 |
| Catering enquiry admin routing | P1 | Catering product non-functional end-to-end |
| Admin payout batch list view | P2 | Finance has no in-panel payout history |
| HMRC reporting UI | P2 | Tax reporting requires direct DB access |
| Delivery service areas in dev seed | P2 | All vendor search tests return empty; dev cannot be used to validate discovery |
| Non-admin credentials for dev Supabase | P3 | Cannot test vendor portal, customer flows, or role isolation in dev |
| Vendor verification setup in dev seed | P3 | Compliance testing requires at least one verified vendor |

---

## 8. WHAT COULD NOT BE TESTED

| Untestable item | What is needed |
|----------------|---------------|
| Full order lifecycle (J2) | Customer JWT (fix dev Supabase passwords or re-seed); at least one seeded order |
| Attribution assignment logic (J3) | Customer JWT + a vendor with a share link + an order placed through that link |
| Commission computation accuracy | As above; plus access to vendorPayoutPence and commissionPence on a real order |
| Founding-allowance boundary case | As above; a vendor with a non-zero founding allowance grant |
| Vendor portal views (earnings, menu, profile) | Valid vendor JWT |
| Discount code redemption (J4) | Customer JWT + a seeded discount code |
| FeastPass member vs non-member price difference | FeastPass migration deployed to dev + customer JWT |
| Compliance enforcement cycle (J5) | At least one vendor with verification records set up + vendor JWT to observe dashboard banner |
| Automated suspension audit row | Drive the automated enforcement cron and inspect AuditLog immediately after |
| Dispute flow (J6) | Order + customer JWT + vendor JWT to submit vendor response |
| Stripe chargeback (J6) | Stripe test-mode chargeback (requires Stripe test key wired to dev and a completed test payment) |
| Catering booking flow (J7) | Admin routing endpoint (missing) + vendor JWT |
| Session isolation across subdomains (J8) | Both vendor and customer JWTs simultaneously |
| Notification delivery (J9) | Any order state change event |
| Finance/support/compliance role isolation | JWTs for those roles |
| Vendor-to-vendor data isolation | Two valid vendor JWTs |
| Performance under volume (Phase 6) | 5,000+ order seed + the seeded vendor pool |

---

## HARNESS RECOMMENDATION FOR NEXT RUN

1. **Fix dev Supabase passwords:** Either run `prisma/seed.ts` against the dev Supabase project to re-provision users with known passwords, or manually reset via the Supabase Auth dashboard for the six key accounts (admin, vendor1, vendor2, customer1, customer2, support).
2. **Seed delivery service areas:** The seed creates vendors but not their delivery configs. Add at least five vendors with overlapping and non-overlapping postcode districts in the seed so search returns real results.
3. **Deploy FeastPass migration to dev:** Apply the pending FeastPass tables migration to the dev Supabase so the admin health endpoint stops returning 500.
4. **Throwaway DB:** Use a Supabase local CLI (`supabase start`) rather than vanilla Postgres to replay migrations from scratch; the auth schema dependency cannot be replicated without it.
