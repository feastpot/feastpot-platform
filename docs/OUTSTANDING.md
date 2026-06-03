# Feastpot — What's Left to Build

_Audited 03 June 2026. This is a fresh, code-verified pass (grep + file reads +
subagent sweep) and supersedes the relevant parts of `GO_LIVE_GAPS.md`, which
predates this week's work. It lists **only** what is still outstanding — anything
already shipped has been removed. Items merged this session (live Stripe key +
webhook, live card payments on the customer site, the Bull "stalled job" fix,
historical failed-job cleanup, the queue-depth alarm, bank-chargeback webhooks,
and payout-transfer idempotency) are **done** and deliberately absent below._

The headline: the product is built and the money plumbing now works end-to-end.
What remains is one genuine money decision, a finance-visibility surface for the
new chargeback feature, a short list of "coming soon" UI stubs, and the kind of
polish that's safe to ship after the doors open.

---

## 🔴 Settle before real money moves

**The live payout dry-run.** The weekly batch builds correct drafts (already
proven against live data) and the transfer path is now idempotent, but a real
end-to-end run has never happened. Onboard one test vendor through **live**
Stripe Connect, push a small real order to `delivered`, run the batch, approve
the draft, and confirm the funds settle penny-for-penny in Stripe before you
trust the Monday 02:00 cron. The runbook is at `docs/runbooks/payout-dry-run.md`.
This is hands-on-keyboard work that can't be done from the dev environment.

**The service fee is being paid to vendors, not kept.** Today the 5% customer
service fee flows straight into the vendor payout: commission is charged on food
subtotal only, and `vendorPayout = total − commission` where `total` already
includes the service fee (`orders.service.ts:90-104`). So every order quietly
hands the platform's own fee back to the vendor. If the intent is for the service
fee to be platform revenue, the payout math needs to subtract it — and either way
the live `SERVICE_FEE_BPS` value (currently 500 = 5%) should be confirmed before
launch. This is a revenue leak, not cosmetics.

---

## 🟠 Do before opening to volume

**Chargebacks have no human surface yet.** The hard part is done — Stripe
`charge.dispute.*` events are captured into a `Chargeback` table and there's a
`GET /v1/payments/chargebacks` API. But there is **no admin UI** to see or work
them (zero "chargeback" references in `apps/admin/src`), nothing **reconciles an
order's finances when a chargeback is lost**, and nobody is **warned before the
evidence-submission deadline** passes. Until those three exist, finance is still
effectively managing disputes blind in the Stripe Dashboard.

**No per-user notification preferences.** The processor fires on every channel a
template declares; there's no `NotificationPreference` table and no
"SMS-only / unsubscribe / opt-out" path. Fine for a pilot, but you need it before
volume to honour opt-outs and avoid over-messaging.

**Confirm the queue cleanup was clean.** The 35 historical failed jobs that were
drained this week were all false-failures by inspection, but a quick confirmation
that no real customer notification or refund was among them is worth doing before
trusting the new normal.

**WhatsApp is built but unconfigured.** The provider supports both Twilio and
Meta Cloud API and falls back to a stub when unconfigured. It needs per-template
Content SIDs set in env before it will actually send. Optional if email/SMS/push
cover launch comms.

---

## 🟡 Polish — safe to ship after launch

**Reviews are still partly faked.**
- The homepage "community reviews" are **hardcoded sample strings**
  (`components/home/community-reviews.tsx`), not real reviews sorted by date.
- The vendor **rating-breakdown bars are estimated** client-side
  (`rating-breakdown.tsx` `estimateBreakdown()`) because the API doesn't return
  per-star bucket counts.
- The **"food quality" sub-rating** is collected on the review form but folded
  into the overall score — no column, no aggregation.
- **Review photos** are accepted in the UI then discarded on submit — no storage
  and no join model.

**Payout statements show £0 fees/adjustments.** The payout CSV hardcodes
`fees_pence` and `adjustments_pence` to `0` and the schema has no Stripe
transfer-fee breakout, so statements understate the detail even though the net is
correct.

**Admin "coming soon" stubs.**
- CSV export is still disabled on **Users**, **Event Enquiries**, and the
  **Reviews queue** (Orders export is wired; Disputes has its own).
- **Order bulk actions** (select-all / per-row checkboxes) are disabled.
- **"More filters"** is a disabled placeholder on the Events and Reviews queues.
- The **Search Trends** card runs on thin analytics with a hardcoded opportunity
  threshold and no real pagination.

**Vendor portal.**
- **Delivery area** is a postcode-prefix textarea; the map / polygon-zone tool is
  still on the roadmap.
- **Analytics deltas and advanced charts** (repeat-customer rate, heatmaps,
  missing-allergen hints) are light-touch and go blank with under two weeks of
  history — a real analytics engine isn't built.

**Customer web loose ends.**
- The **order-confirmation copy-pill / referral nudge** is a static placeholder.
- A **dead 404-guard** around `POST /v1/users/sync` lingers in the register flow
  even though that endpoint now exists — harmless, worth deleting.

---

## Tests & housekeeping

- **One flaky test.** `order-slots.service.spec.ts` adjusts its target slot from
  the machine's real wall-clock instead of fake timers, so it can fail depending
  on the time of day it runs. Pin it to a fixed clock for deterministic CI.
- **Repo-wide lint debt.** Pre-existing `import-order` / `eqeqeq` violations sit
  across untouched files and were repeatedly noted (but correctly not "fixed")
  during this week's merges. Worth a dedicated cleanup pass so real issues stop
  hiding in the noise.

---

## Operational checklist (config, not code)

- **Deploy the three frontends.** `apps/web`, `apps/vendor`, and `apps/admin` are
  independent Next.js apps; this repl only deploys the API. Each needs its own
  publish + domain.
- **Apply the chargeback migration to production.** The new `Chargeback` table
  migration is committed but applied out-of-band — it must land on the prod DB at
  publish time, or the dispute webhooks will error on write.
- **Confirm `SERVICE_FEE_BPS`** for live (ties into the 🔴 revenue item above).

---

## Deliberately not built (not needed to launch)

Listed only so nobody assumes they exist: third-party courier/logistics
integration (delivery is vendor-managed by design), a driver app / live GPS
tracking (tracking is status-based with ETAs), and admin "power-user" tooling for
surgically editing a single order or user in an emergency.

---

### Bottom line

One revenue decision (the service fee), one hands-on payout dry-run, and a
finance surface for the chargebacks feature stand between you and a confident
launch. Everything after that is polish you can ship while the lights are on.
