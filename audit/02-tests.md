# Phase 2: Test suite reality

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

## Test script inventory

Root:

- `test`: `turbo run test`
- `test:e2e`: `turbo run test:e2e`
- `test:factory` and `test:factory:create`: create test-factory data
- `test:factory:teardown`: deletes test-factory data

Admin:

- `test:unit`
- `test:e2e`
- `test:e2e:discovery`

API:

- `test`
- `test:financial`

Vendor:

- `test`: an unconditional echo saying there are no unit tests
- `test:e2e`
- `test:e2e:discovery`
- `test:e2e:ui`: interactive
- `test:e2e:report`: report viewer

Web:

- `test`
- `test:e2e`
- `test:e2e:discovery`
- `test:e2e:auth`
- `test:e2e:ui`: interactive

Factory creation/teardown and interactive UI/report commands were not run as
test checks. The factory commands mutate shared data; UI/report commands do
not terminate as automated audit checks.

## Root tests

Command:

    npm test

Result:

    Test Suites: 5 skipped, 98 passed, 98 of 103 total
    Tests: 283 skipped, 1175 passed, 1458 total
    Snapshots: 0 total
    Time: 30.441 s
    Tasks: 4 successful, 4 total
    ELAPSED=33.738 seconds
    EXIT=0

Turbo also warned that no output files were configured for API, Vendor and Web
test tasks.

The 283 skipped tests are material. They include credential-controlled API
integration suites rather than merely unsupported-platform tests.

## Admin unit tests

Command:

    npm run test:unit --workspace=@feastpot/admin

Result:

    tests 11
    suites 3
    pass 11
    fail 0
    skipped 0
    duration_ms 460.64775
    ELAPSED=1.254 seconds
    EXIT=0

Root `npm test` does not run these tests because Admin has no ordinary `test`
script.

## Financial tests

Command:

    npm run test:financial --workspace=@feastpot/api

Result:

    Test Suites: 8 passed, 8 total
    Tests: 123 passed, 123 total
    Snapshots: 0 total
    Time: 20.73 s
    ELAPSED=21.419 seconds
    EXIT=0

This suite covers commission, refunds, Stripe webhook processing, financial
reconciliation, catering refund reconciliation, refund/chargeback concurrency,
payouts and payout statements.

## Playwright discovery

Commands:

    npm run test:e2e:discovery --workspace=@feastpot/admin
    npm run test:e2e:discovery --workspace=@feastpot/vendor
    npm run test:e2e:discovery --workspace=@feastpot/web

Results:

- Admin: 7 specs across 9 projects.
- Vendor: 18 specs across 24 projects.
- Web: 18 specs across 1 project.
- Orphan spec count reported by the discovery guards: zero.
- Combined command exit: zero.

Source inspection also found the Admin cross-surface specs are owned by their
separate Part A and cross-surface Playwright configurations.

## Complete browser command

Command:

    npm run test:e2e

Result:

    Vendor: 3 failed, 113 did not run, 1 passed
    Admin: 2 failed, 1 interrupted, 770 did not run, 2 passed
    Web: interrupted by Turbo after Vendor failed
    Tasks: 1 successful, 4 total
    Time: 10.542s
    ELAPSED=10.968 seconds
    EXIT=1

Concrete failures:

1. Admin destination-map test failed:

       /platform-facts must be represented in ADMIN_DESTINATION_ROLES or
       explicitly excluded

   Evidence:
   `apps/admin/e2e/admin-destination-map.spec.ts:47-59`.

2. Admin and Vendor setup could not launch the expected Playwright Chromium
   executable:

       Executable doesn't exist at
       /home/runner/.cache/ms-playwright/chromium_headless_shell-1234/...

3. Vendor lifecycle evidence failed closed because
   `TEST_FACTORY_NAMESPACE` was absent.

The unchanged command was not rerun because it contained a deterministic
Admin inventory failure and missing prerequisites. Broad browser coverage is
therefore NOT VERIFIED.

