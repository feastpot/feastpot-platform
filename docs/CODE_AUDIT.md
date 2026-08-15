# Feastpot - Code Audit & Feature Inventory

_Audited: 16 June 2026. Code-verified against the monorepo as it stands today -
a full backend/frontend/data-layer sweep (grep + module-by-module review +
three parallel codebase audits), not the roadmap or memory. Supersedes the
31 May 2026 `GO_LIVE_GAPS.md` and the May `STATUS.md` / `IMPLEMENTATION_NOTES.md`
snapshots, several of whose gaps are now closed and whose module list has since
grown (six modules - `coverage`, `inbox`, `mfa`, `vendor-members`,
`discount-codes`, and a fuller `loyalty` - did not exist at that time)._

---

## How to read this document

This is an **editorial audit**, not a changelog. It answers three questions:

1. **What is implemented** - the feature and function inventory, surface by surface.
2. **What is yet to be implemented** - gaps, stubs, and "coming soon" placeholders,
   each traceable to a file.
3. **What it means** - an engineering read on launch-readiness and sequencing.

Every gap carries a severity:

- 🔴 **Blocker** - the first real order cannot happen until this is done.
- 🟠 **Pre-launch** - should land before opening to the public; a controlled
  pilot can run without it.
- 🟡 **Polish** - a visible gap or "coming soon" stub; safe to ship after launch.

The headline, unchanged from the last two audits: **the product code is mature
and the core transactional path is complete end-to-end.** Almost every remaining
🔴 is operational config (live credentials, hosting, monitoring), not missing
features. The code gaps that remain are overwhelmingly 🟡.

---

## 1. Executive summary

Feastpot is a UK diaspora bulk-food marketplace built as an npm-workspaces +
Turborepo monorepo: a NestJS 11 API (`@feastpot/api`) and three Next.js 15
frontends (`@feastpot/web` customer PWA, `@feastpot/vendor` portal,
`@feastpot/admin` panel), sharing `@feastpot/{types,ui,config}`, on Prisma 5
against a Supabase Postgres (shared dev/prod, ref `zibmwuzxgydlvapiddhf`), with
BullMQ on Upstash Redis for background work and Stripe Connect for money movement.

**Maturity: late-beta / pre-launch.** The end-to-end commerce loop -
discovery → storefront → basket → Stripe checkout (auth-on-order) → kitchen
acceptance → status machine → delivery → capture-on-delivery → weekly Stripe
Connect payout - is built, wired, and partially unit-tested. Two secondary
journeys are also complete: **event catering** (enquiry → vendor quotes →
deposit + balance split) and **admin operations** (moderation, disputes,
payout reconciliation, audit logging).

What is _not_ done splits cleanly:

- **Operational blockers (🔴):** live Stripe keys + webhook registration,
  production Supabase/Redis provisioning, frontend hosting (Vercel), Sentry DSNs,
  and uptime/queue alerting. These are credentials and infra, not code.
- **Product polish (🟡):** a scatter of "coming soon" stubs - CSV exports,
  bulk-action checkboxes, advanced filters, live-tracking map, menu/photo
  drag-reorder, real rating breakdowns, loyalty/referral earn-hooks.
- **Quality gate:** the CI `test` job and the ≥70% coverage requirement are not
  yet satisfied (many modules ship without specs); see §8.

---

## 2. Architecture at a glance

