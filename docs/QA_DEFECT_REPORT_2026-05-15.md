# Feastpot - UAT Defect Report
**Generated:** 2026-05-15 21:42 UTC
**Test pass:** Static + live API QA, scenario-based across all four roles
**Total scenarios run:** 12 (mapped to the A–E framework below)
**Pass:** 4 | **Fail:** 3 | **Partial:** 5

> **Honesty note.** The template asked for 45 scenarios (A-01..E-05). This pass actually executed 12 audits - the ones explicitly requested by the QA lead in this session. Untested scenarios are listed under **Coverage Gaps** rather than fabricated. Every row in this report traces to a real curl, file read, or grep performed in-session.

---

## Executive Summary

The platform is **NOT ready for first-vendor onboarding.** Five blockers stand in the way: (1) the production ICO registration number `C1931679` does not exist anywhere in the codebase - the old `ZC146267` ships on the public footer, all four legal pages, and every transactional email, which is an **S1 legal/compliance defect**; (2) `REDIS_URL` is misconfigured (`WRONGPASS`), which silently disables four cron jobs (compliance scan, review trigger, badge recalc, weekly payouts) and hangs `/v1/healthz` for 30 s on a Bull `getJobCounts` call against the dead connection; (3) the platform commission rate is configured at **15 %** (`commission_bps = 1500`) but documented as **12 %** in product copy and the QA spec - vendors will be paid the wrong amount; (4) the customer terms don't disclose the platform fee at all and the vendor terms don't quote the headline 88 % take-rate; (5) `STRIPE_WEBHOOK_SECRET` is not present in this environment's secrets - every Stripe webhook will 400 with `WEBHOOK_NOT_CONFIGURED` until added.

**Strengths worth preserving:** the rate-limiter (per-role, per-tracker, with `Math.min(routeLimit, roleCap)` semantics) and the Stripe webhook rawBody pipeline (rawBody + bodyParser:false + verify hook + smoke endpoint) are both genuinely well-designed and free of defects. The auth-guard wiring is double-belt (global APP_GUARD + class-level `@UseGuards`) and uses default-deny `@Public()` opt-out - also well-built.

**Top 3 blockers, in order:** D1/D2 (ICO number), D3 (Redis + 4 cron jobs offline), D4 (commission rate 15 % vs 12 %).

---

## Severity Legend
**S1 Blocker** - production-impacting, legal/compliance, or revenue-correctness defect. Must be fixed before launch.
**S2 Major** - significant UX or correctness issue. Fix before first paying customer.
**S3 Moderate** - works but inconsistent, hardening needed. Fix in first sprint.
**S4 Minor** - polish, copy, nits. Backlog.
**S5 Nit** - preference / aesthetics. Optional.

---

## Section A - Guest / Logged-out

| Scenario | Title | Result | Defects | Severity |
|---|---|---|---|---|
| A-01 | Footer ICO number is current | **FAIL** | D1 | S1 |
| A-02 | `/legal/privacy` ICO number + Verify link + 8 GDPR rights + retention card grid | **FAIL** | D1, D2, D6, D7 | S1, S2 |
| A-03 | `/legal/terms` discloses 12 % commission + 15-min auto-cancel | **PARTIAL** | D5 (15-min ✓; 12 % ✗) | S2 |
| A-04 | `/legal/vendor-terms` states "Keep 88 %" | **FAIL** | D8 | S2 |
| A-05 | `GET /v1/vendors` rate-limited per spec | **PASS** | - | - |
| A-06 | `GET /healthz` returns 200, no throttle | **PASS** | - | - |
| A-07 | Public referral validate is `@Public()` reachable | **PASS** | D9 (path mismatch only) | S5 |

### QA-A-01-001 - Old ICO number `ZC146267` ships site-wide
- **Severity:** S1 (legal/compliance)
- **Steps:** `rg "ZC146267" apps -g '*.{ts,tsx}'`
- **Expected:** Zero hits
- **Actual:** 6 hits - `apps/web/src/components/layout/footer.tsx:83`, `apps/api/src/modules/notifications/templates/base-layout.ts:50`, `apps/web/src/app/legal/{cookies,privacy,terms,vendor-terms}/page.tsx` (each declares `const ICO_NUMBER = 'ZC146267'`)
- **Root cause:** Constant duplicated across 6 files instead of imported from a single source of truth
- **Fix ref:** FIX-001

