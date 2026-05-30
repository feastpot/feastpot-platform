# Feastpot — Go-Live Audit: What's Left to Implement

_Last audited: 30 May 2026. This is a code-verified inventory — every item below
was confirmed against the source as it stands today (grep + file review), not the
roadmap or memory. File references are included so each item is traceable._

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

1. 🔴 **Live Stripe credentials + webhook registration.** The webhook handler
   is built and processes `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `transfer.created`, and `refund.updated`
   (`apps/api/src/modules/payments/stripe-webhook.processor.ts`).
   `STRIPE_WEBHOOK_SECRET` is a hard-required env var — the API won't boot
   without it (`apps/api/src/common/config/required-env.ts`). Going live needs:
   the **live** `STRIPE_SECRET_KEY`, Stripe Connect enabled on the live
   platform, and the live webhook endpoint registered so its signing secret
   matches. Today it runs on test keys.

2. 🔴 **At least one live notification channel.** The engine is complete — 20+
   real templates, a BullMQ queue, and providers for email, SMS, WhatsApp, and
   web push. Every provider is currently in **stub mode** (logs only) because
   credentials are missing:
   - **Email (Resend):** `RESEND_API_KEY` + verified sending domain for
     `EMAIL_FROM` — else `[stub-email]`
     (`.../notifications/providers/email.provider.ts`).
   - **SMS (Twilio):** `TWILIO_FROM_NUMBER` (account SID/auth already set) —
     else `[stub-sms]` (`.../providers/sms.provider.ts`).
   - **WhatsApp:** `TWILIO_WHATSAPP_FROM` + per-template Content SIDs, **or**
     `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (Meta) — else
     `[stub-wa]` (`.../providers/whatsapp.provider.ts`).

   Without at least one live channel, vendors get no order alert and customers
   get no confirmation — non-negotiable for a kitchen.

3. 🔴 **Production hosting + DNS.** The API needs a stable home
   (`api.feastpot.co.uk` → Replit Autoscale, DNS-only) and the three frontends
   need their domains verified. Until this lands the apps run on fallback URLs.

4. 🔴 **A real payout dry-run.** The weekly batch processor is built and
   scheduled — cron `0 2 * * 1`, Mondays 02:00 UTC
   (`.../payouts/processors/payout-batch.processor.ts`). Before trusting it with
   real money, run one full cycle against a test vendor in live mode and confirm
   funds settle with zero discrepancy in the finance view.

