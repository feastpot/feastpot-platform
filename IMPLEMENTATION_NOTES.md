# Feastpot — Implementation Notes

A running editorial record of what has been built into the Feastpot monorepo,
written for engineers, ops and operators joining the project mid-flight.
Newest work appears at the top of each section. The companion document
`LAUNCH_CHECKLIST.md` tracks the go-live gate; this document tracks
**what exists in the repo today**.

_Last updated: May 2026._

---

## 0. TL;DR for someone joining today

- **Stack**: Node 22, npm workspaces + Turborepo, NestJS 11 API, Next 15
  customer/vendor/admin apps, Prisma 5 against Supabase Postgres, Stripe
  Connect for payments + payouts, BullMQ (Redis) for background jobs.
- **Apps live in `apps/`**: `api` (3001), `web` (3000), `vendor` (3002),
  `admin` (3003). Shared code in `packages/{types,ui,config}`.
- **Database**: 4 migrations applied — `init`, `payments_payouts`,
  `disputes_compliance_reviews_notifications`, `event_enquiries_extended`.
  See `prisma/schema.prisma` for the canonical model.
- **Production**: deployed as Replit Autoscale at
  `https://feastpot-platform.replit.app` (API only; frontends are intended
  for Vercel — not yet wired). Frontends still launchable locally.
- **Status**: backend feature-complete for the v1 marketplace + event
  catering flow. Frontends are usable end-to-end but several launch-blocker
  items in `LAUNCH_CHECKLIST.md` remain (DPAs, ICO number, OG image,
  Vercel deploy targets, Sentry DSNs, uptime monitors).

---

## 1. Most recent work

### 1.1 Deployment port fix (May 2026)

The first publish attempt after the event-enquiry work failed at the
**promote** step with:

> `a port configuration was specified but the required port was never
> opened, expected port 3002`

Replit Autoscale probes the local port mapped to `externalPort = 80`. In
`.replit` that mapping was `localPort = 3002` (the vendor dev server),
but in production we only run the API — which defaults to `3001`. The
probe waited for something on 3002, timed out, and the deploy was
rolled back.

Fix (no `.replit` edit, applied via `deployConfig`):

```
run = ["bash", "-c",
  "PORT=3002 npm run db:deploy && PORT=3002 npm run start:api"]
```

The API reads `process.env.PORT` and now binds to 3002 in production,
matching the platform’s expectation. The build phase was always green —
this was purely a runtime/health-check failure.

### 1.2 Event catering enquiry & quote flow (T001–T006)

A separate journey from the on-demand basket flow, for orders ≥ 25 guests
booked ≥ 7 days ahead.

**Schema** (`event_enquiries_extended` migration):
- `EventEnquiry` — customer-side request (cuisine, guest count, date,
  postcode, notes, status).
- `EventQuote` — vendor-side response per enquiry (price, deposit
  amount, menu, status, idempotency key on `(enquiryId, vendorId)`).
- New enums `EnquiryStatus`, `QuoteStatus`.
- Stripe `PaymentIntent` is created for the deposit only; the balance
  is collected later (cron) once final numbers are confirmed.

**API** — `apps/api/src/modules/event-enquiries/`:
- `POST   /v1/event-enquiries` — create enquiry, fan out to matching
  vendors (notification side-effect via `NotificationsModule`).
- `GET    /v1/event-enquiries` — customer or vendor scoped (vendors only
  see their own quotes; the customer’s contact details are stripped from
  the vendor-facing response).
- `GET    /v1/event-enquiries/:id` — full detail.
- `POST   /v1/event-enquiries/:id/quotes` — vendor submits/updates a
  quote (idempotent on `(enquiryId, vendorId)`).
- `POST   /v1/event-enquiries/:id/select-vendor` — customer picks a
  quote → creates a Stripe deposit `PaymentIntent`. Cross-vendor
  rejections cancel the orphan PIs.
- `POST   /v1/event-enquiries/:id/confirm-deposit` — verifies the PI
  status with Stripe before transitioning the enquiry to `CONFIRMED`
  (avoids the “confirmed-before-paid” race).
- `PATCH  /v1/event-enquiries/:id/confirm-numbers` — final guest count
  for balance calculation.

**Cron** — `event-cron.service.ts`:
- `event-reminder-72h` (hourly) — nudges the customer to confirm final
  numbers 72 h before the event.