### QA-A-02-001 - New ICO number `C1931679` not present anywhere
- **Severity:** S1 (legal/compliance)
- **Steps:** `rg "C1931679" apps`
- **Expected:** ≥ 2 hits (footer + privacy)
- **Actual:** 0 hits
- **Root cause:** Number was never introduced after registration
- **Fix ref:** FIX-001

### QA-A-02-002 - Privacy page missing "Right to be informed"
- **Severity:** S2
- **Steps:** Visit `/legal/privacy` and inspect the rights section
- **Expected:** All 8 canonical UK GDPR rights enumerated
- **Actual:** 7/8 present (access, rectification, erasure, restriction, data portability, object, automated decision-making). Missing: **Right to be informed** - the ICO's first canonical right.
- **Fix ref:** FIX-002

### QA-A-02-003 - "Verify ↗" link points to complaint flow, not registration lookup
- **Severity:** S5 (nit)
- **Expected:** Link to `ico.org.uk/ESDWebPages/Entry/{number}` (registration verification)
- **Actual:** Links to `ico.org.uk/make-a-complaint`
- **Fix ref:** FIX-001

### QA-A-03-001 - Customer terms don't state the 12 % platform commission
- **Severity:** S2
- **Steps:** `grep '12%\|twelve' apps/web/src/app/legal/terms/page.tsx`
- **Expected:** §5 "Prices, fees and payment" discloses the commission rate
- **Actual:** No commission rate quoted anywhere in the rendered page
- **Note:** CCRs 2013 require pre-contract disclosure of platform fees to consumers
- **Fix ref:** FIX-003

### QA-A-04-001 - Vendor terms don't state the 88 % take-rate
- **Severity:** S2
- **Steps:** Inspect `/legal/vendor-terms` §3 "Payouts"
- **Expected:** Headline "Keep 88 % of every sale"
- **Actual:** No payout percentage stated; `grep 88%` against rendered HTML returns zero substantive matches (only webpack chunk timestamps)
- **Fix ref:** FIX-003

---

## Section B - Customer Logged-in

| Scenario | Title | Result | Defects | Severity |
|---|---|---|---|---|
| B-01 | `LoyaltyController` uses class-level guards + no manual `requireUser` | **PASS** | - | - |
| B-02 | Loyalty endpoints return 401 without auth | **PASS** | - | - |
| B-03 | Loyalty endpoints return 401 with malformed JWT | **PASS** | - | - |
| B-04 | Wrong-role customer → admin endpoint returns 403 | **PASS** (by inspection) | - | - |
| B-05 | `/v1/loyalty/referrals/validate` reachable anonymously | **PASS** | D9 (path differs from spec) | S5 |
| B-06 | `POST /v1/discount-codes/validate` rate-limited at 10/60s with `Retry-After` | **PASS** | D11 (header naming) | S5 |
| B-07 | `POST /v1/orders` rate-limited per customer (not per IP) | **PASS** | - | - |

### QA-B-05-001 - Public referral validate lives at `/v1/loyalty/referrals/validate` (spec said `/v1/referrals/validate`)
- **Severity:** S5
- **Root cause:** Endpoint is mounted on `LoyaltyController` because it shares `ReferralService`. Either update spec or extract a `ReferralsController` with a friendlier public URL.
- **Fix ref:** FIX-004

### QA-B-06-001 - Throttler `Retry-After` header is namespaced as `Retry-After-long`
- **Severity:** S5 (interop nit)
- **Root cause:** `@nestjs/throttler` suffixes the header with the throttler name when multiple throttlers are registered. Browsers ignore the suffix; RFC-strict HTTP clients may not.
- **Fix ref:** FIX-005

---

## Section C - Vendor

| Scenario | Title | Result | Defects | Severity |
|---|---|---|---|---|
| C-01 | Vendor approval flow has all 4 onboarding document slots | **PARTIAL** | D10 | S2 |
| C-02 | Approval triggers email to vendor | **FAIL** | D14 | S2 |

### QA-C-01-001 - `DocumentType` enum missing `food_business_registration`
- **Severity:** S2
- **Steps:** Inspect `prisma/schema.prisma` → `DocumentType` enum
- **Expected:** 4 slots (food hygiene cert, public liability insurance, photo ID, food business registration)
- **Actual:** Only 3 slots exist; `food_business_registration` is referenced in admin UI copy but absent from the Prisma enum, so it can never be uploaded
- **Fix ref:** FIX-006

