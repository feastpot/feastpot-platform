# Phase 3: Functional walkthrough

Audit date: 2026-08-25  
Scope: functional audit only. No application, dependency, workflow, or configuration fixes were made.

## Method and evidence

All three local applications were running during the walkthrough:

- customer web: `http://127.0.0.1:3000`
- vendor portal: `http://127.0.0.1:3002`
- admin panel: `http://127.0.0.1:3003`
- API health endpoint: `http://127.0.0.1:3001/healthz`

Playwright using the system Chromium visited every discovered Next.js `page` route. Evidence screenshots are in `audit/evidence/`. Dynamic routes used a deliberately non-existent UUID or slug where an existing record was not available. A visible "not found" result for those placeholders is not itself reported as a defect.

### Route visit total

| App | Discovered page routes | Actually visited |
| --- | ---: | ---: |
| Customer web | 49 | 49 |
| Vendor portal | 42 | 42 |
| Admin panel | 45 | 45 |
| **Total** | **136** | **136** |

Protected vendor and admin routes were visited anonymously and correctly redirected to their sign-in pages. Authenticated vendor and admin route behavior is separately marked NOT VERIFIED where the required empty platform profiles could not be safely provisioned.

## Headline findings

1. **The customer can browse, open a real vendor profile, see per-dish allergen controls, and add an item to the basket.** The basket badge changed to `1` after a real button click.
2. **The customer checkout cannot be completed in this development environment.** It visibly says: `Checkout unavailable Payments aren’t configured for this environment yet (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing).` This blocked test payment, order confirmation, and order-view verification.
3. **The mobile customer homepage has horizontal overflow at 375px.** Browser measurement was `scrollWidth: 391`, `clientWidth: 375`, a 16px overflow. The tested vendor-listing and sign-in screens did not overflow.
4. **The empty vendor-account test was blocked, not passed.** Disposable vendor and admin Auth users could sign in at the identity provider level but remained on each role-gated portal sign-in page because they had no matching platform profile. A later attempt to create matching transient platform rows through the development database was rejected; all temporary Auth accounts were deleted and no test data was retained. The vendor-only suspects therefore remain **NOT VERIFIED**, rather than inferred from source.

## 3.1 Empty-account test

### New customer account: exercised

A brand-new customer account was created, email-confirmed for the test environment, signed in through the real customer UI, exercised, and deleted after the walkthrough.

| Path | Observation | Evidence |
| --- | --- | --- |
| `/account` | Rendered an empty account page with the member and FeastPoints introduction. | `web-customer-homeaccount.png` |
| `/account/orders` | Rendered `No orders yet` with an explanatory `Browse vendors` action. | `web-customer-homeaccount_orders.png` |
| `/checkout` | Rendered, but explicitly blocked payment because the Stripe publishable key is missing. | `web-customer-homecheckout.png` |

### New vendor account: blocked before portal entry

The browser entered disposable vendor credentials in the real vendor form. The form remained on `/sign-in` after submission and did not expose a useful visible error within the observation window. The account had no matching vendor profile, orders, documents, disputes, payouts, or tax profile. A matching disposable platform profile could not be established through the development database, so no authenticated vendor page was claimed as tested.

Evidence:

- `vendor-vendor-sign-in-failed.png`
- `vendor-sign-in-readonly.png`

The earlier reported suspects were therefore neither accepted nor refuted:

| Reported suspect | Functional result |
| --- | --- |
| `/earnings` error boundary | **NOT VERIFIED**: required authenticated empty-vendor session could not be provisioned. |
| `/compliance` error boundary | **NOT VERIFIED**: same block. |
| `/account-status` "Unable to load account status" | **NOT VERIFIED**: same block. |
| `/referrals` QR stuck generating | **NOT VERIFIED**: same block. |
| `/catering/new` no sidebar | **NOT VERIFIED**: same block. |
| Catering quote total/deposit calculation | **NOT VERIFIED**: no valid catering enquiry could be created for the temporary vendor. |

### New admin session: blocked before panel entry

The same disposable-account approach left the browser at `/sign-in` because the identity had no matching staff platform profile. No admin page behavior was inferred.

Evidence: `admin-admin-sign-in-failed.png`.

## 3.2 Route-by-route browser record

