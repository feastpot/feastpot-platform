# Feastpot — What's Left Before Onboarding Vendors & Taking Orders

_Last reviewed: 29 May 2026 — written against the code as it stands today, not the roadmap._

This is a plain-English read on the gap between "the software is built" and
"a real vendor can sign up and a real customer can pay for dinner." Each
section leads with a verdict; the prose underneath explains it. If you only
read one thing, read the **TL;DR** and **Blockers to the first real order**.

---

## TL;DR

The product is, functionally, **already built**. A vendor can apply, be
approved, set up a menu, connect Stripe, set their hours and delivery area,
and go live. A customer can find them by postcode, fill a basket, pay by
card, and track the order to the door. The order state machine, payments,
refunds, disputes, and weekly payouts all exist in code and are wired
end-to-end.

What stands between today and taking real money is **almost entirely
operational plumbing, not missing features**: live payment credentials, a
working order-notification channel (SMS/WhatsApp/email), real delivery-area
checking, and production hosting/DNS. There is a short list of half-finished
features too, but only a couple of them actually block the first order.

Think of it as "switch it on and wire up the outside world," not "build the
rest of the product."

---

## Blockers to the first real order

These must be done before a single real customer pays a single real vendor.

1. **Live payment credentials + Stripe webhook.** Stripe is running on test
   keys. Going live needs the live secret key in production, the live
   Stripe Connect platform enabled, and the webhook endpoint registered
   with its signing secret (`STRIPE_WEBHOOK_SECRET`) for
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `transfer.created`, and `refund.updated`. Without the webhook, paid
   orders won't confirm and payouts/refunds won't reconcile.

2. **A working order-notification channel.** The notification engine (email
   via Resend, SMS/WhatsApp via Twilio) is fully built and queued, but the
   credentials are missing — specifically `TWILIO_FROM_NUMBER`,
   `WHATSAPP_ACCESS_TOKEN`, and `WHATSAPP_PHONE_NUMBER_ID`, plus a verified
   Resend sending domain. Until at least one channel is live, a vendor
   gets **no alert** that an order came in, and the customer gets no
   confirmation. For a kitchen taking orders, this is non-negotiable.

3. **Real delivery-area / postcode checking.** Coverage checking
   (`apps/web/src/lib/api/coverage.ts`) is currently a basic stub. It needs
   to be replaced with real boundary logic so customers aren't told a
   vendor delivers to them when they don't (or vice versa). This directly
   affects whether the very first orders are deliverable.

4. **Production hosting + DNS.** The API needs a stable production home
   (`api.feastpot.co.uk` → Replit Autoscale, DNS-only/grey-cloud) and the
   three frontends need their domains verified. Until this lands, the apps
   only run on fallback URLs.

5. **A real payout dry-run.** Run one full weekly payout cycle against a
   test vendor in live mode and confirm funds settle and the finance view
   shows zero discrepancy. The payout batch processor exists; it just
   hasn't been exercised end-to-end with real money.

---

## Vendor onboarding — where it stands

**Verdict: complete enough to onboard real vendors today, given the blockers
above are cleared.**

The whole journey exists: a public `/become-a-vendor` interest form → an
admin review queue (approve / reject / request more info) → automatic
provisioning of a login and a `Vendor` record → a magic-link invite email →
a 4-step onboarding wizard in the vendor portal (business details, KYC
documents, Stripe Connect payouts, first menu). Menu management, availability
(opening days, slots, prep lead time, daily caps, blackout dates), delivery
configuration (local/collection/nationwide, radius, fees, minimum order), and
compliance document upload/verification are all implemented and functional.

**Small unfinished edges (none block onboarding):**
- **Menu/item drag-to-reorder** shows handles in the UI but isn't wired to
  the API yet — items save in creation order.
- **Map preview** in delivery settings is still a text list of postcode
  prefixes; an actual map is on the roadmap.
- **Menu moderation** — the schema supports a review/approve status, but the
  current UI treats vendor uploads as auto-approved. Fine for a trusted
  launch cohort; revisit if you open self-serve signup widely.

---

## Taking orders — where it stands

**Verdict: the purchase path is fully built; two business decisions and one
optional feature are the only things to confirm.**

Browsing, vendor pages, the cross-vendor-locked basket, the checkout (address,
delivery slot, promo codes, loyalty redemption), Stripe Elements payment,
order creation, confirmation, and real-time tracking are all live. Payment
uses authorise-now / capture-on-accept. Refunds, customer cancellation,
vendor-proposed amendments, reordering, loyalty points, and promo codes are
implemented.

**To confirm before launch:**
- **Service fee is currently 0.** `SERVICE_FEE_BPS` is set to `0`, so the
  platform takes no per-order service fee today. If that's intended for
  launch, fine — but it's a revenue decision someone should make
  deliberately, not by default.
- **Apple Pay / Google Pay** buttons exist in checkout but are disabled
  ("coming soon"). Card checkout works without them; treat this as a
  conversion optimisation, not a blocker.

---

## What's genuinely not built (and isn't needed to start)

These are real gaps, but none of them stop you onboarding vendors or taking
orders. They're listed so nobody assumes they exist.

- **Third-party courier/logistics integration** (Deliveroo, Stuart, etc.).
  Delivery is vendor-managed by design — vendors handle their own drop-off.
- **Driver app / live GPS tracking.** Tracking is status-based with ETAs,
  not a moving dot on a map.
- **Notification preferences & a few stub templates.** Channel routing works,
  but per-user "SMS only" style preferences are largely absent and a couple
  of event types fall back to a generic body.
- **Richer analytics "insights"** in the vendor and admin portals — some
  cards are visual shells with placeholder data.
- **Admin "power-user" tooling** for surgically editing a single order/user
  in an emergency.
- **Stripe dispute (chargeback) webhook handling** — currently handled
  manually by finance rather than automatically.

---

## In one sentence

The kitchen is built and the till works — what's left is plugging in the
card machine (live Stripe + webhook), connecting the phone line that tells
vendors an order arrived (SMS/WhatsApp/email credentials), making the
"do we deliver to you?" check real, and putting the whole thing on its
production address.