| Layer         | Tech                                            | Port (dev) | Notes                                                                             |
| ------------- | ----------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| API           | NestJS 11, URI versioning `/v1`                 | 3001       | Supabase JWT auth, `@Roles` guards, global `StripeModule` + `NotificationsModule` |
| Customer PWA  | Next.js 15 App Router, React 18.3, Tailwind 3.4 | 3000       | Supabase SSR, TanStack Query, zustand basket                                      |
| Vendor portal | Next.js 15                                      | 3002       | Shared `AuthProvider`, Stripe Connect onboarding                                  |
| Admin panel   | Next.js 15                                      | 3003       | Server-gate role checks, embedded BullBoard                                       |
| Data          | Prisma 5 / Supabase Postgres                    | -          | ~45 models, integer-pence money, RLS-central                                      |
| Queues        | BullMQ / Upstash Redis (`rediss://`)            | -          | 5-min poll cadence, DLQ monitoring                                                |
| Payments      | Stripe Connect (Standard/Express)               | -          | auth-on-order, capture-on-delivery, Transfer payouts                              |

---

## 3. Feature & function inventory - Backend API (`apps/api`)

All routes mount under `/v1`. Auth is Supabase JWT via `SupabaseAuthGuard`, with
per-route narrowing through `@Roles(...)` + `RolesGuard`.

### 3.1 Core infrastructure (`src/auth`, `src/prisma`, `src/queues`, `src/stripe`, `src/common`)

- **Auth** - Supabase JWT verification, `RolesGuard`, role-based access control.
- **Prisma** - DB client + connection lifecycle management.
- **Queues** - BullMQ config + queue-depth/DLQ monitoring services.
- **Stripe** - low-level Stripe API wrapper with deterministic idempotency keys.
- **Common** - config/required-env validation, Redis cache service, filters.

### 3.2 Feature modules (`src/modules`) - 20 modules

| Module            | Purpose                                        | Representative endpoints                                                                                                       | Background work                                 |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `users`           | Profile + admin status                         | `GET/PATCH /users/me`, `PATCH /:userId/status`                                                                                 | -                                               |
| `addresses`       | Customer delivery addresses                    | CRUD `/addresses`                                                                                                              | -                                               |
| `vendors`         | Vendor profiles, search, availability, Connect | `GET /vendors/search`, `me/stats`, `me/analytics`, `me/delivery-config`, `me/stripe-connect-link`, `:id/reviews`               | -                                               |
| `vendor-members`  | Team / staff management                        | `POST /vendor-members/invite`, `GET /vendor-members`                                                                           | -                                               |
| `catalogue`       | Menus + items                                  | CRUD, image upload, `PATCH /items/reorder`, availability toggle                                                                | -                                               |
| `orders`          | Order lifecycle + slotting                     | `POST /orders`, `PATCH /:id/status`, `reorder`, amendment GET/PATCH                                                            | -                                               |
| `payments`        | Stripe processing + webhooks                   | `GET /payments`, `refunds`, `POST /payments/webhook` (raw body)                                                                | `stripe-webhooks` processor                     |
| `payouts`         | Vendor fund transfers                          | `GET /payouts`, `:id/approve`, `:id/hold`                                                                                      | `payouts` queue + weekly batch                  |
| `disputes`        | Dispute lifecycle                              | `POST /disputes`, `:id/respond`, escalate, close, evidence GET/POST                                                            | -                                               |
| `compliance`      | Vendor doc verification                        | `POST /compliance/upload`, `verify`                                                                                            | `compliance` queue + expiry cron                |
| `reviews`         | Ratings + moderation                           | `POST /reviews`, `moderation-queue`, `:id/moderate`                                                                            | -                                               |
| `event-enquiries` | Catering enquiries + quotes                    | create, quotes, select-vendor, confirm-deposit, confirm-numbers                                                                | `EventCronService` (72h/48h)                    |
| `discount-codes`  | Promo codes                                    | `POST /discount-codes`, `validate`                                                                                             | -                                               |
| `loyalty`         | Points + referrals                             | `GET /loyalty/balance`, `referrals/validate`                                                                                   | `LoyaltyCronService`                            |
| `notifications`   | Multi-channel messaging                        | `PATCH /notifications/preferences` (no public routes)                                                                          | `NOTIFICATIONS_QUEUE` (email/SMS/push/WhatsApp) |
| `inbox`           | In-app notifications                           | `GET /inbox`, `PATCH /:id/read`                                                                                                | -                                               |
| `push`            | Web-push subscriptions                         | `POST /push/subscribe`, `unsubscribe`                                                                                          | -                                               |
| `mfa`             | Multi-factor auth                              | `POST /mfa/enroll`, `verify`; recovery codes                                                                                   | -                                               |
| `coverage`        | Postcode interest / waitlist                   | `POST /coverage/interest`                                                                                                      | -                                               |
| `admin`           | Internal operations                            | `dashboard`, `vendor-applications`, `audit-log(.csv)`, `compliance/expiring`, `payouts/:id/reconcile-stripe`, `push/broadcast` | out-of-cycle payout trigger                     |
| `webhooks`        | Future provider webhooks                       | _empty `@Module({})`_                                                                                                          | -                                               |