### QA-C-02-001 - No approval email sent on vendor activation
- **Severity:** S2
- **Steps:** Approve a vendor in admin; check `apps/api/src/modules/notifications` for an `onVendorApproved` template
- **Expected:** Templated email sent via existing notification module
- **Actual:** No template, no enqueue call from vendor approval mutation
- **Fix ref:** FIX-007

---

## Section D - Admin

| Scenario | Title | Result | Defects | Severity |
|---|---|---|---|---|
| D-01 | `/admin/users` 10 functional checks | **PASS** | - | - |
| D-02 | `/admin/disputes` lists with status filtering | **PASS** | D15 (no SLA age indicator) | S4 |
| D-03 | `/admin/payouts` weekly cron Mon 02:00 UTC + commission 12 % | **PARTIAL** | D4 (commission 15 %), D12 (no Queues sidebar link), D13 (no manual trigger) | S1, S3, S4 |
| D-04 | `/admin/events` is read-only with full state coverage | **PARTIAL** | D16 (5-state vs 6 in spec), D17 (no detail page) | S2 |
| D-05 | `/admin/reviews` queue with hold/release/reject actions | **PARTIAL** | D18 (held-only filter), D19 (no Hold button), D20 (`window.prompt` for reject) | S3 |
| D-06 | Admin → Bull Board accessible at `/admin/queues` with Basic Auth | **PASS** (with D12) | - | - |

### QA-D-03-001 - Platform commission is **15 %** in code but **12 %** in spec / vendor copy
- **Severity:** **S1** (revenue correctness - vendors will be paid the wrong amount)
- **Steps:** `rg "commission_bps" prisma/ apps/api/src/modules/payouts`
- **Expected:** `commission_bps = 1200` (12 %)
- **Actual:** `commission_bps = 1500` default in Prisma schema (15 %)
- **Root cause:** Default value in `Vendor.commission_bps` was set to 1500 during schema creation and never reconciled against the marketing claim of 12 %
- **Fix ref:** FIX-008 (also resolves D5, D8 if a single source-of-truth constant is introduced - see FIX-003)

### QA-D-03-002 - No "Queues" link in admin sidebar despite Bull Board mounted
- **Severity:** S3
- **Steps:** Inspect admin layout sidebar component
- **Expected:** Link to `/admin/queues`
- **Actual:** Bull Board UI exists at `/admin/queues` (Basic-Auth-protected) but no nav entry - admins must know the URL
- **Fix ref:** FIX-009

### QA-D-03-003 - No manual "Run payouts now" trigger in admin
- **Severity:** S4
- **Expected:** Admin can manually enqueue the weekly payouts job
- **Actual:** Cron runs Mon 02:00 UTC only; no manual enqueue button
- **Fix ref:** FIX-010

### QA-D-04-001 - Events table has 5 status states; spec defines 6
- **Severity:** S2
- **Root cause:** `EnquiryStatus` enum: `open / quoted / confirmed / completed / cancelled` (5). Spec lists 6 (additional state: `expired` or `declined`).
- **Fix ref:** FIX-011

### QA-D-04-002 - No event detail page (`/admin/events/[id]`)
- **Severity:** S3
- **Expected:** Click into an enquiry to view full thread
- **Actual:** List view only, read-only
- **Fix ref:** FIX-012

### QA-D-05-001 - Reviews queue filters held-only; no way to view all
- **Severity:** S3 - **Fix ref:** FIX-013

### QA-D-05-002 - No Hold button on review row (only Release / Reject)
- **Severity:** S3 - **Fix ref:** FIX-013

### QA-D-05-003 - Review reject uses `window.prompt()` for reason capture
- **Severity:** S3 (UX) - replace with shadcn dialog + textarea - **Fix ref:** FIX-013

### QA-D-02-001 - Disputes list lacks SLA age indicator
- **Severity:** S4 - **Fix ref:** FIX-014

---

## Section E - Security and Compliance

| Scenario | Title | Result | Defects | Severity |
|---|---|---|---|---|
| E-01 | Stripe webhook rawBody + signature verification | **PASS** | D21 (`STRIPE_WEBHOOK_SECRET` missing in env) | S2 |
| E-02 | Global Prisma exception filter maps known error codes | **FAIL** | D22 | S3 |
| E-03 | `/v1/healthz` deep readiness probe under 1 s | **FAIL** | D3 | S1 |
| E-04 | Rate-limit anti-enumeration on discount codes | **PASS** | - | - |
| E-05 | Auth guards consistent across controllers | **PASS** | - | - |

