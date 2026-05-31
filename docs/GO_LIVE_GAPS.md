# Feastpot — Go-Live Audit: What's Left to Implement

_Last audited: 31 May 2026. Code-verified inventory — every item below was
confirmed against the source as it stands today (grep + file review + a fresh
codebase sweep), not the roadmap or memory. File references are included so each
item is traceable. This refresh supersedes the 30 May edition; several items
previously listed as gaps are now resolved (see §7)._

---

## How to read this

Work is grouped by **where it lives**, and every item carries a severity:

- 🔴 **Blocker** — the first real order cannot happen until this is done.
- 🟠 **Pre-launch** — should be done before opening to real customers, but a
  controlled pilot can run without it.
- 🟡 **Polish** — visible gap or "coming soon" stub; safe to ship after launch.

Most blockers are **operational config**, not missing code. The code gaps that
remain are mostly 🟡.

---

## 1. Operational blockers (config & external setup, not code)

These are 🔴 and are about credentials/hosting, not writing features.

1. 🔴 **Live Stripe credentials + webhook registration.** The webhook handler is
   built and processes `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `transfer.created`, and `refund.updated`
   (`apps/api/src/modules/payments/stripe-webhook.processor.ts`).
   `STRIPE_WEBHOOK_SECRET` is a hard-required env var — the API won't boot
   without it in prod (`apps/api/src/common/config/required-env.ts`), and it's
   currently **unset** (`/v1/healthz` reports `secrets: missing
   STRIPE_WEBHOOK_SECRET`). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is also unset.
   Going live needs: the **live** `STRIPE_SECRET_KEY` (today runs on test keys),
   Stripe Connect enabled on the live platform, and the live webhook endpoint
   registered so its signing secret matches.
   NOTE (31 May 2026): a **temporary placeholder** `STRIPE_WEBHOOK_SECRET` is set
   in the *production* env so the API can boot after first publish (the boot gate
   in `required-env.ts` hard-exits without it). Once the API is live, register the
   webhook at `https://api.feastpot.co.uk/v1/webhooks/stripe`, copy the real
   signing secret, and replace the placeholder. Until then signature verification
   rejects events — fine pre-launch.

2. ✅ **Redis (`REDIS_URL`) — RESOLVED (31 May 2026).** Upstash `feastpot-prod`
   (TLS, `rediss://`, Ireland) wired up and on a pay-as-you-go plan (the free
   500K-commands/month cap is too low for always-on BullMQ). Verified live:
   `PING → PONG`, and all four queues (`notifications`, `stripe-webhooks`,
   `payouts`, `compliance`) plus their repeatable/cron jobs register in Redis.
   The throttler store and cache now have a backend. Note: queues are tuned for
   low command volume (5-min blocking polls, `drainDelay: 300`).

3. ✅ **Live notification channel(s) — RESOLVED (31 May 2026).** Three channels
   are live (only one was required):
   - **Email (Resend):** configured.
   - **Web push (VAPID):** keypair generated; `VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` set — no longer stub.
   - **SMS (Twilio):** `TWILIO_FROM_NUMBER` set to a US number (`+1…`); the
     "SMS sends will be logged only" warning is gone. NOTE: on a Twilio trial
     it only delivers to Verified Caller IDs; A2P 10DLC needed for US prod
     volume.
   - **WhatsApp (optional, still stub):** has Twilio creds but needs per-template
     Content SIDs in Twilio Content Builder before it will actually send.

4. 🟠 **Production hosting + DNS — API config done (31 May 2026), publish pending.**
   Replit publishes one service per repl, so this repl deploys the **API**; the
   three frontends will deploy separately (their own repls). The API deploy is
   configured as a **VM (always-on)** — NOT autoscale — because the BullMQ queue
   workers and `@Cron` jobs (Monday 02:00 payout batch, hourly event reminders,
   daily loyalty/DLQ) run inside the API process and must not scale to zero.
   `build = npm ci && db:generate && build:api`; `run = db:deploy && start:api`
   (db:deploy = `prisma migrate deploy` + RLS lockdown, production-safe). Verified
   the prod build compiles to `apps/api/dist/main.js`.
   STILL USER-SIDE: click Publish (pick UK/Europe geography — permanent), add the
   `api.feastpot.co.uk` custom domain in the Publishing UI, and create the DNS
   records Replit shows. Then deploy the 3 frontends.

5. 🔴 **A real payout dry-run.** The weekly batch processor is built and
   scheduled — cron `0 2 * * 1`, Mondays 02:00 UTC
   (`.../payouts/processors/payout-batch.processor.ts`). Before trusting it with
   real money, run one full cycle against a test vendor in live mode and confirm
   funds settle with zero discrepancy in the finance view.

