# Phase 3: Customer application

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

## Route coverage

All 50 filesystem page routes were loaded with real Chromium at:

- Desktop: 1280 by 800
- Mobile: 375 by 812

Coverage:

- Desktop: 50/50
- Mobile: 50/50
- Screenshots: 100

Evidence is under `audit/evidence/customer/`, named by viewport and route.

The first combined crawl produced 91 screenshots before the five-minute
command cap. Only the incomplete routes were then visited once; the completed
91 visits were not repeated.

The invalid dynamic vendor route used `/vendors/audit-missing-slug`. It
returned HTTP 200 but rendered a clear in-page 404 headed "We couldn't find
that page" at both viewports. This is a soft 404.

The seven final mobile route measurements all had
`scrollWidth === clientWidth === 375`, including `/vendors`, `/waitlist`,
`/status`, `/trust`, `/vendor-readiness`, `/sign-in/otp` and the invalid vendor
slug. The two final desktop routes had
`scrollWidth === clientWidth === 1280`.

The first crawl's per-route JSON summary was lost when the command reached its
five-minute cap. Its screenshots prove rendering occurred but do not preserve
HTTP status or overflow values for those 91 visits. Those properties are NOT
VERIFIED for the 91 visits.

## Customer Playwright suite

After a temporary browser-cache path correction outside the repository, the
customer suite ran for 193.053 seconds:

    37 failed
    8 skipped
    31 did not run
    51 passed
    EXIT=1

The failures span sign-up, confirmation resend, sign-in, enumeration safety,
rate limiting, OAuth error handling, multi-tab sign-out, discovery filters,
checkout financials, payment outcomes, mobile post-order journeys, refund
requests and the real Stripe purchase smoke.

Because many failures can share an authentication or fixture prerequisite,
this result does not prove 37 independent product defects. It does prove that
the current local suite cannot establish launch readiness.

## Journeys

Verified only at page-render level:

- Homepage and public browse surfaces render.
- `/vendors` renders a loading state at mobile width.
- Invalid vendor slug renders a clear fallback.
- Sign-in, OTP, registration, password-reset and account route surfaces render
  or redirect sufficiently to produce browser screenshots.
- The final measured mobile routes had no horizontal overflow.

NOT VERIFIED end to end:

- Postcode with vendors, no vendors and invalid postcode.
- Opening a real vendor and reading allergen data.
- Add, change quantity and remove basket items.
- First-price total including every mandatory fee.
- Successful Stripe test-mode payment.
- Confirmation, history and tracking against a real order.
- Order cancellation.
- Review before and after delivery.
- Address, profile, notification and FeastPass account mutations.
- Successful sign-up, sign-in, password reset and sign-out.
- Full-route horizontal-overflow status for the 91 visits whose summary was
  lost at timeout.

## Phase verdict

The public route surface renders, but the core revenue journey is not
launch-verified. The required customer Playwright suite currently fails and
the real purchase smoke did not complete.