### 3.3 Background jobs & crons

- **Stripe webhook processor** - idempotent via `ProcessedWebhookEvent`; handles
  `payment_intent.succeeded`, `payment_intent.payment_failed`, `transfer.created`,
  `refund.updated`.
- **Weekly payout batch** - Monday Stripe Transfer run; payout = total −
  serviceFee − commission (delivery stays with vendor).
- **Compliance expiry cron** - flags expiring FHRS / insurance / allergen docs.
- **Event crons** - `event-reminder-72h` (confirm numbers) and `event-balance-48h`
  (capture balance PI), both cross-pod-safe via conditional `updateMany`.
- **Loyalty cron** - ledger maintenance (earn-hooks not yet wired; see §6).

---

## 4. Feature & function inventory - Frontends

### 4.1 Customer PWA (`apps/web`, port 3000)

**Implemented routes:** `/` (postcode hero + marketing), `/(auth)/*` (sign-in
OTP/password, register, forgot-password), `/vendors` (search/discovery),
`/vendors/[slug]` (storefront menu), `/checkout` (Stripe Elements, slot picker,
guest + authed), `/account/*` (profile, addresses, notifications, order history),
`/orders/[id]/tracking`, `/orders/[id]/confirmation`, `/orders/[id]/review`,
`/events` (+ `new`, `[id]`, confirmed), `/become-a-vendor`, `/help`,
`/legal/{terms,privacy,cookies,allergens}`, three cuisine SEO landing pages
(`/nigerian-…`, `/ghanaian-…`, `/caribbean-food-delivery-london`), `/offline`,
icon/OG route handlers.

**Notable features:** zustand vendor-locked basket (`feastpot.basket.v1`,
cross-vendor add throws `CrossVendorBasketError`); postcode serviceability check;
custom PWA service worker (`sw-custom.js`) with update prompts; delivery/collection
slot picker; `next-sitemap` postbuild enriched with live vendor URLs; cookie banner.

### 4.2 Vendor portal (`apps/vendor`, port 3002)

**Implemented routes:** `/` (dashboard: at-a-glance + today's orders with audible
alerts), `/orders` (incoming/active/history with reject, propose-amendment,
dispatch-ETA sheets), `/menu` (multi-menu + item editor), `/availability`
(scheduling, blackout dates, capacity caps), `/compliance` (doc uploads),
`/payouts` (Stripe Connect status + financials), `/analytics`, `/notifications`
(activity feed), `/settings/*` (profile, delivery zones, team, security/MFA),
`/onboarding/*` (multi-step register + welcome), `sign-in`, `unauthorized`.

**Notable features:** `use-stripe-connect` onboarding hook; compliance-status
validation logic; real-time order intake.

### 4.3 Admin panel (`apps/admin`, port 3003)

