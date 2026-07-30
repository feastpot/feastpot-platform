# Feastpot — Go-Live Checklist

_Audited: 30 July 2026. Verified against the live production API (`/v1/healthz`),
the production database, the current codebase, and the open project task list —
not against older documents. This supersedes `docs/GO_LIVE_GAPS.md` (31 May 2026)
and complements the sign-off gates in `LAUNCH_CHECKLIST.md`._

---

## Where we actually are (verified today)

Production is in far better shape than the May audit assumed. Checked live on
30 July:

- **API is deployed and healthy** — `https://api.feastpot.co.uk/v1/healthz`
  returns `status: ok`, `environment: production`, uptime ~43 days.
- **Stripe is in live mode** (`stripe: "live"`), with live-vs-test key switching
  handled by `resolveStripeEnv` and money-moving calls carrying idempotency keys.
- **Redis + all four queues** (notifications, stripe-webhooks, payouts,
  compliance) are up, with crons registered.
- **Notifications:** email (Resend) configured, WhatsApp configured, and **all
  10 Twilio Content SIDs are set** (order confirmation → payout statement). The
  May-era "WhatsApp is a stub" item is resolved.
- **All three frontends respond** at `feastpot.co.uk`, `vendor.feastpot.co.uk`,
  `admin.feastpot.co.uk`.
- **Production migration history is clean** — all 35 migrations recorded as
  applied (repaired 30 July; a failed record from 28 July would previously have
  crashed the next deploy).
- **Codebase sweep:** zero TODO/FIXME/"coming soon" markers in any app source.

So the question is no longer "what plumbing is missing" — it's a short list of
real gaps, one deploy, and the human sign-off work.

---

## 1. 🔴 Blockers — do these before real customers order

### 1.1 Merge PR #28 and redeploy the API
Sections 7–9 of the implementation audit (admin CSV exports, bulk order tools,
critical dispute severity, vendor menu health, order-tag table, env hygiene) are
**on the branch, not in production**. The running API is ~43 days old.
- Merge `chore/sync-main-prod-restore` → `main` (CI is green).
- Republish the API. `migrate deploy` will be a clean no-op — the schema changes
  already exist in prod and the history is baselined.
- After merge: merge `main` back into the branch (standing workflow).

### 1.2 Financial integrity gaps (open tasks #40, #44, #45, #46)
These are the audit's own top priority and remain unbuilt:
- **#40 — Service fee retention**: the customer service fee is currently paid
  out to vendors instead of kept as platform revenue. This is live money leaking
  on every order. *The single most valuable open item.*
- **#45 — Chargeback-loss reconciliation**: a lost bank chargeback doesn't write
  the refund/credit ledger pair, so order finances silently drift.
- **#44 — Chargebacks visible in admin** and **#46 — evidence-deadline
  warnings**: finance currently manages disputes blind, from the Stripe
  Dashboard only.

### 1.3 Clear the failed jobs sitting in production queues
Healthz shows **4 failed notification jobs and 2 failed compliance jobs** in
prod right now. Inspect them (Bull Board) and resend/discard before launch —
they may be undelivered customer messages. (Related: open task "Confirm the
cleared jobs didn't drop any real customer notifications or refunds".)

### 1.4 Live payout dry-run (human-operated)
The Monday 02:00 payout batch is built, idempotent and scheduled — but has never
been trusted with real money end-to-end. Run one full cycle against a real
connected vendor and verify bank settlement. Procedure:
`docs/runbooks/payout-dry-run.md`.

---

## 2. 🟠 Pre-launch — should land before public announcement

Silent-failure hardening (all have open tasks; none block a controlled pilot):
- **#56** Failed Stripe payouts only alert Sentry — no retry/recovery flow.
- **#58** Notifications that exhaust retries vanish — no admin resend screen.
- **#59** Vendor application emails alert instead of retrying.
- **#63** No smoke check that rendered emails/messages aren't blank.
- **#64** Generic WhatsApp message shape can drift from Twilio templates
  undetected (Meta rejects on parameter-count mismatch).

Product-level:
- **Per-user notification preferences / opt-out** — the processor sends on every
  channel a template declares. Legally and practically needed before volume
  (UK PECR: SMS/WhatsApp marketing needs consent; transactional is fine, but an
  unsubscribe path is still expected).
- **Twilio number provenance** — confirm the SMS number is a production-grade
  UK number, not the earlier US trial number restricted to verified callers.
- **#28** Distance on vendor cards across homepage rails (customer trust).

---

## 3. 🟡 Polish — safe to ship after launch

- **Real per-star rating buckets** — the customer-facing breakdown bars are an
  estimator (`rating-breakdown.tsx`), not real counts.
- **Payout statement "fees" and "adjustments"** are placeholder £0 columns.
- **Vendor menu list thumbnails** are placeholders — the `VendorMenu` payload
  doesn't expose item image URLs yet (`menu-list-client.tsx`).
- **Hardcoded support contacts** in the help page (`NEXT_PUBLIC_SUPPORT_*`
  fallbacks) — verify the numbers/addresses are the real launch ones.
- Known-and-accepted absences (documented so nobody assumes they exist):
  third-party courier integration, driver GPS tracking.

---

## 4. Human / operational sign-off (not code)

The full gate list lives in `LAUNCH_CHECKLIST.md`; the items most likely to be
forgotten because no engineer owns them:

- **Legal:** ICO registration number is still the placeholder `ZA000000` in the
  privacy policy; DPAs with Stripe/Supabase/Twilio/Resend; DPIA; counsel review
  of terms.
- **Vendor readiness:** 5+ verified vendors per launch borough, each with FHRS
  ≥ 4, insurance, allergen training, completed Stripe Connect onboarding, and
  5+ photographed menu items.
- **E2E rehearsals:** one real order (postcode → checkout → delivery → review)
  and one real refund, on production, before announcing.
- **Monitoring:** confirm Sentry alerts route to a human; Lighthouse/SEO/PWA
  checks per `LAUNCH_CHECKLIST.md`.
- **Secrets hygiene:** `PROD_DIRECT_URL` was fixed 30 July after a silent
  password rotation — worth a quarterly "do all prod credentials still work"
  check.

---

## In one sentence

The platform is deployed, healthy and taking live Stripe traffic; going live is
now (1) merge & redeploy the two months of branch work, (2) close the four
financial-integrity tasks — above all stopping the service fee from being paid
out to vendors, (3) clear the failed prod jobs and rehearse one real payout,
order and refund, then (4) work the human sign-off list in `LAUNCH_CHECKLIST.md`.
