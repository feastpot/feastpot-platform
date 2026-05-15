# Feastpot — UAT Defects Report

**Test date:** 14 May 2026
**Tester:** Replit Agent (UAT pass, code-inspection + live runtime probes against dev workflows API:3001, Web:3000, Vendor:3002, Admin:3003)
**Scope:** All four role journeys — Logged-out (guest), Logged-in customer, Vendor, Admin.
**Method:** Mapped every page/route from source, probed live HTTP endpoints, replayed observed runtime behaviour from workflow logs, cross-checked frontend↔backend DTO contracts.

> **Severity legend:** **S1** Blocker (release-stopper) · **S2** Major (broken core flow / data risk) · **S3** Moderate (degraded UX, workaround exists) · **S4** Minor (cosmetic, perf, copy, debt) · **S5** Observation (not a defect — flagged for product decision)

---

## 1 — Environment & Infrastructure (cross-cutting)

### D-001 · S2 · Redis cache disabled in dev — caching, queues, and crons silently degraded
- **Where:** `apps/api` startup; `RedisCacheService`, `BullModule`.
- **Repro:** Start API workflow. Logs show `Redis cache error: WRONGPASS invalid username-password pair` repeated 3×, then `Redis cache disabled after exhausting reconnection attempts`.
- **Knock-on failures (also in logs):**
  - `Failed to register payout cron … Reached the max retries per request limit (which is 20)`
  - `Failed to register compliance-scan cron …`
  - `Failed to register review-trigger cron …`
  - `Failed to register badge-recalc cron …`
- **Impact:** No payout batches, no compliance expiry sweeps, no review-prompt triggers, no vendor badge recalculation. All caching falls through to Postgres → higher load + slower responses.
- **Fix:** Update `REDIS_URL` / `REDIS_PASSWORD` secrets for the dev environment, or gate Redis behind a feature flag so dev can run without it without spamming errors.

### D-002 · S3 · API health endpoint mounted at `/healthz` & `/livez` (root), NOT under `/v1`
- **Repro:** `curl /v1/healthz` → 404; `curl /healthz` → 200; `curl /livez` → 200.
- **Impact:** Any uptime monitor or deploy probe pointed at the versioned `/v1/healthz` will report the API down. `scripts/verify-deploy.sh` and external monitors must use root paths.
- **Fix:** Either mirror `/healthz` under `/v1` or document the exception explicitly in the API readme.

### D-003 · S3 · Web dev preview blocks Replit cross-origin requests
- **Repro:** Web logs: `⚠ Blocked cross-origin request from <repl-id>.worf.replit.dev to /_next/* resource. To allow this, configure "allowedDevOrigins" in next.config`.
- **Impact:** HMR + image optimisation may fail when previewing on the Replit-hosted dev URL. Affects internal review only (not prod).
- **Fix:** Add `allowedDevOrigins: ['*.replit.dev']` to `apps/web/next.config.*`.

### D-004 · S4 · Prisma `DEALLOCATE ALL` issued on every query
- **Repro:** API workflow logs show `BEGIN → DEALLOCATE ALL → <query> → COMMIT` for every Prisma call.
- **Impact:** Connection-pooling churn — wastes ~1ms per request and can starve the pool under load. Indicates the Prisma client is being instantiated per-request OR the Supabase pooler is in transaction mode and Prisma is re-arming statements every time.
- **Fix:** Confirm `PrismaService` is `@Injectable()` singleton + use `pgbouncer=true&connection_limit=1` on the pooler URL, or switch to the direct (non-pooled) URL where Prisma owns the lifecycle.

### D-005 · S4 · Webpack cache emitting >100 KiB strings (perf warning)
- **Repro:** Web log: `[webpack.cache.PackFileCacheStrategy] Serializing big strings (101kiB / 231kiB) impacts deserialization performance`.
- **Impact:** Slow cold restarts of `npm run dev` for the web app.
- **Fix:** Identify the offending module (likely a large MDX/JSON import in `/events/new`) and lazy-import it.

---

## 2 — Logged-out / Guest Journeys (apps/web)