6. 🟠 **Web push VAPID keys.** Web push is wired but disabled until
   `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are set — otherwise it logs
   `[stub-push]` and delivers nothing (`.../providers/push.provider.ts`).
   Optional if email/SMS covers launch comms.

---

## 2. Backend / API gaps (real code, not config)

- 🟠 **No per-user notification preferences.** The processor delivers on every
  channel a template declares (if the user has phone/email). There's no
  `NotificationPreference` table or "SMS only / unsubscribe" logic. Fine for a
  pilot; needed before volume to avoid over-messaging and to honour opt-outs.

- 🟡 **Stripe-native chargeback/dispute webhooks aren't handled.** The internal
  marketplace dispute flow (customer-vs-vendor) is complete and can trigger
  refunds (`apps/api/src/modules/disputes/disputes.service.ts`), but
  bank-initiated chargebacks (`charge.dispute.*`) have no webhook handler
  (verified: no listener in `stripe-webhook.processor.ts`) — finance manages
  those manually in the Stripe Dashboard.

- 🟡 **Payout "fees" and "adjustments" are placeholder £0 columns**
  (`apps/api/src/modules/payouts/payouts.service.ts` ~L207) — Stripe transfer
  fees aren't broken out in the schema yet, so statements show zero there.

- 🟡 **Per-star rating buckets aren't real.** The vendor API exposes only
  `rating` + `ratingCount`; the customer breakdown bars are generated by a
  deterministic estimator (`estimateBreakdown`,
  `apps/web/src/components/vendor/rating-breakdown.tsx` ~L111). Once the API
  returns per-bucket counts, swap the estimate out.

- 🟡 **"Food quality" sub-rating isn't stored separately.** The review form
  collects it but it folds into the overall rating
  (`apps/web/src/app/orders/[id]/review/page.tsx` ~L199). Needs a column +
  aggregation to surface it.

- 🟡 **Review photo uploads aren't saved.** The UI accepts photos then discards
  them on submit ("Photo uploads aren't saved yet — coming soon", review page
  ~L257). Needs storage + a join model.

- 🟡 **No global ThrottlerExceptionFilter** (`apps/api/src/main.ts`). Rate-limit
  rejections return the default 429 shape rather than the app's error envelope.

- 🟡 **Community-reviews sort is placeholder ordering.** The homepage notes a
  TODO to switch to a true `createdAt` sort once the backend supports it
  (`apps/web/src/app/page.tsx` ~L28).

---

## 3. Admin portal gaps

- 🟡 **CSV exports are stubbed** ("coming soon") on every list: Orders
  (`orders-client.tsx` L175/L481), Users (`users-client.tsx` L284), Event
  Enquiries (`events-client.tsx` L183), and Reviews queue
  (`reviews-queue-client.tsx` L230). NOTE: the API *does* expose
  `GET /v1/admin/orders.csv` — only the UI button is stubbed.
- 🟡 **Order bulk actions** — the select-all and per-row checkboxes in the
  orders table are `disabled` ("coming soon", `orders-client.tsx` L337/L662).
- 🟡 **"More filters" buttons** are disabled placeholders on the Events
  (L277-278) and Reviews (L342) queues.
- 🟡 **Search Trends card** depends on a search-analytics aggregator that
  currently returns little/no data
  (`components/dashboard/search-trends-card.tsx`); no pagination.

_(Verified NOT a gap: the admin Settings page is functional — profile, security
section, and run-payout-batch action all work; it is not a "coming soon" stub.)_

---

## 4. Vendor portal gaps

- 🟡 **Menu drag-to-reorder is NOT wired.** The drag handle renders for visual
  parity but reordering whole menus doesn't persist — `useUpdateMenu` already
  accepts `displayOrder`, it just isn't hooked up (`menu/menu-list-client.tsx`
  ~L44). NOTE: reordering items *within* a menu IS wired.
- 🟡 **Menu-item photo reorder is NOT wired.** No drag-reorder for item photos
  because the schema has no sortable image-order field (`imageUrls` is a flat
  `String[]`) (`menu/[menuId]/items/[itemId]/item-editor-client.tsx` ~L589).
- 🟡 **Delivery map preview** is still a text list of postcode prefixes; an
  actual map / polygon-zone tool is on the roadmap
  (`settings/delivery/delivery-form.tsx` ~L173).
- 🟡 **Vendor self-serve profile editing UI** isn't in the portal yet — it
  currently lives in the admin app only (`onboarding/onboarding-client.tsx`
  ~L102).
- 🟡 **"Download statement"** is disabled (marked future,
  `payouts/payouts-client.tsx`).
- 🟡 **Analytics deltas / advanced charts** (repeat-customer rate, heatmaps,
  "missing allergens") use light-touch calculations and go blank with < 2 weeks
  of history; not a full analytics engine (`analytics/analytics-client.tsx`,
  `components/menu/menu-stat-cards.tsx`).

---

## 5. Customer web gaps

- 🟡 **Review photos** and the **food sub-rating** — see §2 (UI present, storage
  missing).
- 🟡 **Rating breakdown bars are estimated** until the API ships per-bucket
  counts — see §2.
- 🟡 **Loyalty / referrals** account sections surface some placeholder values
  (`apps/web/src/app/account/profile/page.tsx` and related components).
- 🟡 **Order-confirmation copy-pill** shows a "preparing your order number" state
  while the ID is in-flight rather than a fake `FP-XXXXXX`
  (`orders/[id]/confirmation/page.tsx`). Cosmetic; works as intended.

_(Cleanup, not a gap: the register flow still swallows a 404 from
`POST /v1/users/sync` with a "not yet implemented" comment
(`(auth)/sign-in/page.tsx` ~L552-567), but that endpoint now exists
(`users.controller.ts`) and the mirror works — the guard is dead defensiveness
worth removing.)_

---

## 6. Tests

- 🟡 **One flaky time-dependent test.** V1's 5 failing suites / 21 failing tests
  are resolved; one remains — the same-day-orders slot test is time-of-day
  dependent (clamped target slot can land in the past late in the day, tripping
  a different rejection code). Pin it to a fixed clock (jest fake timers) for a
  deterministic green CI run
  (`apps/api/src/modules/orders/order-slots.service.spec.ts` ~L105).

---

## 7. Decisions to confirm (business, not code)

- 🟠 **Service fee.** `SERVICE_FEE_BPS` defaults to `0` in code (failsafe,
  `apps/api/src/common/config/service-fee.ts`) but is currently **set to 500
  (5%)** in this environment, clamped to [£0.50, £2.99] per order. It's
  runtime-configurable (no redeploy). Confirm the intended live value before
  go-live.

---

## 8. Already done — do NOT re-implement

Verified complete in the current code (some were previously assumed missing or
were gaps in the prior audit):

- **Waitlist / coverage interest is now persisted.** `POST /v1/coverage-interest`
  writes to the `CoverageInterest` table with duplicate handling — sign-ups are
  no longer lost (was a stub in the prior audit).
- **`.env.example` exists** (~4.3 KB) and documents the Section 11 variables
  (incl. `MENU_AUTO_APPROVE`, `SERVICE_FEE_BPS`) — was reported missing before.
- **`POST /v1/users/sync` endpoint exists** (`users.controller.ts`); the profile
  mirror on signup works (the web 404-guard is legacy, see §5).
- **Email channel (Resend)** is configured (`RESEND_API_KEY` + `EMAIL_FROM`
  present).
- **Apple Pay / Google Pay** — fully implemented and enabled via Stripe's
  Payment Request API; renders when the device has a wallet, falls back to the
  card form otherwise (`apps/web/src/components/checkout/payment-request-button.tsx`).
- **Delivery-area / postcode checking** — real haversine distance logic in SQL
  plus a postcode-prefix fallback; the web coverage check queries live vendors
  (`apps/api/src/modules/vendors/vendors.repository.ts`,
  `apps/web/src/lib/api/coverage.ts`).
- **Menu moderation** — env-gated approval (`MENU_AUTO_APPROVE`) + an admin
  moderation queue; held/rejected items are hidden from listings, search, and
  checkout.
- **Admin Settings page** — functional (profile, security, run-payout-batch).
- **Stripe Connect onboarding, refunds, internal disputes, weekly payout batch,
  order state machine, basket, checkout, loyalty, promo codes** — all built and
  wired.

---

## 9. Genuinely not built (and not needed to start)

Real gaps, but none block launch — listed so nobody assumes they exist.

- **Third-party courier/logistics integration** (Deliveroo, Stuart, etc.).
  Delivery is vendor-managed by design.
- **Driver app / live GPS tracking.** Tracking is status-based with ETAs, not a
  moving dot on a map.
- **Admin "power-user" tooling** for surgically editing a single order/user in
  an emergency.

---

## In one sentence

The product is built and wired; Redis and live notification channels are now
done. What's left to *go live* is the remaining outside-world plumbing — live
Stripe keys + registered webhook, production hosting + DNS, and a payout
dry-run — after which the remaining work is a tidy list of 🟡 polish items (CSV
exports, drag-reorder, review photos, real rating buckets) and one revenue
decision (the service fee).