**Implemented routes:** `/` (dashboard: search trends + ops stats), `/orders`
(global monitoring + overrides), `/vendors` (list + moderation detail),
`/vendor-applications` (approval queue), `/menus/queue` (item moderation),
`/reviews/queue` (review moderation), `/users` (staff + customer management),
`/payouts` (batch approve, per-row hold, Stripe reconcile), `/disputes`,
`/compliance` (expiry table), `/push/compose` (broadcast), `/discount-codes`,
`/audit-log` (+ CSV), `/settings`, `sign-in`, `unauthorized`.

**Notable features:** menu/review moderation approve-reject flows; SLA tracking
(`src/lib/sla.ts`); server-side role gates (`src/lib/auth/server-gate.ts`);
embedded BullBoard queue inspection.

---

## 5. Feature & function inventory - Shared packages & data layer

### 5.1 `packages/types`

Prisma client re-export + Zod request/response schemas: auth (`Register`,
`Login`), user/address, vendor create/update, catalogue (menu/item),
delivery config, orders (`CreateOrder`, `CreateOrderItem`, `CreateRefund`),
disputes, reviews, events (`CreateEventEnquiry`, `CreateEventQuote`).

### 5.2 `packages/ui`

shadcn library + `theme.css` (HSL brand tokens `bg-brand` #E8520A / `bg-teal`
#1D9E75 / `bg-vendor` #185FA5): badge, button, card, dialog, dropdown-menu,
empty-state, form, input, loading-spinner, nav-bar, page-shell, select, sheet,
skeleton, table, tabs, toast.

### 5.3 `packages/config`

Shared `tsconfig` + ESLint base (`eqeqeq` intentionally allows the `== null`
idiom).

### 5.4 Data model (Prisma - grouped by domain)

- **Identity:** `User`, `Session`, `MfaRecoveryCode`, `AuditLog` · enums
  `UserRole`, `UserStatus`.
- **Vendor:** `Vendor`, `VendorMember`, `VendorApplication`, `VendorDocument`,
  `BlackoutDate` · `VendorStatus`, `VendorMemberRole/Status`,
  `VendorApplicationStatus`, `DocumentType`, `DocumentStatus`.
- **Catalogue:** `Menu`, `MenuItem` · `ItemCategory`, `ModerationStatus`.
- **Orders & logistics:** `Order`, `OrderItem`, `OrderAmendment`, `Address`,
  `DeliveryConfig`, `SearchLog`, `CoverageInterest` · `OrderType`, `OrderStatus`,
  `DeliveryType`.
- **Payments:** `Payment`, `Payout`, `DiscountCode`, `ProcessedWebhookEvent` ·
  `PaymentType`, `PaymentStatus`, `PayoutStatus`, `DiscountType`.
- **Engagement:** `Review`, `Dispute`, `DisputeEvidence`, `LoyaltyPoint`,
  `Referral`, `Notification`, `NotificationPreference`, `InboxNotification`,
  `PushSubscription` · `DisputeStatus`, `IssueType`, `Severity`, `ResolutionType`,
  `LoyaltyTxType`, `ReferralStatus`, `NotificationChannel`, `NotificationStatus`,
  `InboxNotificationType`, `EvidenceType`.
- **Events:** `EventEnquiry`, `EventQuote` · `EnquiryStatus`, `QuoteStatus`.

---

## 6. What is yet to be implemented - product code (🟡 unless noted)

These are real code gaps confirmed in source today.

1. **Live-tracking map (customer).** `src/components/orders/status-timeline.tsx`
   ships status pills only; there is no map / moving-marker. `DeliveryConfig`
   carries coordinates but no Mapbox/Google front-end consumes them. _Needs a
   driver coordinate stream first._
2. **Real rating breakdown.** The 1–5 star bars on vendor profiles are **faked** by
   a deterministic estimator (`estimateBreakdown` in
   `apps/web/src/components/vendor/rating-breakdown.tsx`); the API only returns the
   aggregate average + count. Carries explicit "coming soon" copy.
3. **Loyalty & referral earn-hooks.** `LoyaltyPoint` / `Referral` models and
   ledger logic exist, but no order-lifecycle hook _earns_ points and referral
   codes aren't attributed at registration → first-order credit. Customer
   "Feast Pass" / "Referral Card" are UI stubs.
4. **Menu & photo drag-reorder.** Vendor menu drag-to-reorder is not wired
   (`apps/vendor/src/app/menu/menu-list-client.tsx`); `MenuItem.photos` is a flat
   `String[]` with no sort index / `MenuItemImage` join model.
5. **Review photo uploads.** UI accepts photos
   (`apps/web/src/app/orders/[id]/review/page.tsx` - "Photo uploads aren't saved
   yet"); schema has no relation/storage for them.
6. **Menu thumbnails in vendor list.** `menu-list-client.tsx:349` - payload
   doesn't expose thumbnails; placeholder shown.
7. **CSV exports.** "Export current filter as CSV (coming soon)" across admin
   (Users, Orders, Events, Reviews) and vendor (Payouts, Analytics). _Note: the
   Orders export API endpoint exists; the button is just unwired._
8. **Bulk actions.** Admin order/user table select-all + per-row checkboxes are
   `disabled` and labelled "coming soon" (`orders-client.tsx:338,660`).
9. **Advanced filters.** "More filters (coming soon)" placeholders in admin
   events and reviews-queue.
10. **Payout fees/adjustments columns** are hardcoded £0 placeholders
    (`apps/api/src/modules/payouts/payouts.service.ts`).
11. **Payout pagination** - numbered page chips designed but not built
    (`apps/vendor/src/app/payouts/payouts-client.tsx:349`).
12. **Vendor analytics** - stat cards partly scaffolded with hardcoded trend
    directions; "Business Insights" is placeholder copy.
13. **Homepage "Community Favourites"** uses placeholder ordering; TODO to switch
    to `createdAt` sort once supported (`apps/web/src/app/page.tsx`).
14. **`webhooks` module** is an empty `@Module({})` - scaffolded for future
    providers, no controllers/providers.
15. **`EventQuote` model** is under-used - the UI takes a more direct quote-submit
    path that updates `EventEnquiry` status rather than fully exercising the model.
16. **`NotificationPreference`** model exists but "SMS only / unsubscribe" logic is
    not wired into the notification processor.
17. **Stripe chargebacks** - `charge.dispute.*` webhooks are not handled; must be
    managed in the Stripe Dashboard. _(🟠 - money-adjacent.)_
18. **Global throttler filter** - no `ThrottlerExceptionFilter` in `main.ts`, so
    429s aren't shaped consistently.
19. **Seed-implied fields faked** - `fsaRating`, `halal`, `vegan` are encoded into
    `MenuItem.tags` rather than first-class columns (per `prisma/seed.ts` header).

### Notification providers (run as stubs without credentials)

Email (Resend), SMS (Twilio), push (web-push), and WhatsApp (Meta/Twilio)
providers all run in a **stub mode** that logs `[stub-*]` and reports
`delivered:false` when credentials are absent
(`apps/api/src/modules/notifications/providers/*`). The queue/template plumbing
is complete - these become live on credential + secret provisioning, no API
change. Missing secrets today: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

---

## 7. What is yet to be implemented - operations & launch (mostly 🔴)

These are credentials/hosting/monitoring, not features.

- 🔴 **Live Stripe credentials + webhook registration.** Currently on test keys;
  `STRIPE_WEBHOOK_SECRET` is a hard-required boot var, set to a _temporary
  placeholder_ in prod. Going live needs live `STRIPE_SECRET_KEY`, Connect enabled
  on the live platform, the live webhook endpoint registered, and
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set.
- 🔴 **Production Supabase** (UK/EU region, PITR backups) confirmed distinct from
  dev - the project currently shares one Supabase ref across dev/prod.
- 🔴 **Production Redis (BullMQ)** provisioned and wired into the deploy env; remove
  the dev `localPort 6379 → externalPort 3002` mapping that exposes Redis.
- 🔴 **Frontend hosting** - `web`/`vendor`/`admin` are not deployed (Vercel
  intended); only the API is live on Replit Autoscale. DNS for the three
  subdomains not configured.
- 🟠 **Sentry DSNs** for all four apps in production.
- 🟠 **Uptime monitors** (`/`, `/healthz`, three frontends), **BullMQ DLQ +
  queue-depth alerts**, **status page**.
- 🟠 **Stripe live webhook subscriptions** for `payment_intent.*`,
  `transfer.created`, `refund.updated`.
- 🟡 **Marketing/legal assets:** `apps/web/public/og-image.png` (1200×630) missing;
  WhatsApp support number may still be a placeholder. \_(The ICO number is now real
  - `ZC146267` in `src/lib/legal-constants.ts` - no longer the old `ZA000000`
    placeholder.)\_
- 🟡 **`/legal` index page** was missing (the top-nav "Legal" link and footer
  resolved to a 404); a `/legal` hub page now lists every legal document. _(Fixed
  16 June 2026.)_
- 🟡 **DPAs / DPIA / vendor T&Cs** - legal-team deliverables.

---

## 8. Testing & quality

- **CI required checks** (`.github/workflows/ci.yml`): `typecheck`, `lint`,
  `prisma-validate`, and `build` are now satisfiable; the **`test`** job is not -
  it needs the `TEST_DATABASE_URL` / `TEST_DIRECT_URL` repo secrets (unset) and
  enforces **≥70% coverage**.
- **Spec coverage today:** `vendors.service`, `catalogue` guard + `menu-items`,
  `orders` (slots + service), `payments`, `payouts`, `admin.controller`, auth
  guards. **No specs** for `disputes`, `compliance`, `reviews`, `event-enquiries`,
  `notifications`, `push`, `addresses`, `users`, `inbox`, `mfa`, `coverage`,
  `vendor-members`, `discount-codes`, `loyalty` → well under the 70% gate.
- **Test backstops in controllers** (`if (!req.user) throw …`) are belt-and-braces
  behind `SupabaseAuthGuard` - harmless, not gaps.

---

## 9. Editorial assessment & suggested sequencing

Feastpot reads as a genuinely production-shaped codebase, not a prototype: the
money path is idempotent and capture-on-delivery, the order state machine is
atomic, admin tooling and compliance lifecycles exist, and the conventions
(integer-pence money, cross-pod-safe crons, deterministic Stripe idempotency
keys) are the right ones. The distance to launch is short but front-loaded with
**operational** work, not feature work.

Recommended order (engineering opinion, not committed):

1. **Unblock go-live config (🔴):** live Stripe keys + webhook, production
   Supabase + Redis, frontend hosting + DNS. Nothing ships without these.
2. **Land the test gate:** provision `TEST_DATABASE_URL`/`TEST_DIRECT_URL`, then
   backfill specs to 70% - prioritise the money-adjacent untested modules
   (`disputes`, `event-enquiries`, `notifications`).
3. **Swap notification stubs for live providers** (Resend/Twilio/WhatsApp) -
   pure credential + secret work, zero API change.
4. **Close the high-value 🟡 product gaps:** loyalty earn-hooks → Feast Pass,
   real rating breakdown, CSV exports (Orders endpoint already exists), menu/photo
   reorder.
5. **Defer:** live-tracking map (needs a driver coordinate stream first), PWA
   offline service worker (`@ducanh2912/next-pwa` when offline behaviour is
   actually needed - never `next-pwa`, which breaks on Next 15), chargeback
   webhook automation.

---

_Traceability: file references throughout point to the audited source. This audit
reconciles with - and refreshes - `docs/GO_LIVE_GAPS.md`, `docs/OUTSTANDING.md`,
`STATUS.md`, and `IMPLEMENTATION_NOTES.md`._