`renders` means the route produced visible page content. `redirects to auth/authorization` means the anonymous browser was redirected to the relevant protected sign-in or authorization surface. `NOT VERIFIED` means Playwright navigation timed out before a result could be observed; it is not treated as working.

### web
| Route | Browser outcome |
| --- | --- |
| `/` | renders |
| `/account` | renders |
| `/account/addresses` | redirects to auth/authorization |
| `/account/addresses/:id/edit` | redirects to auth/authorization |
| `/account/addresses/new` | redirects to auth/authorization |
| `/account/feastpass` | redirects to auth/authorization |
| `/account/notifications` | redirects to auth/authorization |
| `/account/orders` | redirects to auth/authorization |
| `/account/profile` | redirects to auth/authorization |
| `/auth/confirm` | renders |
| `/auth/reset/start` | renders |
| `/auth/reset/update` | renders |
| `/become-a-vendor` | renders |
| `/caribbean-food-delivery-london` | renders |
| `/catering` | renders |
| `/checkout` | renders |
| `/events` | renders |
| `/events/:id` | 404 for deliberately non-existent ID |
| `/events/:id/confirmed` | 404 for deliberately non-existent ID |
| `/events/new` | renders |
| `/feastpass` | renders |
| `/forgot-password` | renders |
| `/ghanaian-food-delivery-london` | renders |
| `/help` | renders |
| `/join` | renders |
| `/legal` | renders |
| `/legal/allergens` | renders |
| `/legal/cookies` | renders |
| `/legal/privacy` | renders |
| `/legal/terms` | renders |
| `/legal/vendor-terms` | renders |
| `/legal/vendor-terms/history` | renders |
| `/nigerian-food-delivery-london` | renders |
| `/occasions/:slug` | NOT VERIFIED: navigation timed out |
| `/offline` | renders |
| `/orders` | renders |
| `/orders/:id/confirmation` | NOT VERIFIED: navigation timed out |
| `/orders/:id/review` | NOT VERIFIED: navigation timed out |
| `/orders/:id/tracking` | NOT VERIFIED: navigation timed out |
| `/register` | NOT VERIFIED: navigation timed out |
| `/register/create-account` | redirects to registration sign-in surface |
| `/sign-in` | renders sign-in surface |
| `/sign-in/otp` | renders OTP sign-in surface |
| `/status` | renders |
| `/trust` | renders |
| `/vendor-readiness` | renders |
| `/vendors` | renders |
| `/vendors/:slug` | renders |
| `/waitlist` | renders |

### vendor
| Route | Browser outcome |
| --- | --- |
| `/` | redirects to auth/authorization |
| `/account-and-compliance` | redirects to auth/authorization |
| `/account-status` | redirects to auth/authorization |
| `/analytics` | redirects to auth/authorization |
| `/auth/reset/start` | renders only `Preparing your link...`, little explanation |
| `/auth/reset/update` | renders |
| `/availability` | redirects to auth/authorization |
| `/catering` | redirects to auth/authorization |
| `/catering/:id/quote` | redirects to auth/authorization |
| `/catering/new` | redirects to auth/authorization |
| `/compliance` | redirects to auth/authorization |
| `/disputes` | redirects to auth/authorization |
| `/disputes/:id` | redirects to auth/authorization |
| `/earnings` | redirects to auth/authorization |
| `/events` | redirects to auth/authorization |
| `/events/:id/quote` | redirects to auth/authorization |
| `/forgot-password` | renders |
| `/help` | redirects to auth/authorization |
| `/menu` | redirects to auth/authorization |
| `/menu/:menuId` | redirects to auth/authorization |
| `/menu/:menuId/items/:itemId` | redirects to auth/authorization |
| `/notifications` | redirects to auth/authorization |
| `/onboarding` | redirects to auth/authorization |
| `/onboarding/register` | renders |
| `/onboarding/terms` | redirects to auth/authorization |
| `/onboarding/welcome` | redirects to auth/authorization |
| `/orders` | redirects to auth/authorization |
| `/orders/:id` | redirects to auth/authorization |
| `/payouts` | redirects to auth/authorization |
| `/performance` | redirects to auth/authorization |
| `/referrals` | redirects to auth/authorization |
| `/settings/close-account` | redirects to auth/authorization |
| `/settings/delivery` | redirects to auth/authorization |
| `/settings/profile` | redirects to auth/authorization |
| `/settings/security` | redirects to auth/authorization |
| `/settings/team` | redirects to auth/authorization |
| `/share` | redirects to auth/authorization |
| `/sign-in` | renders sign-in surface |
| `/tax-information` | redirects to auth/authorization |
| `/terms` | redirects to auth/authorization |
| `/unauthorized` | renders authorization surface |
| `/user-guide` | redirects to auth/authorization |

