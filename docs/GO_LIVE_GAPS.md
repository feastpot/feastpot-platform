# Feastpot — What's Left to Implement Before Go-Live

_Last reviewed: 30 May 2026 — written against the code as it stands today, not the roadmap._

This is a plain-English inventory of **what still needs doing** before real
vendors onboard and real customers pay. It separates the work into three
buckets:

1. **Operational blockers** — config and credentials, not code. These stop the
   first real order.
2. **Features still to implement** — actual code gaps. Most are quality-of-life,
   not launch-blocking.
3. **Decisions to confirm** — business calls someone needs to make on purpose.

If you read one thing, read the **TL;DR** and **Operational blockers**.

---

## TL;DR

The product is **functionally built and wired end-to-end**. Vendors can apply,
be approved, set up menus (with drag-to-reorder and an admin moderation queue),
connect Stripe, set hours and delivery areas, and go live. Customers can search
by postcode against real distance/coverage logic, fill a basket, pay by card
(or Apple/Google Pay), and track the order. Payments, refunds, internal
disputes, and weekly payouts all exist and run.

What's left is mostly **operational plumbing**: live Stripe credentials + the
webhook registered, at least one live notification channel, and production
hosting/DNS. Beyond that there's a tidy list of **half-finished features** —
none of which block the first order — plus one or two **business decisions**.

---

## 1. Operational blockers (must be done first)

These are configuration and external setup, not missing code.

1. **Live Stripe credentials + webhook registration.** The webhook handler is
   built and processes `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `transfer.created`, and `refund.updated`.
   `STRIPE_WEBHOOK_SECRET` is a hard-required env var (the API refuses to start
   without it). Going live needs: the **live** `STRIPE_SECRET_KEY` in
   production, Stripe Connect enabled on the live platform, and the live
   webhook endpoint registered so its signing secret matches. Until then,
   payments run on test keys.

2. **At least one live notification channel.** The notification engine is
   complete — 20+ real templates, BullMQ queue, and providers for email
   (Resend), SMS (Twilio), and WhatsApp (Twilio Content API or Meta Cloud).
   Every provider currently runs in **stub mode** (logs `[stub-email]` /
   `[stub-sms]` / `[stub-wa]`) because credentials are missing. To switch one
   on, supply:
   - **Email:** `RESEND_API_KEY` + a verified sending domain for `EMAIL_FROM`.
   - **SMS:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
   - **WhatsApp:** `TWILIO_WHATSAPP_FROM` + per-template Content SIDs, **or**
     `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (Meta).

   Without at least one channel live, vendors get no order alert and customers
   get no confirmation — non-negotiable for a kitchen.

3. **Production hosting + DNS.** The API needs a stable home
   (`api.feastpot.co.uk` → Replit Autoscale, DNS-only) and the three frontends
   need their domains verified. Until this lands the apps only run on fallback
   URLs.

4. **A real payout dry-run.** The weekly batch processor is built and scheduled
   (cron, Mondays 02:00 UTC). Before trusting it with real money, run one full
   cycle against a test vendor in live mode and confirm funds settle and the
   finance view shows zero discrepancy.

---

## 2. Features still to implement (code gaps, non-blocking)

None of these stop onboarding or the first order. They're listed so nobody
assumes they're finished.

**Backend / data**
- **Waitlist interest is not persisted.** The `/waitlist` "register interest"
  endpoint (`coverage.service.ts`) only logs `[coverage-interest]` to the
  console — there's no `CoverageInterest` model, so sign-ups are lost. Needs a
  table + write before any marketing drives traffic to it.
- **Per-user notification preferences don't exist.** The processor delivers on
  every channel a template declares (if the user has a phone/email). There's no
  `NotificationPreference` table or "SMS only / unsubscribe" logic. Fine for
  launch; needed before high volume to avoid over-messaging.
- **Stripe-native chargeback/dispute webhooks are not handled.** The internal
  marketplace dispute flow (customer-vs-vendor) is complete and can trigger
  refunds, but bank-initiated chargebacks (`charge.dispute.*`) have no webhook
  handler — finance must manage those manually in the Stripe Dashboard.
- **Payout "fees" and "adjustments" are placeholder zero columns** in
  `payouts.service.ts` — the figures show as £0 until real fee/adjustment logic
  is wired.

**Admin portal**
- **CSV exports are stubbed** ("coming soon") on Orders, Users, and Event
  Enquiries lists.
- **Order bulk actions** — the multi-select checkbox in the orders table is
  disabled.
- **Search Trends card** depends on a search-analytics aggregator that
  currently returns little/no data.

**Vendor portal**
- **Delivery map preview** is still a text list of postcode prefixes; an actual
  map is on the roadmap.
- **"Download statement"** button is disabled (marked future).
- **Analytics deltas / "missing allergens"** cards use light-touch calculations
  and return blank when there's < 2 weeks of history; not a full analytics
  engine.

**Customer web app**
- **Review photo uploads** are accepted in the UI but not saved ("coming soon").
- **Loyalty redemption edge cases** (e.g. max-redeemable caps) have some
  disabled states rather than full automation.

---

## 3. Decisions to confirm (not code)

- **Service fee is 0.** `SERVICE_FEE_BPS` defaults to `0`, so the platform takes
  no per-order service fee today. It's runtime-configurable (no redeploy). If
  zero is intended for launch, fine — but it's a revenue call someone should
  make deliberately.

---

## Recently completed (don't re-do these)

Things the old version of this doc flagged as gaps that are now **done and
wired**:

- **Apple Pay / Google Pay** — fully implemented via Stripe's Payment Request
  API; renders when the device has a wallet, falls back to the card form
  otherwise.
- **Delivery-area / postcode checking** — real haversine distance logic in SQL
  plus a postcode-prefix fallback; the web coverage check queries live vendors.
  (The only remaining coverage gap is waitlist persistence, above.)
- **Menu moderation** — env-gated approval flow (`MENU_AUTO_APPROVE`) plus an
  admin moderation queue; held/rejected items are hidden from listings, search,
  and checkout.
- **Menu/item drag-to-reorder** — wired end-to-end; order persists via the API.

---

## What's genuinely not built (and isn't needed to start)

Real gaps, but none block launch — listed so nobody assumes they exist.

- **Third-party courier/logistics integration** (Deliveroo, Stuart, etc.).
  Delivery is vendor-managed by design.
- **Driver app / live GPS tracking.** Tracking is status-based with ETAs, not a
  moving dot on a map.
- **Admin "power-user" tooling** for surgically editing a single order/user in
  an emergency.

---

## In one sentence

The kitchen is built and the till works — what's left is plugging in the live
card machine (Stripe keys + registered webhook), switching on the line that
tells vendors an order arrived (one set of notification credentials), and
putting the whole thing on its production address; everything else is polish.
