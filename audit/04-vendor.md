# Phase 4: Vendor application

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

## Zero-data vendor provision

The repository defines V4 as its canonical empty vendor:

`scripts/test-factory/index.ts:1060-1062`:

    // V4 is the canonical empty vendor. It must stay free of menus and all
    // transactional data so route tests exercise genuine zero-row responses.
    if (state !== 'V4') await this.ensureMenu(vendor.id, state);

The isolated development fixture namespace `audit-20260917` was successfully
created. The Vendor Playwright setup then authenticated as that vendor in
20.7 seconds.

No password or token was printed or recorded.

## Vendor Playwright run

Command environment:

- Vendor portal: `http://localhost:3002`
- API: `http://localhost:3001`
- Isolated factory namespace: `audit-20260917`

Discovery passed:

    18 specs collected across 24 projects

The run started 117 tests with one worker. It provisioned and authenticated the
V1-V11 state matrix in 2.8 minutes.

The run was not usable as broad launch evidence. The first menu project logged:

    waitForMenuReady: deleted stale session cache at
    apps/vendor/e2e/.auth/vendor.json

After that deletion, the remaining shared-session projects failed in
milliseconds. This affected menu, mobile menu, availability, delivery,
profile, share, performance, account/compliance and the empty-vendor tests.
Those failures are treated as one test-harness/session failure, not as
independent product defects.

The authoritative V1 state test did complete:

    V1 routes render their safe state without an error boundary
    1 passed, 37.0 seconds

The run then stopped producing output for over two minutes and had consumed
nearly ten minutes. It was stopped under the audit's cost-control rule. Every
V1-V11 record in the isolated namespace was then explicitly removed:

    V1 cleanedUp: true
    V2 cleanedUp: true
    V3 cleanedUp: true
    V4 cleanedUp: true
    V5 cleanedUp: true
    V6 cleanedUp: true
    V7 cleanedUp: true
    V8 cleanedUp: true
    V9 cleanedUp: true
    V10 cleanedUp: true
    V11 cleanedUp: true
    EXIT=0

## Route coverage

Vendor route denominator: 45.

Authenticated browser route visits successfully established by this phase:

- V1 state representative routes: passed.

Exact route count within that state test was not printed. Therefore the
audited route coverage is reported conservatively as NOT VERIFIED rather than
claiming 45 routes.

The required V4 checks for `/earnings`, `/account-and-compliance`,
`/compliance`, `/account-status`, `/share` and `/catering/new` did not execute
after the shared session was deleted.

## Current-source observations

- `/referrals` is intentionally retired and redirects to `/share`:
  `apps/vendor/src/app/referrals/page.tsx:1-13`.
- `/catering/new` uses `PortalShell`, includes a breadcrumb to Catering
  bookings and a Cancel link to `/catering`:
  `apps/vendor/src/app/catering/new/page.tsx:41-80`.
- Vendor menu, performance and payout screens can render raw caught
  `error.message` text:
  `apps/vendor/src/app/menu/menu-list-client.tsx:209-214`,
  `apps/vendor/src/app/analytics/analytics-client.tsx:53-59`,
  `apps/vendor/src/app/payouts/payouts-client.tsx:193-197`.

The source observations do not substitute for the required browser checks.

## Not verified

- Every route for a zero-order, zero-document, zero-dispute, zero-payout and
  no-tax-profile vendor.
- Empty states on earnings, compliance and account status.
- Referral QR availability within five seconds.
- Authenticated `/catering/new` navigation and mobile overflow.
- Application and terms acceptance.
- Stripe Connect onboarding.
- Tax-information capture.
- Menu creation with allergens and rejection without allergens.
- Availability, capacity, lead-time and delivery mutations.
- Receive, accept, reject and fulfil an order.
- Catering quote UI arithmetic and non-negative balance.
- Earnings, payouts and statement rendering.
- Disputes, profile, team, security and notifications.
- Referral link and share text.
- Mobile behaviour across the authenticated portal.

## Phase verdict

The audit could provision and authenticate a genuine zero-data vendor, which
is an improvement over being unable to create one. The required zero-data
journey still cannot be certified because the Vendor test harness destroys
the session used by its dependent projects.