### admin
| Route | Browser outcome |
| --- | --- |
| `/` | redirects to auth/authorization |
| `/analytics` | redirects to auth/authorization |
| `/attribution` | redirects to auth/authorization |
| `/audit-log` | redirects to auth/authorization |
| `/catering` | redirects to auth/authorization |
| `/catering-bookings` | redirects to auth/authorization |
| `/catering-enquiries` | redirects to auth/authorization |
| `/chargebacks` | redirects to auth/authorization |
| `/commission-rates` | redirects to auth/authorization |
| `/compliance` | redirects to auth/authorization |
| `/coverage` | redirects to auth/authorization |
| `/dead-letters` | redirects to auth/authorization |
| `/discount-codes` | redirects to auth/authorization |
| `/disputes` | redirects to auth/authorization |
| `/disputes/:id` | redirects to auth/authorization |
| `/error-incidents` | redirects to auth/authorization |
| `/events` | redirects to auth/authorization |
| `/events/:enquiryId` | redirects to auth/authorization |
| `/feastpass-health` | redirects to auth/authorization |
| `/legal` | redirects to auth/authorization |
| `/legal/appeals` | redirects to auth/authorization |
| `/legal/coverage` | redirects to auth/authorization |
| `/legal/documents` | redirects to auth/authorization |
| `/legal/documents/:id` | redirects to auth/authorization |
| `/legal/enforcement` | redirects to auth/authorization |
| `/legal/evidence` | redirects to auth/authorization |
| `/legal/notices` | redirects to auth/authorization |
| `/menus/queue` | redirects to auth/authorization |
| `/notifications` | redirects to auth/authorization |
| `/orders` | redirects to auth/authorization |
| `/payouts` | redirects to auth/authorization |
| `/push/compose` | redirects to auth/authorization |
| `/reviews/queue` | redirects to auth/authorization |
| `/settings` | redirects to auth/authorization |
| `/settings/2fa` | redirects to auth/authorization |
| `/sign-in` | renders sign-in surface |
| `/unauthorized` | renders authorization surface |
| `/user-guide` | redirects to auth/authorization |
| `/users` | redirects to auth/authorization |
| `/vendor-applications` | redirects to auth/authorization |
| `/vendor-applications/:id` | redirects to auth/authorization |
| `/vendor-recommendations` | redirects to auth/authorization |
| `/vendors` | redirects to auth/authorization |
| `/vendors/:id` | redirects to auth/authorization |
| `/waitlist` | redirects to auth/authorization |

## 3.3 Link integrity

The browser collected and followed **61 distinct internal links** rendered from the customer home page, a resolved customer listing, customer terms, vendor sign-in, and admin sign-in. None resulted in a 404, an unexpected redirect, or a browser navigation error.

This is positive but not complete coverage of every authenticated navigation element. Vendor and admin sidebars, protected breadcrumbs, and protected in-content links are **NOT VERIFIED** because their profile-gated sessions could not be created safely. Dynamic links behind records and orders are also not claimed as covered unless listed in the route matrix.

## 3.4 Core customer journey

