# Feastpot — What's Yet To Be Implemented

_Editorial review of the entire platform, 4 August 2026. Every claim below was
verified against the code on `main`, the production API, and the live sites —
not against older audit documents. This supersedes `docs/GO_LIVE_GAPS.md` and
`docs/OUTSTANDING.md` as the definitive "what's left" list; the prioritised
launch narrative lives in `go-live-checklist.md`._

---

## The state of play

The platform is substantially complete and live in production. Since the last
audit (30–31 July): production moved to a **dedicated London Supabase project**
(`yeklvhoqanxnogjnhkui`) with the old shared project relegated to dev; the
**status page** shipped end-to-end (`/v1/statusz` API + `status.feastpot.co.uk`
landing directly on it, other paths redirecting to www); **capacity
enforcement** is wired through the whole order lifecycle (reserve at checkout,
release on every terminal path including the payment-failed webhook) behind the
`CAPACITY_ENFORCEMENT` flag, currently off in dry-run mode; the deploy
pipeline's stale database secrets and missing Vercel deploy hooks were fixed;
and the CI/deploy chain is green with migrations applying cleanly to London.

Production health right now: `/v1/healthz` returns `ok` — database, Redis (TLS),
secrets, Stripe **live**, email and all ten WhatsApp Content SIDs configured.

What remains falls into four buckets.

---

## 1. Reliability hardening (code, highest value)

These are the "when something fails, nobody can recover it from a screen"
gaps. None block a controlled pilot; all bite at scale.

- **Failed payout recovery** — a failed Stripe transfer marks the payout
  `failed` and the admin KPI card counts it, but the only admin actions are
  Hold / Approve / Reconcile; recovery is manual via logs. Idempotency keys
  are already in place, so a per-payout **Retry** action is safe to build.
  (`apps/api/src/modules/payouts/payouts.service.ts`,
  `apps/admin/src/app/payouts/payouts-client.tsx`)
- **Failed-notification resend screen** — notifications that exhaust retries
  sit as failed outbox rows / DLQ entries; the DLQ monitor emails a daily
  digest, but there is no in-admin list-and-resend UI.
- **Vendor application emails bypass the outbox** — still sent inline via
  `Promise.allSettled` with a 10s timeout; failures only log to Sentry. Should
  be routed through the durable notification outbox like every other message.
  (`apps/api/src/modules/vendors/vendors.service.ts` ~L371)
- **Email blank-content contract test** — WhatsApp templates are pinned by
  `whatsapp-template-contract.spec.ts`; there is no equivalent
  render-every-email-template-and-assert-non-blank test.
- **Slack queue alerts** — the code is built
  (`dlq-monitor.service.ts` posts to `QUEUE_ALERT_SLACK_WEBHOOK_URL`) but the
  env var is unset, so alerts fall back to log lines. One secret away from
  done (open task, waiting on the webhook URL).

## 2. Capacity go-live sequence (feature is built, not yet armed)

Enforcement is fully wired but `CAPACITY_ENFORCEMENT` is off. To arm it:

1. Let dry-run logs accumulate for a few days; review "would have blocked"
   lines for surprises.
2. Reconcile `vendor_capacity.slots_taken` with real booked orders (counters
   were reset to zero and orders created while the flag is off don't
   increment).
3. Flip the flag in production.

Supporting UX that's still missing:

- **Checkout does not surface capacity errors** — the API returns
  `CAPACITY_FULL` (409) and `PREORDER_CUTOFF_PASSED` (400), but the web app has
  no handling for either code; customers would see a generic failure.
- **Near-sold-out warning in the date picker** — the public availability
  endpoint already exposes `remainingSlots`; the picker doesn't show it.
- **Vendor shrink guard, UI half** — the server correctly refuses to set
  `totalSlots` below `slotsTaken`, but the vendor availability screen doesn't
  pre-empt or explain that error.
- **Durable reservation record (nice-to-have)** — releases re-derive the
  capacity type from current menu-item categories and the current flag value;
  a persisted per-order reservation would make releases immune to menu edits
  and flag flips.

## 3. Product polish (safe after launch)

- **Vendor menu list thumbnails** — placeholder icon tile; the `VendorMenu`
  payload doesn't expose item image URLs (item grid already shows real
  images). (`apps/vendor/src/app/menu/menu-list-client.tsx`)
- **Hygiene number in the admin applications list** — the list shows only an
  FSA Yes/No flag; the actual FHRS number is only on the detail page.
- **Dispute evidence submission** — admins can view and close disputes but
  cannot submit evidence to Stripe from the UI; that still happens in the
  Stripe dashboard.
- **Payout statement "adjustments" column** — statements show Gross /
  Commission / Refunds / Net with no line for ad-hoc credits or debits.
- **Vendor profile self-editing** — onboarding notes profile editing "lives in
  the admin app for now"; vendors cannot edit their own business details.
- **Stray warning colours** — one `bg-orange-500` badge in the admin vendors
  screen (expired-document SLA); arguably intentional contrast, flagged for a
  design decision.
- **CORS hardening** — `localhost:3000/3002/3003` are in the production CORS
  allow-list unconditionally (`apps/api/src/main.ts`); gate them by env.

## 4. Deliberately not built (so nobody assumes they exist)

- Third-party courier integration and driver GPS tracking.
- Meal-prep subscriptions — `OrderType.subscription` and the `meal_prep`
  capacity type are reserved in the schema; no code path creates them.
- Automated API republish — the API deploys from Replit manually; the GitHub
  pipeline migrates the DB and build-verifies but cannot republish the VM.

---

## Human / operational gates (no code required)

Unchanged from `LAUNCH_CHECKLIST.md`, still the real launch blockers:

- **Live payout dry-run** with a real connected vendor — first run since the
  service-fee retention change; verify the settled amount excludes the
  customer service fee (`docs/runbooks/payout-dry-run.md`).
- **E2E rehearsals on production** — one real order through to review, one
  real refund.
- **Legal**: counsel review of terms, DPAs (Stripe/Supabase/Twilio/Resend),
  DPIA, transfer mechanism.
- **Vendor readiness**: 5+ verified vendors per launch borough with FHRS ≥ 4,
  insurance, Stripe Connect complete, photographed menus.
- **Monitoring**: Sentry DSNs confirmed on the three Vercel frontends;
  Supabase DB alerts; on-call rota; rotate the Bull Board password.
- **Misc**: submit sitemap to Search Console/Bing; device passes (PWA install,
  cookie banner persistence, OG share cards); confirm the Twilio number is a
  production-grade UK number.

---

## In one sentence

Nothing left is a code blocker for a controlled pilot: the remaining
engineering is recovery tooling (payout retry, notification resend, outbox for
application emails), the capacity arm-up sequence with its checkout UX, and a
short polish list — the true gates to public launch are the human ones:
payout dry-run, E2E rehearsal, legal sign-off and vendor readiness.