- `event-balance-48h` (hourly) — captures the balance `PaymentIntent`
  48 h before the event, with idempotency keys and conditional
  `updateMany` to avoid double-capture across pods.

**Frontend**:
- `apps/web/src/app/events/page.tsx`, `events/new/page.tsx`,
  `events/[id]/page.tsx` — customer enquiry list, create form, detail
  page with quote comparison + select.
- `apps/vendor/src/app/events/page.tsx` + `[id]` — vendor inbox,
  quote-submit form, status tracking.

**Architect review**: closed all 5 critical issues (vendor quote leak,
confirmed-before-paid, idempotency keys, race in `updateMany`, lost-race
orphan PI cancel + cross-vendor reject, unified `event_balance`
metadata).

---

## 2. Customer PWA (`apps/web`) — SEO, Legal & Cookie Consent

Public/marketing surface for UK launch. Auth, basket, vendor browse and
checkout shipped in earlier phases (see §6).

### 2.1 Sitemap & robots
- `next-sitemap` runs as a `postbuild` step.
- `apps/web/next-sitemap.config.js` excludes the authenticated surface
  (`/account/*`, `/checkout`, `/orders/*`, `/auth/*`, `/(auth)/*`,
  `/offline`).
- `additionalPaths()` enriches the sitemap with **live vendor URLs** by
  hitting `GET /v1/vendors?status=live&limit=1000` at build time, with a
  15 s `AbortSignal.timeout` fallback to the static route list.

### 2.2 Global metadata (`apps/web/src/app/layout.tsx`)
- `metadataBase` ← `NEXT_PUBLIC_SITE_URL` (default `https://feastpot.co.uk`).
- Title template `%s | Feastpot`; default
  *Feastpot — African & Caribbean Food Delivered*.
- OG `type=website`, `siteName=Feastpot`, `locale=en_GB`,
  `og-image.png` (1200×630 — file not yet present in `public/`).
- Twitter `summary_large_image`, handle `@feastpot`.
- `robots: { index: true, follow: true }`.
- PWA manifest, app icons, themeColor and viewport preserved.

### 2.3 Cookie banner
- `apps/web/src/components/cookie-banner.tsx` mounted in the root layout.
- Persists acceptance under `feastpot.cookie-consent.v1` — bump the key
  if the cookie set ever changes materially.
- SSR-safe (renders `null` until `useEffect` reads `localStorage`).
- Single **Accept** button; Feastpot only sets strictly-necessary
  cookies (auth session, CSRF, basket), which under PECR don’t require
  prior opt-in.

### 2.4 Cuisine SEO landing pages
Three diaspora-cuisine pages sharing
`apps/web/src/components/seo/cuisine-landing.tsx`:

- `/nigerian-food-delivery-london`
- `/ghanaian-food-delivery-london`
- `/caribbean-food-delivery-london` (passes
  `['Caribbean','Jamaican','Trinidadian']`).

Each page contributes per-page `metadata`, an H1 and lead, six dish
highlights, a live vendor list (`searchVendors({ cuisine,
sortBy:'rating', limit: 12 })`, `revalidate: 3600`), a “How Feastpot
works” explainer, three pre-written London reviews, a 4-question FAQ
and a brand CTA. Falls back gracefully if the API call fails.

### 2.5 Legal pages

- **`/legal/terms`** — platform-operator framing, vendor obligations
  (Food Safety Act 1990, FIR 2014, Natasha’s Law, FHRS), customer
  rights & **24 h dispute / 5 business-day refund** SLA, **12 %
  platform commission**, **weekly Monday payouts** via Stripe Connect,
  prohibited content/conduct, 12-month liability cap, governing law:
  England & Wales.
- **`/legal/privacy`** — UK GDPR. Data controller: Feastpot Ltd, ICO
  registration `ZA000000` (placeholder). Data categories, lawful bases,
  sharing, IDTA/SCCs, retention (orders/tax 6 y, audit 6 y, account
  until deletion or 24 m inactivity, marketing consent + 12 m), full
  subject rights, ICO complaint link, essential-only cookies.
  Contact: `privacy@feastpot.co.uk`.