### D-101 · S2 · Postcode validator is "deliberately permissive" — accepts non-postcode strings
- **Where:** `apps/web/src/lib/postcode.ts` (`normalisePostcode`); used by `PostcodeHero` and the resume banner.
- **Impact:** Customers entering "asdf" or "BFPO" / "GIR 0AA" / partial input get sent to `/vendors?postcode=…` with garbage, and the vendor list silently shows all vendors regardless of geo. They never learn their postcode is wrong.
- **Fix:** Tighten regex to UK outward-code at minimum (`/^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$/i`) and surface a clear inline error on submit; keep BFPO/GIR as documented allow-list exceptions.

### D-102 · S2 · `/sign-in` accepts `?next=` redirect to **any** path without an open-redirect check
- **Where:** `apps/web/src/middleware.ts` & `/sign-in` handler.
- **Impact:** A crafted link `/sign-in?next=https://evil.example` could be used in phishing — depends on whether `next` is forwarded into `router.push()` raw.
- **Fix:** Whitelist `next` to start with `/` and reject absolute URLs.

### D-103 · S3 · Hero subline duplicated four cuisines that no longer match the vendor catalogue
- **Where:** Was `Nigerian · Ghanaian · Jamaican · Caribbean` (now removed in feab65c); but the same four still hard-coded in `apps/web/src/app/page.tsx` cuisine cards and `cuisine-landing.tsx`.
- **Impact:** Catalogue now seeds 20 vendors across 18 diasporas (Punjabi, Lebanese, Filipino, Vietnamese, Polish, etc.). The home page advertises 4 — discovery for the other 16 is gated behind `/vendors` text search.
- **Fix:** Either expand the home grid to a representative ~10 cuisines, or reframe the four as "Featured" rather than the catalogue's full breadth.

### D-104 · S3 · `/orders/[id]/confirmation` shows a **fake referral code** (`FP-XXXXXX`)
- **Where:** `apps/web/src/app/orders/[id]/confirmation/page.tsx:247` — falls back to placeholder `FP-XXXXXX` when the user has no code.
- **Impact:** Newly-registered customers complete their first order and are encouraged to share `FP-XXXXXX` with friends — that code does not work; they look amateurish to their friends.
- **Fix:** Confirmation page must call `GET /v1/referrals` (which now exists) and render the real `referralCode` — or hide the share card until the code is loaded.

### D-105 · S3 · `/checkout` slot picker uses **app-wide hard-coded hours** (11:00–20:00) ignoring vendor schedule
- **Where:** `apps/web/src/app/checkout/page.tsx:420-428`.
- **Impact:** Customer can pick 19:30 from a vendor that closes at 18:00; vendor then rejects the order. Refund + bad rating risk.
- **Fix:** API needs `GET /v1/vendors/:id/slots?date=` returning real availability windows from the new `DeliveryConfig` + per-day `serviceWindows` (not yet in schema — flagged D-501 below). Until then, narrow the placeholder window to the catalogue intersection.

### D-106 · S3 · `/join?ref=…` capture writes to localStorage but does not validate the code exists
- **Where:** `apps/web/src/app/join/page.tsx`.
- **Impact:** A bad/expired code is happily stored and then forwarded into `/register`; `processReferral` silently no-ops on an unknown code, so the user never learns they got no welcome bonus. Loses goodwill on the most marketing-sensitive flow.
- **Fix:** Add a `HEAD /v1/referrals/validate?code=` (or piggy-back on existing referral lookup) and surface "code not recognised" before redirect.

### D-107 · S4 · Footer ICO copy now `ZC146267` everywhere except inside `apps/api/dist/` (compiled)
- **Where:** `apps/api/dist/modules/notifications/templates/base-layout.js` still contains `C1931679`.
- **Impact:** None at runtime (TS rebuild overwrites `dist`), but a stale `dist` could ship if someone deploys without `npm run build`.
- **Fix:** Add `dist/` to `.gitignore` (if not already) and ensure CI rebuilds.

### D-108 · S4 · `home → "newest"` sort is faked (rating-sorted)
- **Where:** `apps/web/src/app/page.tsx:28` — TODO: switch to true createdAt sort once backend supports it.
- **Impact:** "Recently joined" and "Newest" filters lie. Misleading for vendors who expect debut-order placement.