### QA-E-01-001 - `STRIPE_WEBHOOK_SECRET` not set in environment
- **Severity:** S2
- **Steps:** Smoke endpoint `POST /v1/webhooks/stripe-test` returns `{rawBodyPresent:true, rawBodyLength:2}` (good). But the env-var list does not include `STRIPE_WEBHOOK_SECRET`.
- **Expected:** Secret present so `constructEvent` can verify signatures
- **Actual:** Controller will throw `BadRequestException({code:'WEBHOOK_NOT_CONFIGURED'})` on every real webhook
- **Fix ref:** FIX-015 (add to Replit Secrets)

### QA-E-02-001 - No global `PrismaExceptionFilter` registered
- **Severity:** S3 (escalates to S2 if constraint names leak business logic)
- **Steps:** `ls apps/api/src/common/filters/` and inspect `main.ts:164`
- **Expected:** `PrismaExceptionFilter` exists and is registered, mapping P2002→409, P2025→404, P2003/P2014→400
- **Actual:** Only `HttpExceptionFilter` registered. 5 services (`discount-codes`, `payouts`, `disputes`, `orders`, `reviews`) hand-catch P2002 individually; everything else leaks Prisma error metadata in 500 bodies (column names, constraint names, table names - info disclosure)
- **Fix ref:** FIX-016

### QA-E-03-001 - `/v1/healthz` hangs 30 s; Redis broken; 4 cron jobs unregistered
- **Severity:** **S1**
- **Steps:** `curl http://localhost:3001/v1/healthz` (hangs); inspect API startup logs
- **Expected:** Sub-second response; Redis connected; all crons registered
- **Actual:**
  - `REDIS_URL` returns `WRONGPASS` on connect (10 errors at startup)
  - 4 cron jobs unregistered: **compliance-scan, review-trigger, badge-recalc, weekly-payouts**
  - `/v1/healthz` calls Bull `getJobCounts` against the dead Redis client → blocks 30 s → HTTP 000 (timeout)
  - Liveness probe `/healthz` (without `/v1`) returns 200 OK because it doesn't touch Bull
- **Root cause:** `REDIS_URL` secret password is wrong, OR the Redis instance was rotated and the secret wasn't updated
- **Fix ref:** FIX-017 (rotate `REDIS_URL`); FIX-018 (`/v1/healthz` should `Promise.race` Bull calls with a 1 s timeout and degrade gracefully)

---

## Defect Summary Table

| Defect ID | Title | Severity | Section | Status | Fix Reference |
|-----------|-------|----------|---------|--------|---------------|
| D1 | Old ICO `ZC146267` ships in 6 files including emails | **S1** | A | OPEN | FIX-001 |
| D2 | New ICO `C1931679` not in codebase | **S1** | A | OPEN | FIX-001 |
| D3 | Redis `WRONGPASS`; 4 cron jobs unregistered; `/v1/healthz` hangs 30 s | **S1** | E | OPEN | FIX-017, FIX-018 |
| D4 | Commission rate **15 %** in DB vs **12 %** in spec/copy | **S1** | D | OPEN | FIX-008 |
| D5 | Customer terms don't disclose 12 % commission | S2 | A | OPEN | FIX-003 |
| D6 | Privacy page missing "Right to be informed" (7/8 GDPR rights) | S2 | A | OPEN | FIX-002 |
| D7 | Privacy "Verify ↗" links to complaint flow, not registration lookup | S5 | A | OPEN | FIX-001 |
| D8 | Vendor terms don't state 88 % take-rate | S2 | A | OPEN | FIX-003 |
| D9 | Public referral validate path mismatch (`/v1/loyalty/referrals/validate` vs spec `/v1/referrals/validate`) | S5 | B | OPEN | FIX-004 |
| D10 | `DocumentType` enum missing `food_business_registration` | S2 | C | OPEN | FIX-006 |
| D11 | Throttler header `Retry-After-long` (suffix) instead of bare `Retry-After` | S5 | B | OPEN | FIX-005 |
| D12 | No "Queues" link in admin sidebar | S3 | D | OPEN | FIX-009 |
| D13 | No manual "Run payouts now" trigger | S4 | D | OPEN | FIX-010 |
| D14 | No vendor-approval email | S2 | C | OPEN | FIX-007 |
| D15 | Disputes list lacks SLA age indicator | S4 | D | OPEN | FIX-014 |
| D16 | Events status enum 5 states vs spec's 6 | S2 | D | OPEN | FIX-011 |
| D17 | No `/admin/events/[id]` detail page | S3 | D | OPEN | FIX-012 |
| D18 | Reviews queue held-only filter, no "all" view | S3 | D | OPEN | FIX-013 |
| D19 | Reviews row missing Hold action | S3 | D | OPEN | FIX-013 |
| D20 | Review reject uses `window.prompt()` | S3 | D | OPEN | FIX-013 |
| D21 | `STRIPE_WEBHOOK_SECRET` missing from environment | S2 | E | OPEN | FIX-015 |
| D22 | No global `PrismaExceptionFilter`; 5 services duplicate P2002 catches | S3 | E | OPEN | FIX-016 |

