# Phase 8: Money, compliance, notifications and security

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

## Rates

### Fixed

Canonical rates are 8% marketplace first, 5% marketplace repeat, 0% vendor
referred and 10% catering:
`packages/config/src/commission-rates.ts:5-25`.

The API resolves effective database rates and performs integer-pence
calculation:
`apps/api/src/commission/commission.service.ts:52-69,78-139,159-182`.

The current consistency contract covers:

- `/become-a-vendor` examples and calculator.
- Vendor Terms rate sections.
- Vendor Earnings, terms and onboarding.
- Admin Settings and Commission rates.
- Payout PDF, CSV and notification email.

Evidence: `apps/api/src/rate-schedule-consistency.spec.ts:39-132`.

Current payout PDF and CSV render each persisted entry's applied rate:
`apps/api/src/modules/payouts/payouts.service.ts:1355-1435,1517-1599`.
The payout email uses applied rates:
`apps/api/src/modules/notifications/templates/index.ts:382-402`.

A current-source scan found no production hard-coded 12% or 0.12 rate outside
historical test comments/migrations.

### Still present: catering quotes use the wrong rate source

Quote creation forces:

    const source = OrderSource.MARKETPLACE;
    const isFirstOrder = true;

It passes those values into commission calculation:
`apps/api/src/modules/catering-bookings/catering-bookings.service.ts:148-165`.

That resolves the 8% marketplace-first rate instead of the canonical 10%
catering rate. This is a launch blocker because every new catering quote can
record the wrong commission and vendor payout.

## Money paths

Fixed in current source:

- Stripe webhook claim is created before delivery and unique duplicates are
  acknowledged:
  `apps/api/src/modules/payments/stripe-webhook.controller.ts:92-115`.
- Claimed delivery state changes before enqueue and has recovery:
  `apps/api/src/modules/payments/stripe-webhook-delivery.service.ts:33-108`.
- `account.updated` is registered and updates local capabilities:
  `apps/api/src/modules/payments/stripe-webhook.processor.ts:216-285`.
- Commission and payout arithmetic use integer pence.
- Canonical payout statement entries feed PDF and CSV.
- The financial suite passed 123/123 tests in Phase 2.

Catering deposit arithmetic is fixed. The shared policy:

- Rejects negative/non-integer money.
- Rejects normal quotes below £50.
- Caps deposit at total.
- Calculates balance as total minus deposit.
- Throws unless deposit plus balance equals total and balance is non-negative.

Evidence: `packages/config/src/catering-deposit.ts:28-75`.

NOT VERIFIED:

- Live Stripe webhook, payment, refund or transfer execution.
- Runtime equality of payout batch totals and every detail row.
- Production Stripe subscription configuration.

## Food safety and legal

Fixed in current source:

- Quick-toggle publication rejects no declaration:
  `apps/api/src/modules/catalogue/menu-items.service.ts:952-959`.
- Checkout rejects an item with neither declared allergens nor the explicit
  free-from-all confirmation:
  `apps/api/src/modules/orders/orders.service.ts:494-504`.
- Material terms with fewer than 15 days' notice are rejected:
  `apps/api/src/modules/terms/terms.service.ts:89-99`.
- The FAQ fact and onboarding enforcement both allow registered/awaiting-first
  inspection and require an existing rating of at least 3:
  `packages/config/src/platform-facts.ts:100-107`;
  `apps/api/src/modules/vendors/vendor-onboarding.service.ts:303-313`.

Read-only current development database query:

    live_terms_version: part-b-1788799279281
    effective_at: 2026-09-07 16:41:29.775+00
    accepted_current: 19
    live_vendors: 277

The query selected the effective `VENDOR_TERMS` row using the same effective
and published ordering as `apps/api/src/modules/terms/terms.service.ts:214-228`,
then counted distinct acceptances and vendors with status `live`.

Only 19 of 277 development vendors marked live have accepted the effective
terms. Known test/seed data may be present, so production counts are NOT
VERIFIED. The launch data set must be reconciled before any real vendor use.

NOT VERIFIED:

- Runtime menu write/read publication attempts.
- Annex A/C absence and prominent full-terms link in rendered UI.
- Production live terms version and acceptance counts.

## Notifications

Fixed:

- The registry has 57 accepted event names.
- The registry contract asserts every accepted name has an explicit processor
  and validates producer/handler consistency:
  `apps/api/src/modules/notifications/notification-events.spec.ts:14-115`.
- Seven intentionally non-template events are explicit, not silent omissions:
  `apps/api/src/modules/notifications/notification-events.ts:56-62`.

Still present:

- Phase 0 observed 135 failed and 254 waiting notification jobs, 12 failed
  compliance jobs and 8 failed terms-notice jobs.
- `QUEUE_ALERT_SLACK_WEBHOOK_URL` was not configured in the observed log.
- `order_confirmation` has unit, enqueue and processor callback tests, but no
  reproduced real order-to-provider dispatch.

End-to-end notification delivery is NOT VERIFIED and the existing backlog is
a launch blocker.

## Security

Fixed in current source:

- Production startup requires exact `ADMIN_REQUIRE_AAL2=true` before listening:
  `apps/api/src/common/config/required-env.ts:91-107`;
  `apps/api/src/main.ts:146-148`.
- `AalGuard` rejects staff without `aal2`:
  `apps/api/src/auth/guards/aal.guard.ts:55-83`.
- The error-incident service derives authoritative user/vendor ownership from
  the authenticated principal and stores client claims separately:
  `apps/api/src/modules/error-incidents/error-incidents.service.ts:81-105`.

NOT VERIFIED:

- Production MFA variable value and every real staff enrolment.
- Every Admin endpoint with a Vendor token.
- Every Vendor object endpoint with another Vendor's token.
- Wrong-vendor IDs, team roles, stale tokens and role demotion.
- Private document access while signed out or cross-vendor.

The local Admin factory identity was rejected with
`reason=mfa-configuration`, so runtime role/MFA verification did not complete.

## Phase verdict

Most previously reported Stripe routing, deposit arithmetic, rate-display,
allergen and error-attribution concerns are fixed in current source. Launch is
still blocked by wrong catering commission application, unresolved effective
terms acceptances, notification delivery backlog and missing runtime security
and payment verification.