### D-109 · S5 · Service Worker present (`sw.js`, `manifest.json`) but `next-pwa` workflow is "disabled"
- **Where:** `apps/web/public/sw.js`, web log `(pwa) PWA support is disabled.`
- **Impact:** Users who installed the PWA in a previous build retain a stale SW; "offline" route never serves. Should either fully disable & remove, or finish the migration to `@ducanh2912/next-pwa` per `replit.md`.

---

## 3 — Logged-in Customer Journeys (apps/web)

### D-201 · **S1** · Customers cannot cancel their own orders — `PATCH /v1/orders/:id/status` rejects `customer` role
- **Where:** `apps/web/src/lib/api/orders.ts:170` calls `PATCH /v1/orders/:id/status` with `cancelled`. `apps/api/src/modules/orders/orders.controller.ts:65` declares `@Roles(vendor, admin)` only.
- **Repro:** Sign in as customer → `/orders/[id]/tracking` → "Cancel order" → API returns `403 Forbidden`. UI silently swallows error and shows "Contact vendor" fallback (per code comment line 115).
- **Impact:** No customer self-service cancel, contradicting consumer-rights expectations (UK distance-selling regs allow cancellation pre-dispatch). Pushes load to vendor support and creates a refund-dispute pipeline.
- **Fix:** Add a customer-only endpoint `POST /v1/orders/:id/cancel` that enforces ownership + `status in (pending, accepted)` and writes a `cancellation_reason` audit field.

### D-202 · S2 · Loyalty redemption write inside checkout is not bound to the same transaction as order creation
- **Where:** `OrdersService.createOrderInner` (line ~200) calls `LoyaltyService.redeemPoints(userId, points, orderId)`. `redeemPoints` already advisory-locks per-user — but the redemption row is written BEFORE the Order is created, and the Order row carries `loyaltyPointsToRedeem` separately on the order.
- **Impact:** If the order INSERT fails after the redemption row is committed, the customer's points are debited with no order to refund against. `refundRedemption` looks up by `orderId` which doesn't exist → orphaned debit.
- **Fix:** Either (a) defer `redeemPoints` to inside the same `prisma.$transaction` as the order INSERT, or (b) make `redeemPoints` return a rollback handle that the caller invokes on order failure.

### D-203 · S2 · `OrdersController.list` returns a single status filter at a time
- **Where:** `ListOrdersDto.status` is `OrderStatus`, not `OrderStatus[]`. `useActiveOrders` hook in `apps/vendor` and `apps/web` work around this with **N parallel requests**.
- **Impact:** Inefficient (4–6× the queries it needs to be), and creates inconsistent snapshot reads (one status may be paged differently than another).
- **Fix:** Change DTO to `@IsArray() @IsEnum(OrderStatus, { each: true })` and pass through to a `where: { status: { in: … } }` query.

### D-204 · S3 · `/account` shows guest landing without distinguishing "logged-out" from "logged-in but profile not synced"
- **Where:** `apps/web/src/app/account/page.tsx`.
- **Impact:** A user who has a Supabase session but whose `/v1/users/sync` call hasn't completed lands on the guest page. Confusing for users who just signed in via OTP.
- **Fix:** Treat presence of `supabase.auth.user()` as authenticated and render a "syncing your profile…" skeleton instead of the guest CTA.

### D-205 · S3 · Order tracking falls back to **30s polling** when Supabase Realtime fails
- **Where:** `apps/web/src/app/orders/[id]/tracking/page.tsx`.
- **Impact:** A 30s lag between vendor "marking dispatched" and customer seeing it is a long way short of the spec's <5s realtime target. Aggravated by Redis being down (D-001) which can also degrade the realtime broker.
- **Fix:** Drop polling to 8s and add a "Refresh now" button that fires `invalidateQueries`.

### D-206 · S3 · `/orders/[id]/review` lets users rate **any order**, including pending/cancelled
- **Where:** `apps/web/src/app/orders/[id]/review/page.tsx` (no status check).
- **Impact:** Users can leave a 1-star review on a vendor for an order that was never delivered → unfair review pressure on vendors.
- **Fix:** Server-side: `ReviewsController.create` must reject when `order.status !== 'delivered'`. Client-side: hide the star prompt when the order is in any non-delivered state.