## Coverage

API configured global thresholds at `apps/api/jest.config.js:10-19`:

- Statements: 44%
- Branches: 36%
- Functions: 20%
- Lines: 44%

The config comment records a prior baseline of 44.10%, 36.09%, 20.61% and
44.21%, but current measured API coverage is NOT VERIFIED. The coverage run
did not complete within the five-minute command limit.

Web configured global thresholds at `apps/web/jest.config.js:18-26`:

- Statements: 0.8%
- Branches: 1.3%
- Functions: 0.4%
- Lines: 0.5%

Measured current Web coverage:

    Statements: 0.86%
    Branches: 0.87%
    Functions: 0.43%
    Lines: 0.58%

All 17 Web tests passed, but the coverage command failed because branch
coverage is below the configured 1.3% threshold.

Admin and Vendor have no configured coverage threshold. Vendor has no unit
test runner. Admin has only the separately named 11-test Node suite.

No `--passWithNoTests` occurrence was found. Vendor achieves a successful unit
test task with an echo instead.

## Credential-controlled skips

Confirmed examples:

- API role matrix, vendor onboarding, cross-surface reverse propagation and
  authoritative Admin suites skip when their Supabase/database/factory
  credentials are absent:
  `apps/api/src/e2e/role-matrix-acceptance.spec.ts:12-24`,
  `apps/api/src/e2e/vendor-onboarding-smoke.spec.ts:34-49`,
  `apps/api/src/e2e/cross-surface-reverse-propagation.spec.ts:27-34`,
  `apps/api/src/e2e/admin-authoritative-actions.spec.ts:28-34`.
- Vendor lifecycle skips without authenticated vendor state:
  `apps/vendor/e2e/vendor-lifecycle.spec.ts:19-22`.
- Vendor delivery and availability integration assertions skip without
  `TEST_API_URL` and `TEST_VENDOR_ID`:
  `apps/vendor/e2e/delivery-screen.spec.ts:293-304`,
  `apps/vendor/e2e/availability-screen.spec.ts:149-160,274-280`.
- Admin shell, vendors, compliance and debounce specs skip without Admin
  credentials or valid storage state:
  `apps/admin/e2e/admin-shell.spec.ts:64-68`,
  `apps/admin/e2e/vendors.spec.ts:20-24`,
  `apps/admin/e2e/admin-compliance.spec.ts:14-18`,
  `apps/admin/e2e/debounce.spec.ts:39-43`.
- Admin catering SLA has four explicit SSR-auth skips:
  `apps/admin/e2e/catering-sla.spec.ts:128-130,146-148,164-166,189-191`.
- Web real-email tests skip without Mailosaur credentials:
  `apps/web/e2e/auth/helpers/mail.ts:31-37`.
- Web OAuth consent is manual:
  `apps/web/e2e/auth/g-oauth.spec.ts:113-117`.
- Web subdomain isolation skips without a distinct vendor base hostname:
  `apps/web/e2e/auth/i-subdomain-isolation.spec.ts:115-118`.

## Required CI journey gates

Source inspection of `.github/workflows/ci.yml` and
`.github/branch-protection.main.json` found:

- Customer checkout: required `E2E (customer checkout)`, including the real
  Stripe smoke path.
- Admin: required `E2E (admin portal, all projects)`.
- Financial paths: required `Financial suite`.
- Vendor: a serious configuration mismatch exists. Branch protection names
  `E2E (vendor portal, all projects)`, while the current workflow job is named
  `E2E (vendor authoritative lifecycle)` at
  `.github/workflows/ci.yml:425-427`.

The actual GitHub branch-protection state was not queried in this local-only
audit. Until verified, the Vendor PR gate must not be assumed effective.

Nightly smoke checks are supplemental and not PR-required. Production
deployment smoke tests only curl the four surfaces; they do not exercise
authenticated checkout or payment journeys.