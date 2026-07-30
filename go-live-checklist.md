# Feastpot — Go-Live Checklist

_Re-audited: 30 July 2026 (evening pass). Verified against the current codebase
on `main`, the production database, and the open project task list. This
supersedes the morning 30 July version and `docs/GO_LIVE_GAPS.md` (31 May 2026);
it complements the sign-off gates in `LAUNCH_CHECKLIST.md`._

---

## Where we actually are (verified today)

Almost everything the morning audit listed as a blocker has since been **built,
merged to `main`, and verified in code**:

- ✅ **Branch work merged** — PR #28 (audit sections 7–9) and the follow-up
  hotfix PR #29 are on `main`; CI green.
- ✅ **#40 Service fee retention** — vendor payout = total − service fee −
  commission, in BOTH the per-order calc (`orders.service.ts`) and the weekly
  batch (`payouts.service.ts` sums stored `vendorPayoutPence`, no recompute).
- ✅ **#45 Chargeback-loss reconciliation** — `reconcileLostChargeback` writes
  the refund/ledger entries and absorbs the platform's share
  (`stripe-webhook.processor.ts`).
- ✅ **#44 Chargebacks & disputes in admin** — list/detail UI
  (`apps/admin/src/app/chargebacks`, `/disputes`) backed by API endpoints.
- ✅ **#46 Evidence-deadline warnings** — hourly cron warns finance/admin 72h
  before Stripe evidence deadlines, exactly-once via CAS
  (`chargeback-deadline-monitor.service.ts`).
- ✅ **#64 WhatsApp template drift guard** — contract test pins every builder's
  parameter count against the Twilio/Meta slot counts
  (`whatsapp-template-contract.spec.ts`), and checks no slot renders blank.
- ✅ **Per-user notification preferences / opt-out** — model, self-service
  GET/PATCH endpoints, and processor-side channel filtering (transactional
  bypasses opt-out; WhatsApp is opt-in by default).
- ✅ **#28 Distance on vendor cards** — shown on homepage rails and row cards.
- ✅ **Rating breakdown bars are real** — the API computes per-star counts
  (`getRatingBreakdown`) and the vendor page passes them through; the Gaussian
  estimator only remains as a fallback (labelled "Estimated distribution").
- ✅ **ICO number** — real registration `ZC146267` in `legal-constants.ts`
  (placeholder `ZA000000` removed).
- ✅ **Failed prod queue jobs cleared** (#41 confirmed) — the 4 failed
  notifications were May test-era review requests (resend would be spam); the
  2 compliance jobs were stalled cron repeats. Nothing real was dropped.
- ✅ **Prod migration history clean** — all 35 migrations baselined; deploys
  no-op cleanly.

**⚠️ 30 July outage note:** the republish briefly took the API down — a new
startup guard refused to boot because production runs on the shared Supabase
project. Fixed in PR #29 (guard now warns; hard-exit is opt-in via
`REQUIRE_DEDICATED_SUPABASE=true`). **Confirm the API has been republished
from current `main` and `/v1/healthz` is green before anything else.**

---

## 1. 🔴 Blockers — do these before real customers order

### 1.1 Republish the API from current `main` (if not already done)

The financial-integrity work above only protects revenue once it's the running
build. Verify `https://api.feastpot.co.uk/v1/healthz` returns `status: ok`
post-deploy.

### 1.2 Live payout dry-run (human-operated)

The Monday 02:00 payout batch is built and idempotent — but has never been
trusted with real money end-to-end, **and it now carries the new service-fee
retention math**. Run one full cycle against a real connected vendor, verify
the bank settlement AND that the paid amount excludes the service fee.
Procedure: `docs/runbooks/payout-dry-run.md`.

### 1.3 E2E rehearsals on production

One real order (postcode → checkout → delivery → review) and one real refund,
before announcing. This also exercises the newly-deployed notification
preference filtering end-to-end.

---

## 2. 🟠 Pre-launch — yet to be implemented (code)

Silent-failure hardening, in priority order:

- **#56 Failed Stripe payout recovery — PARTIAL.** A failed transfer marks the
  payout `failed` in the DB and the admin payouts screen shows the count, but
  there is no retry/recovery flow or per-payout retry action — recovery is
  manual via logs. (Idempotency keys make a retry safe to build.)
- **#58 Admin resend for dead notifications — MISSING.** Notifications that
  exhaust retries sit as `failed` rows / Bull DLQ entries; the DLQ monitor
  emails a daily digest and settings links out to Bull Board, but there's no
  in-admin list-and-resend screen.
- **#59 Vendor application emails — MISSING retry.** Sent inline with
  `Promise.allSettled` + 10s timeout; failures only log to Sentry. Should go
  through the durable notification outbox like everything else.
- **#63 Blank-content smoke check — PARTIAL.** WhatsApp slots are covered by
  the contract test; there's no equivalent render-every-email-template-and-
  assert-non-blank test for the email side.

Product-level:

- **Twilio number provenance** — confirm the SMS number is a production-grade
  UK number, not the earlier US trial number restricted to verified callers.

---

## 3. 🟡 Polish — safe to ship after launch

- **Vendor menu list thumbnails** — still a placeholder icon tile; the
  `VendorMenu` payload doesn't expose item image URLs (`menu-list-client.tsx`).
- **Payout statement "other fees / adjustments"** — vendor statement shows real
  Gross / Commission / Refunds, but has no column for ad-hoc adjustments or
  other platform fees should they ever exist.
- **Hardcoded support-contact fallbacks** — `apps/web/src/app/help/page.tsx`
  falls back to `+447459774818` / `support@feastpot.co.uk` when
  `NEXT_PUBLIC_SUPPORT_*` env vars are unset; verify these are the real launch
  contacts (or set the env vars everywhere).
- **Dedicated production Supabase project** — prod and dev currently share one
  Supabase project (root cause of today's outage scare). Provision a separate
  prod project, migrate, then set `REQUIRE_DEDICATED_SUPABASE=true` to make the
  guard enforcing.
- Known-and-accepted absences (documented so nobody assumes they exist):
  third-party courier integration, driver GPS tracking.

---

## 4. Human / operational sign-off (not code)

The full gate list lives in `LAUNCH_CHECKLIST.md`; the items most likely to be
forgotten because no engineer owns them:

- **Legal:** DPAs with Stripe/Supabase/Twilio/Resend; DPIA; counsel review of
  terms. (ICO registration ✅ done — `ZC146267` is live in the privacy policy.)
- **Vendor readiness:** 5+ verified vendors per launch borough, each with FHRS
  ≥ 4, insurance, allergen training, completed Stripe Connect onboarding, and
  5+ photographed menu items.
- **Monitoring:** confirm Sentry alerts route to a human; Lighthouse/SEO/PWA
  checks per `LAUNCH_CHECKLIST.md`; uptime monitor already proved itself today.
- **Secrets hygiene:** `PROD_DIRECT_URL` was fixed 30 July after a silent
  password rotation — worth a quarterly "do all prod credentials still work"
  check.
- **Housekeeping:** close project tasks #40/#44/#45/#46/#28/#41/#64 — all
  verified implemented on `main` (this audit).

---

## In one sentence

The financial-integrity work that was the top blocker is now built and merged;
going live is now (1) republish and confirm healthz, (2) rehearse one real
payout, order and refund, (3) close the four remaining notification-hardening
gaps (#56/#58/#59/#63 — none block a controlled pilot), then (4) work the human
sign-off list in `LAUNCH_CHECKLIST.md`.