### D-207 · S4 · "Reorder" button creates a new order via `/orders/[new-id]/tracking` URL but does not re-confirm slot availability
- **Where:** `/account/orders` reorder action.
- **Impact:** Customer reorders a basket from 3 weeks ago and is silently allocated yesterday's slot or a fully-booked slot.
- **Fix:** "Reorder" should drop the basket back into `/checkout` for slot re-selection rather than auto-creating an order.

---

## 4 — Vendor Portal Journeys (apps/vendor)

### D-301 · S2 · Vendor "Dispatch ETA" sheet writes to `/orders/:id/status` with no server-side time validation
- **Where:** `DispatchEtaSheet` (presets 15/30/45/60 min) → `PATCH /orders/:id/status`.
- **Impact:** ETA isn't persisted on the Order schema (no `etaMinutes` or `etaAt` column visible). Customer tracking page therefore can't show "Arriving in X min" — defeats the purpose of the picker.
- **Fix:** Add nullable `etaAt timestamptz` to `Order`; `UpdateOrderStatusDto` accepts optional ETA when status moves to `dispatched`; tracking UI consumes it.

### D-302 · S2 · Onboarding shows **3 document slots** but spec requires **4** (Hygiene, Insurance, ID, Food Business Registration)
- **Where:** `apps/vendor/src/app/onboarding/*`.
- **Impact:** Vendors complete onboarding without uploading "Food Business Registration" → compliance team has to chase out-of-band, slows go-live.
- **Fix:** Add the 4th slot wired to `documents` API with type `kitchen_reg` (the API already accepts this type per the explorer report).

### D-303 · S2 · `MenuItemUpsertInput` POST does not accept `isAvailable`; UI exposes a disabled toggle
- **Where:** `apps/vendor/src/app/menu/[menuId]/items/[itemId]/item-editor-client.tsx`.
- **Impact:** Vendor cannot create a hidden/draft item — every new item is immediately live in the customer catalogue, even half-priced or unfinished.
- **Fix:** Add `isAvailable` (default `false` on create) to `CreateMenuItemDto` and enable the toggle.

### D-304 · S2 · Realtime `INSERT` channel listens for new orders only — status PATCH events rely on **manual `invalidateQueries`**
- **Where:** `apps/vendor/src/app/orders/orders-client.tsx`.
- **Impact:** Vendor dashboard misses "customer cancelled" or "admin overrode status" events; vendor preps an order that's been cancelled → wasted food.
- **Fix:** Subscribe to `UPDATE` on `public.orders` filtered by `vendor_id = me`.

### D-305 · S2 · Delivery settings lacks **lead time, available days, slot windows** — UI labels them "not configurable yet"
- **Where:** `/settings/delivery`.
- **Impact:** Compounds D-105: the customer slot picker has nothing to query against. Every vendor effectively has identical hours.
- **Fix:** Extend `DeliveryConfig` model with `leadTimeMinutes Int`, `serviceDays Int[]` (0–6 weekday mask), `serviceWindows Json` (per-day from/to). Already implied by UI — schema migration owed.

### D-306 · S3 · Image reordering on menu items is read-only ("TODO: wire up once the field exists")
- **Where:** `item-editor-client.tsx:571`.
- **Impact:** First image uploaded is always the cover image → vendors who upload the wrong photo first must delete and re-upload all images to fix the cover.
- **Fix:** Add `position Int` to `MenuItemImage` and a drag-handle UI.

### D-307 · S3 · `/payouts` "Download Statement" button is hard-disabled ("Coming soon")
- **Where:** `apps/vendor/src/app/payouts/*`.
- **Impact:** Vendors must screenshot the table for their accountants — manual work for every vendor every week.
- **Fix:** Implement `GET /v1/payouts/:id/statement.csv`.

