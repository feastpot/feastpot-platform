# FeastPot — Build Status

_Last updated: 22 May 2026_

FeastPot is a UK-focused diaspora bulk-food marketplace built as a Turborepo monorepo
(NestJS API + three Next.js 15 apps + shared packages, with Prisma on Supabase Postgres
and Stripe Connect for payments). The platform is in a **late-beta, pre-launch** state:
the core transactional path — discovery, checkout, kitchen acceptance, delivery,
capture, and payout — is complete and wired end-to-end. What remains is mostly
engagement features (loyalty, referrals, live tracking) and tightening of a handful
of half-finished branches.

---

## 1. What is implemented

### API (`apps/api`)
- **Auth & access control.** Supabase JWT validation, `@Roles` guards across every
  controller, MFA recovery-code generation and consumption.
- **Discovery.** Postcode + radius search (Haversine), cuisine filters, vendor
  profile / slug resolution.
- **Order engine.** Full state machine
  (`Pending → Accepted → Preparing → Dispatched → Delivered`) with atomic
  transitions and a "needs clarification" branch.
- **Payments & payouts.** Stripe Connect onboarding, PaymentIntent auth-on-order /
  capture-on-delivery, Stripe Transfer-driven payouts with `draft → held → approved`
  workflow.
- **Compliance.** Multi-document upload to R2/S3, internal verification flow,
  expiry cron jobs.
- **Event enquiries.** Distance-matched vendors for catering, deposit + balance
  payment splits.
- **Admin tooling.** Vendor moderation, dispute resolution, audit logging,
  dead-letter-queue monitoring.

### Customer PWA (`apps/web`)
- **Discovery.** Postcode hero, horizontal cuisine filters, SEO landing pages
  (e.g. `/nigerian-food-delivery-london`), search results.
- **Storefront.** Category-tabbed menus, vendor-locked basket (cross-vendor
  adds throw `CrossVendorBasketError`), allergen / tag display.
- **Checkout.** Stripe Elements, delivery slot picker, guest + authed flows.
- **Legal.** Full compliant suite under `/legal/*`.
- **Auth & sessions.** Supabase SSR client/server/middleware; middleware refreshes
  via `getUser()` (not `getSession()`); TanStack Query with 60 s staleTime.

### Vendor portal (`apps/vendor`)
- **Dashboard.** Real-time order intake with audible alerts, today's prep list,
  "At a Glance" stats.
- **Menu management.** Full CRUD for menus / items, availability toggles, image
  uploads.
- **Operations.** Opening hours, blackout dates, delivery radius and fee config.
- **Recent polish.** Shared `AuthProvider` (single `onAuthStateChange` listener +
  `queryClient.clear()` on identity change), real FeastPot brand logo across both
  navs (now 2× size when signed in), shadcn `--primary` swapped from vendor-blue
  to teal-green and bulk-renamed across 32 files (zero `vendor-blue` refs remain).

### Admin panel (`apps/admin`)
- **Queue monitoring.** Embedded BullBoard for job inspection.
- **Triage.** Vendor application review, document verification, dispute evidence.

### Shared packages
- `@feastpot/types` — Prisma client re-export + Zod schemas.
- `@feastpot/ui` — shadcn component library with HSL theme tokens.
- `@feastpot/config` — shared tsconfig + ESLint config.

### Infrastructure
- **Database.** 21+ Prisma models; migrations current through `mfa_recovery_codes`
  and `discount_idempotency`.
- **Stripe.** End-to-end Connect (Standard / Express); webhook handler for
  `payment_intent.succeeded` and `transfer.created`.
- **Supabase.** Auth + Postgres; mature SSR helpers across all three Next apps.
- **PWA.** `manifest.json` + theme icons present on `apps/web`; service worker
  intentionally deferred (will switch to `@ducanh2912/next-pwa` when offline
  behaviour is actually needed).
- **CI.** Lint + typecheck + Jest enforced; `main` requires 5+ passing checks.

---

## 2. What is partially implemented

| Area | Where | State |
| --- | --- | --- |
| Notifications (SMS / email) | `apps/api` notifications module | BullMQ queue + templates wired; Twilio + Resend providers are stubs awaiting prod credentials (`TWILIO_FROM_NUMBER`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` still missing). |
| Order amendments | `OrdersController.proposeAmendment` / `respondToAmendment` | Controllers throw `NotImplementedException` on some branches; `OrderAmendment` table migrated but business logic mid-refactor. |
| Loyalty / referrals | `LoyaltyService`, `ReferralService` | Ledger logic and `LoyaltyPoint` / `Referral` models exist; no order-lifecycle hooks earn points yet and referral codes are not validated at registration. |
| Live tracking (customer) | `apps/web` order detail | Static status timeline ships; map component is a placeholder shell, no real-time coordinate stream. |
| Customer account extras | `apps/web/src/app/account/*` | Profile + order history complete; "Feast Pass" and "Referral Card" are UI stubs. |
| Vendor analytics | `apps/vendor/src/app/insights` | Basic revenue charts render; "Business Insights" panel is placeholder copy. |
| Audit logging coverage | `MenuItem` and related entities | Loyalty has full audit (`adjustPoints`); menu mutations don't yet. |

---

## 3. What is referenced but not yet built

- **Referral redemption flow** end-to-end (signup attribution → first-order credit).
- **Driver / live-location** integration — schema has `DeliveryConfig` coordinates,
  but no Mapbox/Google Maps frontend integration to render a moving marker.
- **Production Stripe keys** — several `.env.example` and dev configs still hold
  test-only placeholders.
- **PWA offline mode** — package choice decided (`@ducanh2912/next-pwa`) but
  install deferred; `next-pwa` is unmaintained and breaks on Next 15.

---

## 4. Known environmental friction

- **`glob` / `inflight` deprecation noise** during `npm install` is currently
  unfixable: the `glob` maintainer is deprecating every published version as a
  protest (including the current `latest`), and `workbox-build` (pulled in by
  `@ducanh2912/next-pwa`) hard-pins `glob@7` + `inflight@1`. Overrides were tried
  and reverted — the only real fix is removing the PWA package, which is
  acceptable while the service worker is deferred but hasn't been decided.

---

## 5. Suggested next focus (engineering opinion, not committed)

1. Finish `OrderAmendment` — unblocks "needs clarification" UX already present
   in the kitchen flow.
2. Wire loyalty earn-hooks into the order lifecycle, then surface points in the
   customer account "Feast Pass" card.
3. Land real Twilio + Resend providers behind the existing BullMQ queue (zero
   API surface change, just provider swaps + secrets).
4. Decide on the PWA package — either install `@ducanh2912/next-pwa` and design
   the offline scope, or drop the dependency entirely and clear the deprecation
   noise.
5. Ship the live tracking map once the driver-app coordinate stream exists.