| Step | Observed result | Evidence |
| --- | --- | --- |
| Home page | Rendered successfully. | `customer-home.png` |
| Enter postcode with vendors | `SE15` resolved to 30 vendor-card links after 5.532s. | `customer-vendors-SE15-15s.png` |
| Open vendor profile | Opened Maman's Kitchen. The profile rendered full dish content. | `customer-vendor-profile-live.png` |
| Allergen information | The profile contained eight allergen mentions and multiple `View allergen information` controls. | `customer-vendor-profile-live.png` |
| Add a dish to basket | A real add button was clicked. The basket count changed from 0 to 1. | `customer-vendor-after-add-attempt.png` |
| Mandatory fees up front | The vendor page stated `Up to £2.99 service fee applies`. A fully populated checkout total could not be reached because payment configuration is absent. | `customer-vendor-profile-live.png`, `customer-checkout.png` |
| Test payment | **NOT VERIFIED.** Checkout explicitly reports missing `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. | `customer-checkout.png` |
| Confirmation and order view | **NOT VERIFIED.** No payment could be completed. | n/a |
| Postcode with no vendors | `ZZ99 9ZZ` reached an explicit postcode-by-postcode explanation and `Join the waitlist`, not a silent blank page. | `customer-vendors-ZZ99-9ZZ-15s.png` |

The initial listing screenshot at about 1.5s still showed loading skeletons. The later 15s evidence and timing capture are the authoritative observations.

## 3.5 Core vendor journey

The following steps are **NOT VERIFIED**, not assumed:

- submit a vendor application
- accept vendor terms
- complete onboarding or Stripe Connect
- create a dish with allergen data
- attempt a dish without allergen data
- receive, accept, and fulfil an order
- view earnings and payout statement

The reason is the empty vendor profile provisioning block documented in section 3.1. No source-only conclusion has been substituted for a browser result.

## 3.6 Mobile and accessibility

### 375px responsive checks

| Screen | Browser measurement | Result |
| --- | --- | --- |
| Customer home | 391px scroll width on a 375px client width | **Horizontal overflow observed: 16px.** |
| Customer vendor listing | 375px scroll width on a 375px client width | No horizontal overflow observed. |
| Vendor sign-in | 375px scroll width on a 375px client width | No horizontal overflow observed. |
| Admin sign-in | 375px scroll width on a 375px client width | No horizontal overflow observed. |
| Vendor dashboard and forms | n/a | **NOT VERIFIED**: authenticated vendor profile unavailable. |
| Checkout with a complete payment form | n/a | **NOT VERIFIED**: checkout configuration missing. |

Evidence includes `web-home-mobile.png`, `web-homevendors-postcode-SE15-mobile.png`, `vendor-homesign-in-mobile.png`, and `admin-homesign-in-mobile.png`.

### Accessibility

**NOT VERIFIED.** Neither `@axe-core/playwright` nor Lighthouse is installed in this environment. No score or approximate assessment is claimed.

## 3.7 Performance spot check

Timings are browser measurements from navigation start until the named visible content was ready, on the local development origins:

| Screen / criterion | Measured time |
| --- | ---: |
| Customer homepage hero visible | 592ms |
| Customer listing: first `SE15` vendor card visible | 5.532s |
| Vendor profile: first allergen control visible | 2.540s |
| No-vendor postcode: explanatory waitlist content visible | 2.910s |
| Vendor dashboard | **NOT VERIFIED**: authenticated vendor profile unavailable |
| Referral QR code from dashboard load to visible | **NOT VERIFIED**: authenticated vendor profile unavailable |

The referral QR requirement of under five seconds could not be assessed.

## Evidence index

Key screenshots:

- `customer-home.png`
- `customer-vendors-SE15-15s.png`
- `customer-vendors-ZZ99-9ZZ-15s.png`
- `customer-vendor-profile-live.png`
- `customer-vendor-after-add-attempt.png`
- `customer-checkout.png`
- `web-customer-homeaccount.png`
- `web-customer-homeaccount_orders.png`
- `web-customer-homecheckout.png`
- `vendor-vendor-sign-in-failed.png`
- `admin-admin-sign-in-failed.png`
- `web-home-mobile.png`
- `web-homevendors-postcode-SE15-mobile.png`
- `vendor-homesign-in-mobile.png`
- `admin-homesign-in-mobile.png`

## Conclusion

All 136 discovered routes were visited. The strongest observed functional gap is the untestable checkout in this environment: a customer can browse, see allergens, and add an item to the basket, but cannot proceed to payment because the public Stripe configuration is missing. The second observed gap is 16px horizontal overflow on the mobile customer homepage.

Vendor and admin protected routes correctly reject anonymous access, but their empty-account experience, vendor lifecycle, payout/earnings behavior, catering quote calculation, QR timing, protected link integrity, and accessibility scores remain **NOT VERIFIED** rather than assumed working.