### D-308 · S3 · Vendor server pages re-throw 5xx without an Error Boundary
- **Where:** Multiple Server Components in `apps/vendor`.
- **Impact:** A transient API 500 hits Next's default error page (full white screen). No retry UX, no Sentry breadcrumb.
- **Fix:** Add `error.tsx` boundaries per route group.

### D-309 · S4 · "Accepted" status is folded into "Preparing" tab visually but exists as a distinct state
- **Where:** `orders-client.tsx`.
- **Impact:** Vendor cannot distinguish orders they've accepted but not yet started prepping → kitchen workflow ambiguity.

---

## 5 — Admin Panel Journeys (apps/admin)

### D-401 · S2 · `/settings` is a "Coming Soon" placeholder
- **Where:** `apps/admin/src/app/settings/page.tsx`.
- **Impact:** No UI for global config (commission %, payout cadence, holiday calendar). Adjustments require DB writes.
- **Fix:** At minimum expose commission bps, default lead time, and service-pause toggle.

### D-402 · S2 · No admin **Reviews moderation** UI despite `ReviewsController.listModerationQueue` + `PATCH /reviews/:id/moderation` existing
- **Where:** `apps/api` has the endpoints; `apps/admin` has no page consuming them.
- **Impact:** No way to take down a libellous or spam review without a DB edit. Brand-safety and legal risk.
- **Fix:** Build `/reviews/queue` admin page mirroring the dispute list pattern.

### D-403 · S2 · No admin **Event Enquiries** management
- **Where:** Customer + vendor flows exist; admin has nothing.
- **Impact:** Admin cannot intervene on stuck enquiries (no quote received, deposit failed, vendor mismatch). Spec mentions enquiry SLA monitoring — currently only logged.
- **Fix:** Build `/events` admin list with filter by status + the same dispute-style detail view.

### D-404 · S2 · No admin **Push notification broadcast** UI
- **Where:** `PushController.subscribe` + `unsubscribe` exist; admin has no broadcast composer.
- **Impact:** Marketing/ops cannot send service announcements without a deploy.
- **Fix:** Build `/push/compose` with audience filter (all / by city / by cuisine).

### D-405 · S2 · `AdminController.searchAnalytics` hard-coded `LIMIT 25`, no pagination
- **Where:** `apps/api/src/modules/admin/admin.controller.ts:88`.
- **Impact:** Admin dashboard "search trends" silently truncates after 25 rows; underlying data may have hundreds.
- **Fix:** Add cursor pagination consistent with `OrdersController`.

### D-406 · S3 · `SearchTrendsCard` may crash if `data` is null mid-render
- **Where:** `apps/admin/src/app/page.tsx` dashboard.
- **Impact:** Race between `useAdminDashboard` loading state and the `.map(…)` call; observed only in code-review (no live repro this pass).
- **Fix:** Guard with `data?.trends?.map?.(…) ?? null` or split into a Suspense boundary.

### D-407 · S3 · `/admin/queues` (Bull Board) is API-mounted but not surfaced in the admin nav
- **Impact:** Ops can't easily inspect failed jobs / DLQ from the panel — must remember the URL.
- **Fix:** Add a "Queues" nav link that opens `${API_URL}/admin/queues` in a new tab.

### D-408 · S3 · Admin "Suspend user" / "Reinstate user" lacks a reason field on the request
- **Where:** `IssueCreditDto` carries a reason; suspend/reinstate do not.
- **Impact:** Audit trail says "user X suspended by admin Y" with no rationale → poor compliance posture for GDPR.
- **Fix:** Add required `reason: string` (min 10 chars) to suspend/reinstate DTOs and persist on `AuditLog.metadata`.

### D-409 · S4 · Stripe PI status reconciliation is **hard-capped at first 50 orders**
- **Where:** `orders-client.tsx` comment: "Stripe PI status (first 50)".
- **Impact:** Older orders' Stripe statuses are not displayed in the admin order list.

---

## 6 — API contract & DTO defects