- **`/legal/allergens`** — all 14 FSA allergens as an emoji-labelled
  responsive grid, vendor-provided disclaimer, in-app filter
  walk-through, 999 escalation guidance, FSA outbound link.

### 2.6 Help centre
- `apps/web/src/app/help/page.tsx` — single FAQ page. Five sections
  (Ordering, Delivery, Refunds, Allergens, Vendor accounts) rendered
  as `dl/dt/dd` for accessibility. Contact card:
  `support@feastpot.co.uk` and placeholder WhatsApp `+44 7000 000000`.

### 2.7 Known launch blockers (flagged, not fixed)
- ICO registration number on the privacy page is `ZA000000`.
- WhatsApp support number on the help page is `+44 7000 000000`.
- `apps/web/public/og-image.png` (1200×630) is referenced in metadata
  but the file isn’t in the repo yet.

---

## 3. Backend modules — what already exists

All routes are mounted under `/v1` (NestJS URI versioning). Auth is
Supabase JWT verified by `SupabaseAuthGuard`; per-route role narrowing
via `@Roles(...)` and `RolesGuard`. `StripeModule` and
`NotificationsModule` are `@Global()`.

| Module | Surface | Notes |
| --- | --- | --- |
| `users` | `GET/PATCH/DELETE /me`, `PATCH /:userId/status` | Self-serve + admin status changes. |
| `addresses` | CRUD `/addresses` | Customer delivery addresses. |
| `vendors` | List/create, `me`, `me/stats`, `me/analytics`, `me/delivery-config` (GET/PUT), `me/stripe-connect-link`, `:id` GET/PATCH, `:id/status`, `:id/reviews` | Stripe Connect onboarding link generation included. |
| `catalogue` | Menus + items CRUD, image upload, availability toggle | Vendor-scoped via `VendorOwnershipGuard` (unit tested). |
| `orders` | List/create, detail, `confirm`, `status`, `reorder`, `amendment` GET/PATCH | Includes `OrderSlotsService` for delivery-slot capacity. |
| `payments` | List, `refunds`, `stripe-webhook` (raw-body) | Webhook is processed via BullMQ for retries (`stripe-webhook.processor.ts`). Idempotent via `ProcessedWebhookEvent`. |
| `payouts` | List/get, `:id/approve`, `:id/hold` | Weekly Monday batch via processor in `payouts/processors`. |
| `disputes` | List/create, detail, vendor-response, escalate, close, evidence GET/POST | Evidence stored with type tags. |
| `compliance` | List, create, `:documentId/verify` | Vendor document lifecycle (FHRS, insurance, allergen training). Has its own queue processor. |
| `reviews` | Create, `moderation-queue`, `:id/moderation` | Moderation status enum gates publication. |
| `notifications` | n/a (no routes) | Email (Resend), SMS (Twilio), push (web-push). Templates under `templates/`. Provider abstraction in `providers/`. |
| `push` | `subscribe`, `unsubscribe` | Stores `PushSubscription` rows. |
| `event-enquiries` | See §1.2 | New in this milestone. |
| `admin` | `dashboard`, `vendors`, `audit-log`, `audit-log.csv`, `compliance/expiring`, `payouts/:id/reconcile-stripe` | Role-gated to `admin | support | finance | compliance` with per-route narrowing. |
| `webhooks` | n/a (Stripe handled inside `payments`) | Module exists for future provider webhooks. |

Tests present today: `vendors.service`, `catalogue/guards/vendor-ownership`,
`catalogue/menu-items.service`, `orders/order-slots`, `orders.service`,
`payments.service`, `payouts.service`, `admin.controller`, plus
`auth/guards/{roles,supabase-auth}`. Coverage is **not** yet at the 70 %
gate from the launch checklist.

---

## 4. Frontend apps — what exists today

### 4.1 `apps/web` (customer PWA, port 3000)
Routes shipped: `/` (postcode hero), `/auth/*`, `/(auth)/*`, `/account`,
`/vendors`, `/checkout`, `/orders`, `/events` (+ `new`, `[id]`), `/help`,
`/legal/{terms,privacy,allergens}`, the three cuisine SEO pages,
`/offline`, `/api/*` route handlers, `/icon`, `/apple-icon`,
`/opengraph-image`. Uses `@feastpot/ui` (shared shadcn) — does NOT
re-init shadcn locally.

