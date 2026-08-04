# Feastpot — Go-Live Checklist

_Re-audited: 4 August 2026. Verified against the current codebase on `main`,
the production API/database, and the live sites. This supersedes the 30 July
version and `docs/GO_LIVE_GAPS.md`; the full "what's yet to be implemented"
editorial lives in `docs/REMAINING_WORK.md`; the box-ticking sign-off gates
live in `LAUNCH_CHECKLIST.md`._

---

## Verified done (removed from the working list)

- ✅ **Dedicated production Supabase project** — prod runs on the London
  project `yeklvhoqanxnogjnhkui`; the old shared project is dev-only. Prod
  healthz confirms the ref. Deploy pipeline secrets now point at London and
  migrations apply cleanly. _(Optional hardening: set
  `REQUIRE_DEDICATED_SUPABASE=true` now that it would pass.)_
- ✅ **Status page** — `/v1/statusz` (minimal public contract) +
  `status.feastpot.co.uk` lands directly on the page; all other paths on that
  host 308 to www.
- ✅ **Capacity enforcement wired end-to-end** — reserve at checkout before
  the Stripe PI; release on customer cancel, vendor reject/cancel, admin
  terminal, payment-failed webhook, and checkout failure. Behind
  `CAPACITY_ENFORCEMENT` (currently **off** = dry-run logging).
- ✅ Financial integrity set (service-fee retention, chargeback
  reconciliation, evidence-deadline warnings, admin chargebacks/disputes
  views), WhatsApp template drift guard, notification preferences, prod
  migration baseline, API healthz green with Stripe **live** — all verified
  in earlier passes and re-confirmed live today.

---

## 1. 🔴 Blockers — before real customers order

1. **Live payout dry-run** (human) — first real cycle since the service-fee
   retention change; verify bank settlement AND that the paid amount excludes
   the service fee. Procedure: `docs/runbooks/payout-dry-run.md`.
2. **E2E rehearsals on production** (human) — one real order
   (postcode → checkout → delivery → review) and one real refund.

---

## 2. 🟠 Pre-launch — yet to be implemented (code)

In priority order (details + file refs in `docs/REMAINING_WORK.md`):

- **Failed payout retry** — admin has no per-payout Retry action; recovery is
  manual via logs. Idempotency keys make this safe to build. (task #56)
- **Failed-notification resend screen** — DLQ digest exists; no in-admin
  list-and-resend. (task #58)
- **Vendor application emails through the outbox** — still inline
  `Promise.allSettled`; failures only hit Sentry. (task #59)
- **Email blank-content contract test** — WhatsApp side is covered; email
  side is not. (task #63)
- **Slack queue alerts** — code built; just needs
  `QUEUE_ALERT_SLACK_WEBHOOK_URL` set. (task #82, waiting on webhook)

Capacity arm-up (feature built, flag off):

- Review dry-run logs → reconcile `slots_taken` with real bookings → flip
  `CAPACITY_ENFORCEMENT=true` in prod.
- **Checkout must surface `CAPACITY_FULL` / `PREORDER_CUTOFF_PASSED`** —
  the web app currently shows a generic failure for both.
- Near-sold-out warning in the date picker (task #91); vendor-side messaging
  for the existing server shrink guard (task #92).

Product-level:

- **Twilio number provenance** — confirm a production-grade UK number, not
  the earlier US trial number.

---

## 3. 🟡 Polish — safe to ship after launch

- Vendor menu list thumbnails (placeholder icon; payload lacks image URLs).
- Hygiene/FHRS number in the admin applications _list_ (detail page has it —
  task #88).
- Dispute evidence submission from admin (view/close only today; evidence
  goes via the Stripe dashboard).
- Payout statement "adjustments" column.
- Vendor profile self-editing (currently admin-only, noted in onboarding).
- CORS: drop the unconditional `localhost:*` origins from the production
  allow-list in `apps/api/src/main.ts`.
- Known-and-accepted absences: courier integration, driver GPS tracking,
  meal-prep subscriptions (schema reserved, no code path).

---

## 4. Human / operational sign-off (not code)

Full gate list in `LAUNCH_CHECKLIST.md`; most-forgotten items:

- **Legal:** counsel review of terms; DPAs (Stripe/Supabase/Twilio/Resend);
  DPIA; transfer mechanism. (ICO ✅ `ZC146267` live.)
- **Vendor readiness:** 5+ verified vendors per launch borough (FHRS ≥ 4,
  insurance, allergen training, Stripe Connect, 5+ photographed items).
- **Monitoring:** Sentry DSNs on the three Vercel frontends; Supabase DB
  alerts; on-call rota; rotate the Bull Board password.
- **Search:** submit the sitemap to Search Console + Bing.
- **Device passes:** PWA install (iOS/Android), cookie-banner persistence,
  OG share cards, Lighthouse ≥ 90 mobile.

---

## In one sentence

No remaining code gap blocks a controlled pilot — the launch-critical work is
the payout dry-run and E2E rehearsal, the recovery tooling
(#56/#58/#59/#63/#82), the capacity arm-up with its checkout error UX, and
the human sign-off list in `LAUNCH_CHECKLIST.md`.