5. 🟠 **Web push VAPID keys.** Web push is wired but disabled until
   `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are set — otherwise it logs
   `[stub-push]` and delivers nothing (`.../providers/push.provider.ts`).
   Optional if email/SMS covers launch comms.

---

## 2. Backend / API gaps (real code, not config)

- 🟠 **`/v1/users/sync` route is missing.** On customer signup the web app tries
  to mirror the new user's profile (first/last name, phone, marketing opt-in,
  referral code) to the API, but the route doesn't exist — the call 404s and is
  silently skipped (`apps/web/src/app/(auth)/sign-in/page.tsx` ~L563-572). Means
  these fields aren't persisted server-side at registration. Needs the endpoint
  built before relying on that profile data (e.g. referral attribution).

- 🟠 **Waitlist interest is not persisted.** The `/waitlist` "register interest"
  endpoint only logs `[coverage-interest]` to the console — there's no
  `CoverageInterest` model, so sign-ups are lost
  (`apps/api/src/modules/coverage/coverage.service.ts`, persistence
  "intentionally deferred"). Needs a table + write before any marketing drives
  traffic there.

- 🟠 **No per-user notification preferences.** The processor delivers on every
  channel a template declares (if the user has phone/email). There's no
  `NotificationPreference` table or "SMS only / unsubscribe" logic. Fine for a
  pilot; needed before volume to avoid over-messaging and to honour opt-outs.

- 🟡 **Stripe-native chargeback/dispute webhooks aren't handled.** The internal
  marketplace dispute flow (customer-vs-vendor) is complete and can trigger
  refunds (`apps/api/src/modules/disputes/disputes.service.ts`), but
  bank-initiated chargebacks (`charge.dispute.*`) have no webhook handler —
  finance manages those manually in the Stripe Dashboard.

- 🟡 **Payout "fees" and "adjustments" are placeholder £0 columns**
  (`apps/api/src/modules/payouts/payouts.service.ts` ~L207) — Stripe transfer
  fees aren't broken out in the schema yet, so statements show zero there.

- 🟡 **Per-star rating buckets aren't real.** The vendor API exposes only
  `rating` + `ratingCount`; the customer breakdown bars are generated by a
  deterministic estimator (`estimateBreakdown`,
  `apps/web/src/components/vendor/rating-breakdown.tsx`). Once the API returns
  per-bucket counts, swap the estimate out.

- 🟡 **"Food quality" sub-rating isn't stored separately.** The review form
  collects it but it folds into the overall rating
  (`apps/web/src/app/orders/[id]/review/page.tsx` ~L199). Needs a column +
  aggregation to surface it.

- 🟡 **Review photo uploads aren't saved.** The UI accepts photos then discards
  them on submit ("Photo uploads aren't saved yet — coming soon",
  review page ~L257). Needs storage + a join model.

---

## 3. Admin portal gaps

- 🟡 **CSV exports are stubbed** ("coming soon") on every list: Orders
  (`orders-client.tsx`), Users (`users-client.tsx`), Event Enquiries
  (`events-client.tsx`), and Reviews queue (`reviews-queue-client.tsx`).
- 🟡 **Order bulk actions** — the select-all and per-row checkboxes in the
  orders table are `disabled` ("coming soon", `orders-client.tsx` L337/L662).
- 🟡 **"More filters" buttons** are disabled placeholders on the Events and
  Reviews queues.
- 🟡 **Search Trends card** depends on a search-analytics aggregator that
  currently returns little/no data (`dashboard-client.tsx` +
  `components/dashboard/search-trends-card.tsx`).

---

## 4. Vendor portal gaps

- 🟡 **Menu drag-to-reorder is NOT wired.** The drag handle renders for visual
  parity but reordering doesn't persist — `useUpdateMenu` already accepts
  `displayOrder`, it just isn't hooked up (`menu/menu-list-client.tsx` ~L44).
- 🟡 **Menu-item photo reorder is NOT wired.** No drag-reorder for item photos
  because the schema has no sortable image-order field
  (`menu/[menuId]/items/[itemId]/item-editor-client.tsx` ~L587, TODO).
- 🟡 **Delivery map preview** is still a text list of postcode prefixes; an
  actual map is on the roadmap (`settings/delivery/delivery-form.tsx` L173).
- 🟡 **Vendor profile editing UI** isn't in the portal yet — it currently lives
  in the admin app only (`onboarding/onboarding-client.tsx` L102).
- 🟡 **"Download statement"** is disabled (marked future).
- 🟡 **Analytics deltas / "missing allergens"** cards use light-touch
  calculations and go blank with < 2 weeks of history; not a full analytics
  engine (`analytics/analytics-client.tsx`, `components/menu/menu-stat-cards.tsx`).

---

## 5. Customer web gaps

- 🟡 **Review photos** and the **food sub-rating** — see §2 (UI present, storage
  missing).
- 🟡 **Rating breakdown bars are estimated** until the API ships per-bucket
  counts — see §2.
- 🟡 **Order-confirmation copy-pill** shows a "preparing your order number" state
  while the ID is in-flight rather than a fake `FP-XXXXXX`
  (`orders/[id]/confirmation/page.tsx`). Cosmetic; works as intended.

---

## 6. Decisions to confirm (business, not code)

- 🟠 **Service fee is 0.** `SERVICE_FEE_BPS` defaults to `0`
  (`apps/api/src/common/config/service-fee.ts`), so the platform takes no
  per-order service fee today. It's runtime-configurable (no redeploy). If zero
  is intended for launch, fine — but it's a revenue call to make deliberately.

---

## 7. Already done — do NOT re-implement

Verified complete in the current code (some were previously assumed missing):

- **Apple Pay / Google Pay** — fully implemented and enabled via Stripe's
  Payment Request API; renders when the device has a wallet, falls back to the
  card form otherwise (`apps/web/src/components/checkout/payment-request-button.tsx`).
- **Delivery-area / postcode checking** — real haversine distance logic in SQL
  plus a postcode-prefix fallback; the web coverage check queries live vendors
  (`apps/api/src/modules/vendors/vendors.repository.ts`,
  `apps/web/src/lib/api/coverage.ts`). The only related gap is waitlist
  persistence (§2).
- **Menu moderation** — env-gated approval (`MENU_AUTO_APPROVE`) + an admin
  moderation queue; held/rejected items are hidden from listings, search, and
  checkout.
- **Stripe Connect onboarding, refunds, internal disputes, weekly payout batch,
  order state machine, basket, checkout, loyalty, promo codes** — all built and
  wired.

---

## 8. Genuinely not built (and not needed to start)

Real gaps, but none block launch — listed so nobody assumes they exist.

- **Third-party courier/logistics integration** (Deliveroo, Stuart, etc.).
  Delivery is vendor-managed by design.
- **Driver app / live GPS tracking.** Tracking is status-based with ETAs, not a
  moving dot on a map.
- **Admin "power-user" tooling** for surgically editing a single order/user in
  an emergency.

---

## In one sentence

The product is built and wired; what's left to *go live* is almost entirely
plugging in the outside world — live Stripe keys + registered webhook, one set
of notification credentials, and production DNS — after which the remaining work
is a tidy list of 🟡 polish items (CSV exports, drag-reorder, review photos,
real rating buckets) and one revenue decision (the £0 service fee).