### 4.2 `apps/vendor` (vendor portal, port 3002)
Routes: `sign-in`, `unauthorized`, dashboard (`/`), `onboarding`,
`menu`, `orders`, `events` (+ `[id]`), `payouts`, `analytics`,
`settings`. Stripe Connect link button surfaces via the API
`me/stripe-connect-link` endpoint.

### 4.3 `apps/admin` (admin panel, port 3003)
Routes: `sign-in`, `unauthorized`, dashboard with
`dashboard-client.tsx`, `vendors` (list + detail + document review),
`disputes` (list + 3-column detail), `payouts` (batch approve, per-row
hold, Stripe reconcile), `compliance` (expiry table), `audit-log`
(with CSV download), `settings`.

---

## 5. Infrastructure & shared packages

- **`packages/types`** — Prisma client re-export + Zod request/response
  schemas shared by API and frontends.
- **`packages/ui`** — shared shadcn components and `theme.css` (HSL
  vars). Brand tokens: `bg-brand` (#E8520A), `bg-teal` (#1D9E75),
  `bg-vendor` (#185FA5). No `Label`, `Textarea`, `useToast`, or
  `asChild` exported — feature pages have local fallbacks.
- **`packages/config`** — shared `tsconfig` and `eslint` configs.

### 5.1 `.replit` ports (current)
- `localPort 3000 → externalPort 3000` (web)
- `localPort 3001 → externalPort 3001` (API dev)
- `localPort 3002 → externalPort 80` (vendor dev — also the port
  Autoscale probes in production; the API is started with `PORT=3002`
  in prod to satisfy this)
- `localPort 3003 → externalPort 3003` (admin)
- `localPort 6379 → externalPort 3002` (Redis dev — should not be
  publicly exposed; cleanup tracked in §7)

### 5.2 Production deployment
- Target: `autoscale`, target = `@feastpot/api` only.
- `build = ["bash","-c","npm ci && npm run db:generate && npm run build:api"]`
- `run   = ["bash","-c","PORT=3002 npm run db:deploy && PORT=3002 npm run start:api"]`
- API exposes both `GET /` (Autoscale probe, version-neutral) and
  `GET /healthz` for external uptime monitors.

### 5.3 CI / CD
- `.github/workflows/ci.yml` — lint + typecheck + test + build per PR.
- `.github/workflows/deploy.yml` and `neon-branch.yml` present.
- Dependabot configured.

---

## 6. Earlier milestones (summary)

These were delivered before the recent event-enquiry / SEO / legal work
and remain in place; full detail lives in their PRs and module READMEs.

- **Auth** — Supabase email + OAuth, role provisioning via DB hook
  (`docs/supabase-auth-hook.md`).
- **Customer journey v1** — postcode search, vendor browse, basket
  (zustand + persist, cross-vendor add throws `CrossVendorBasketError`),
  Stripe Checkout, order confirmation, reorder.
- **Vendor portal v1** — onboarding wizard, menu CRUD, order kanban,
  payout history, analytics.
- **Admin panel v1** — backend `AdminModule`, vendor approval queue,
  dispute triage, payout reconcile, compliance expiry, audit-log CSV.
- **Production hardening** — Sentry instrumentation
  (`apps/api/src/instrument.ts`), `trustProxy` for the Replit edge,
  `SentryGlobalFilter`, `build:api`/`start:api` scripts.

---

## 7. What is **not** yet built

Anything below is either missing entirely or only stubbed. Items also
appear in `LAUNCH_CHECKLIST.md` where they’re launch-blocking.

### 7.1 Platform / ops
- **Frontend hosting**. `apps/web`, `apps/vendor`, `apps/admin` are not
  yet deployed to Vercel; only the API is live on Autoscale. DNS for
  `feastpot.co.uk`, `vendor.feastpot.co.uk`, `admin.feastpot.co.uk` is
  not configured.
- **Redis (BullMQ) production target**. The dev container exposes Redis
  on `localPort 6379`, mapped externally to `3002` (this should be
  removed). Production Redis URL is not provisioned and not wired into
  Autoscale env.
- **Sentry DSNs** in production for all four apps.
- **Uptime monitors** for `/`, `/healthz` and the three frontends.
- **Status page** at `status.feastpot.co.uk`.
- **BullMQ DLQ + queue-depth alerts**.
- **Stripe webhook subscriptions** in the live dashboard (`payment_intent.*`,
  `transfer.created`, `refund.updated`) and `STRIPE_WEBHOOK_SECRET` in
  production env.
- **Production Supabase project** in UK/EU region with PITR enabled
  (current deployment runs against `aws-1-eu-north-1.pooler.supabase.com`
  — confirm this is the production project and not the dev one before
  go-live).

### 7.2 Code / product
- **`apps/web/public/og-image.png`** (1200×630) — referenced in metadata
  but missing.
- **ICO registration number** on `/legal/privacy` — placeholder
  `ZA000000`.
- **WhatsApp support number** on `/help` — placeholder
  `+44 7000 000000`.
- **PWA service worker**. The static manifest is in place but
  Workbox/`@ducanh2912/next-pwa` integration is deferred until offline
  behaviour is actually needed (see `replit.md`). `next-pwa` proper is
  unmaintained and breaks on Next 15 — do **not** install it.
- **Test coverage gate (≥ 70 %)** is not yet enforced in CI; many
  modules ship without spec files (`disputes`, `compliance`, `reviews`,
  `event-enquiries`, `notifications`, `push`, `addresses`, `users`,
  `webhooks`).
- **Vendor onboarding QA** — flagged in `LAUNCH_CHECKLIST.md §3` as
  needing manual end-to-end QA.
- **Email templates** (`notifications/templates/`) exist but the Resend
  account/API key for production is not yet provisioned.
- **Loyalty + referral models** exist in the schema (`LoyaltyPoint`,
  `Referral`) but have no API surface or UI yet.

### 7.3 Legal / compliance
- DPAs with Stripe, Supabase, Twilio, Resend, Cloudflare R2 — to be
  signed by the legal team.
- DPIA (Data Protection Impact Assessment).
- Vendor T&Cs as a separate document from customer T&Cs.

### 7.4 Known footguns / cleanups
- The `localPort 6379 → externalPort 3002` mapping in `.replit` exposes
  Redis publicly in dev. It should be removed once the canvas/dev URLs
  no longer depend on it.
- `apps/web` and `apps/vendor` use the same theme tokens but don’t share
  a global layout; if a vendor-only token is added later, put it in
  `packages/ui/theme.css`, not in app-local `globals.css`.

---

## 8. Conventions worth knowing

- **Brand tokens** live in `packages/ui/theme.css` (HSL vars, mirrored
  by each app’s `globals.css`). Don’t add a fourth — extend an existing
  one.
- **Supabase auth** in `apps/web` middleware uses `getUser()` (NOT
  `getSession()`) so the session is always re-validated server-side.
- **TanStack Query defaults**: `staleTime 60s`, `retry 1`, devtools only
  in dev.
- **Basket** is a zustand store persisted under `feastpot.basket.v1`;
  cross-vendor adds throw `CrossVendorBasketError`.
- **Stripe webhooks** are received by `stripe-webhook.controller.ts`
  with `rawBody: true` and immediately enqueued — handlers live in
  `stripe-webhook.processor.ts` and are idempotent via
  `ProcessedWebhookEvent`.
- **Cron jobs** use `@Cron` from `@nestjs/schedule` with named
  registrations and conditional `updateMany` for cross-pod safety
  (see `event-cron.service.ts` for the canonical pattern).
- **Money** is always stored as integer pence in the DB; format only
  at the edge.
- **Test users** (from `prisma/seed.ts`):
  - Customer — `grace@example.com` / `Feastpot!Cust1`
  - Vendor — `maman@feastpot.co.uk` / `Feastpot!Vendor1`
  - Admin — `soul@feastpot.co.uk` / `Feastpot!Admin1`

---

## 9. Common scripts

```
npm run dev            # turbo dev across all workspaces
npm run build          # turbo build
npm run typecheck      # turbo typecheck
npm run lint           # turbo lint
npm run test           # turbo test
npm run ci             # lint + typecheck + test + build

npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev
npm run db:deploy      # prisma migrate deploy (used by production run cmd)
npm run db:seed        # prisma seed (test users above)
npm run db:studio      # prisma studio
npm run db:validate    # prisma validate

npm run build:api      # turbo build --filter=@feastpot/api
npm run start:api      # node apps/api/dist/main.js
```