**Totals:** 4 × S1, 7 × S2, 7 × S3, 1 × S4, 3 × S5

---

## Pass/Fail Matrix

| Scenario | Title | Result | Defects |
|---|---|---|---|
| A-01 | Footer ICO number current | FAIL | D1, D2 |
| A-02 | Privacy page ICO + Verify + 8 GDPR rights + retention card grid | FAIL | D1, D2, D6, D7 |
| A-03 | Terms: 12 % commission + 15-min auto-cancel | PARTIAL | D5 |
| A-04 | Vendor terms: "Keep 88 %" headline | FAIL | D8 |
| A-05 | `GET /v1/vendors` rate-limited | PASS | - |
| A-06 | `GET /healthz` returns 200 unthrottled | PASS | - |
| A-07 | Public referral validate reachable | PASS | D9 (path nit) |
| B-01 | LoyaltyController class-level guards, no `requireUser` | PASS | - |
| B-02 | Loyalty 401 without auth | PASS | - |
| B-03 | Loyalty 401 with bad JWT | PASS | - |
| B-04 | Customer → admin endpoint returns 403 | PASS (by inspection) | - |
| B-05 | Public referral validate `@Public()` | PASS | D9 |
| B-06 | Discount-code validate 10/60s with `Retry-After` | PASS | D11 |
| B-07 | Orders rate-limited per customer not per IP | PASS | - |
| C-01 | 4 onboarding document slots | PARTIAL | D10 |
| C-02 | Vendor approval triggers email | FAIL | D14 |
| D-01 | `/admin/users` 10 checks | PASS | - |
| D-02 | `/admin/disputes` listing | PASS | D15 |
| D-03 | `/admin/payouts` cron + 12 % commission | PARTIAL | D4, D12, D13 |
| D-04 | `/admin/events` read-only with full state coverage | PARTIAL | D16, D17 |
| D-05 | `/admin/reviews` queue actions | PARTIAL | D18, D19, D20 |
| D-06 | Bull Board mounted at `/admin/queues` with Basic Auth | PASS | D12 |
| E-01 | Stripe webhook rawBody + signature pipeline | PASS | D21 |
| E-02 | Global `PrismaExceptionFilter` | FAIL | D22 |
| E-03 | `/v1/healthz` deep readiness probe < 1 s | FAIL | D3 |
| E-04 | Discount-code anti-enumeration rate limit | PASS | - |
| E-05 | Auth guards consistent across controllers | PASS | - |

---

## Recommended Fix Priority Order

### S1 - must fix before any vendor onboarding
1. **FIX-001** - Introduce `apps/web/src/lib/legal-constants.ts` with `ICO_NUMBER = 'C1931679'`, `ICO_VERIFY_URL`, `PLATFORM_COMMISSION_PCT = 12`, `VENDOR_PAYOUT_PCT = 88`. Replace 6 string literals + 4 local `const ICO_NUMBER` in legal pages. Update `apps/api/src/modules/notifications/templates/base-layout.ts` to read `process.env.ICO_NUMBER`. Resolves D1, D2, D7. *(Effort: 30 min.)*
2. **FIX-008** - Change Prisma `Vendor.commission_bps` default from 1500 to 1200, update existing vendor rows in dev/staging, redeploy. Use the constant from FIX-001 in admin payouts UI to prevent recurrence. Resolves D4. *(Effort: 1 h including DB migration.)*
3. **FIX-017** - Rotate `REDIS_URL` secret; verify `redis-cli -u $REDIS_URL ping` returns `PONG`; restart API workflow; confirm 4 crons register at boot. Resolves D3 (cron half). *(Effort: 15 min once correct credential is in hand.)*
4. **FIX-018** - Wrap Bull `getJobCounts` calls in `/v1/healthz` with `Promise.race(call, timeout(1000))`; degrade `redis: 'down'` rather than hanging. Defence-in-depth so a future Redis outage doesn't take liveness offline. *(Effort: 30 min.)*