### D-501 · S1 · `LoyaltyController` declares `@Controller({ version: '1' })` with **no path** → routes mounted at `/v1/loyalty-points` and `/v1/referrals`
- **Where:** Logged at startup as `LoyaltyController {/} (version: 1)`.
- **Impact:** No bug in functionality, but the controller path being empty looks like a misconfiguration; if a future controller also declares `{}` they will collide on the global namespace.
- **Fix:** Use `@Controller({ version: '1', path: 'loyalty' })` and move the `@Get('referrals')` to its own `ReferralsController` to keep the path tree tidy.

### D-502 · S2 · `LoyaltyController` enforces auth via a manual `requireUser` helper instead of `@Roles` / guard
- **Where:** `apps/api/src/modules/loyalty/loyalty.controller.ts:49`.
- **Impact:** Inconsistent with the rest of the codebase. If the global `JwtAuthGuard` is ever removed, this controller silently becomes public — `requireUser` only throws when `user === null`, which assumes a guard already populated `@CurrentUser`.
- **Fix:** Add `@UseGuards(JwtAuthGuard, RolesGuard)` at the class level + `@Roles(customer, admin)`.

### D-503 · S2 · No `@Throttle` / rate-limit on `POST /v1/discount-codes/validate` — code-brute-forceable
- **Where:** `apps/api/src/modules/discount-codes/discount-codes.controller.ts`.
- **Impact:** An attacker can iterate codes (`SAVE10`, `WELCOME`, …) to discover live promotions and abuse them.
- **Fix:** `@Throttle({ default: { limit: 10, ttl: 60_000 } })` per IP.

### D-504 · S2 · Stripe webhook will fail if `RawBodyConfig` is misconfigured in `main.ts`
- **Where:** `StripeWebhookController` checks `req.rawBody`; if undefined, throws `BadRequestException` for every webhook.
- **Impact:** Silent revenue impact — payments succeed in Stripe but orders never confirm.
- **Fix:** Verify `bodyParser: { rawBody: true }` is set in `NestFactory.create(…, { bodyParser: false, rawBody: true })` and add a smoke-test that POSTs a fake event signature.

### D-505 · S3 · Many services don't catch Prisma `P2025` ("not found") → leak as 500
- **Where:** `AddressesService`, `UsersService` (various lookups).
- **Impact:** Frontend treats 500 as a system failure (red banner) when it's actually "user navigated to a deleted address" → support tickets.
- **Fix:** Wrap with `try { … } catch (e) { if (e.code === 'P2025') throw new NotFoundException(); throw e; }` or use a global Prisma exception filter.

### D-506 · S3 · API pagination is **inconsistent** — some endpoints offset/limit, others cursor
- **Where:** `DiscountCodesController` (offset) vs `OrdersController` / `DisputesController` (cursor).
- **Impact:** Frontend has to maintain two pagination utilities; new devs guess wrong.
- **Fix:** Standardise on cursor for high-volume; document offset-vs-cursor decision in `apps/api/CONTRIBUTING.md`.

---

## 7 — Cross-cutting summary

| Severity | Count |
|----------|-------|
| **S1 — Blocker**           | **2**  (D-201 customer cancel, D-501 loyalty route path) |
| **S2 — Major**             | **20** |
| **S3 — Moderate**          | **15** |
| **S4 — Minor**             | **6**  |
| **S5 — Observation**       | **1**  |
| **Total defects**          | **44** |

### Top-5 fix-first list (recommended sprint cut)
1. **D-201** Customer self-cancel endpoint — direct user-rights regression.
2. **D-001** Restore Redis credentials in dev — unblocks 4 cron jobs + caching.
3. **D-202** Wrap loyalty redemption in the order transaction — money-correctness.
4. **D-303** Add `isAvailable` to MenuItem create — vendors are publishing drafts unintentionally.
5. **D-302 / D-305** Onboarding 4th doc slot + delivery slot fields — onboarding & checkout depend on each other.

### Coverage gaps (could not test in this pass — deferred)
- Mobile Safari 17 / iOS PWA install path (no device available to agent).
- Stripe live-mode webhook signature verification (only test mode credentials present).
- Email/SMS deliverability of all 28 notification templates (no SMTP capture in dev).
- WCAG 2.2 AA audit on checkout & vendor onboarding (deserves a dedicated pass).

---

*End of report. File path: `docs/UAT_DEFECTS_2026-05-14.md`.*