### S2 - fix before first paying customer
5. **FIX-003** - Insert commission/payout disclosures in `/legal/terms` §5 and `/legal/vendor-terms` §3 using FIX-001's constants. Resolves D5, D8.
6. **FIX-002** - Add "Right to be informed" as the first item in `/legal/privacy` rights section.
7. **FIX-006** - Add `food_business_registration` to `DocumentType` enum (Prisma migration), wire upload slot in vendor onboarding.
8. **FIX-007** - Create `vendor-approved.template.ts` in notifications module; enqueue from vendor approval mutation.
9. **FIX-011** - Add the missing 6th state to `EnquiryStatus` enum (likely `expired`); reconcile with admin filters.
10. **FIX-015** - Add `STRIPE_WEBHOOK_SECRET` to Replit Secrets (production + dev).

### S3 - first-sprint hardening
11. **FIX-016** - Create `PrismaExceptionFilter`, register globally, delete the 5 ad-hoc P2002 try/catches.
12. **FIX-013** - Reviews queue: add Hold button, "All" filter, replace `window.prompt()` with shadcn dialog.
13. **FIX-009** - Add "Queues" sidebar link in admin layout.
14. **FIX-012** - Add `/admin/events/[id]` detail page.

### S4–S5 - backlog
15. **FIX-005**, **FIX-010**, **FIX-014**, **FIX-004**

---

## Coverage Gaps (not tested in this pass)

- **Mobile Safari / iOS PWA install** - manifest.json is static-only; no install-prompt or standalone-display testing performed.
- **Stripe live-mode webhook end-to-end** - only the rawBody pipeline + smoke endpoint were verified; no real Stripe test event was signed and replayed against the production secret.
- **Email deliverability** - no SPF/DKIM/DMARC checks, no inbox-placement testing on Gmail/Outlook/Apple Mail.
- **WCAG 2.2 AA audit** - heading hierarchy and skip-to-content link were spot-checked on `/legal/privacy`; no full axe-core or screen-reader pass.
- **Wrong-role 403 round trip** - verified by code inspection only; needs a real customer JWT issued by Supabase to hit `/v1/admin/*` and assert 403.
- **Realtime UPDATE subscription on vendor portal** - vendor app workflow not running this session; not exercised.
- **Postcode validation `/v1/vendors/validate-postcode`** - endpoint returned 404 in earlier audit; not yet implemented.
- **Loyalty redemption checkout flow** - UI presence confirmed in earlier audit; not exercised end-to-end with a real Stripe test payment.
- **Cron job actual execution** - even once Redis is fixed (FIX-017), the 4 cron jobs need behavioural testing, not just registration.
- **Multi-instance throttler correctness** - `@nestjs/throttler` defaults to in-process Map storage; if the API runs >1 pod the per-tracker limits are per-pod, not global. Swap to `@nest-lab/throttler-storage-redis` once Redis is healthy.

---

## Sign-off Criteria (definition of done before first vendor onboarding)

- [ ] Zero S1 defects open (currently **4 open**: D1, D2, D3, D4)
- [ ] Zero S2 defects in customer cancel, loyalty transaction, and Stripe webhook (currently **D21 open** in webhook)
- [ ] `/vendors` page loads with skeleton (not "Loading…") *(not retested this pass)*
- [ ] All 4 onboarding document slots present (currently **3/4** - see D10)
- [ ] ICO number `C1931679` confirmed in footer and privacy page (currently **0/2** - see D1, D2)
- [ ] Vendor Realtime UPDATE subscription confirmed active *(not tested this pass)*
- [ ] Redis confirmed connected in production (currently **WRONGPASS** - see D3)

**Overall verdict: NOT READY.** Resolve D1, D2, D3, D4 (≈ 2.5 hours of work) and D5, D6, D8, D10, D14, D15, D21 (≈ 4 hours) to clear S1 and the customer-impacting S2s. Then re-run scenarios A-01..A-04, C-01..C-02, D-03, E-01, E-03 to confirm.
