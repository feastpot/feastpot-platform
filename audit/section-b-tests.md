# Phase 2: Test suite and CI reality check

Audit date: 2026-08-25  
Scope: read-only audit. No application, test, workflow, dependency, or configuration files were changed.

## Headline finding

**Customer checkout is the user journey most likely to break in production without CI noticing.**

No customer checkout browser specification exists under `apps/web/e2e`, and `.github/workflows/ci.yml` invokes only the vendor Playwright suite. The API unit suite contains payment, refund, and order tests, but it does not prove that a customer can select a vendor, submit an order, pay, and see a confirmed order in a browser. There is therefore no merge gate for the customer purchase path.

The same customer browser suite that does exist is currently not run by CI and fails locally: `34 passed, 35 failed, 8 skipped`.

## 2.1 Every defined test command

Commands below were executed from the repository root on 2026-08-25. Durations are wall-clock durations measured by the audit runner. "No count" means the command is interactive, a report server, an aggregate that stopped before a valid aggregate result, or a smoke script that does not expose test-runner counters.

| Package | Exact command                                          | Result                     |                Passed |                Failed |            Skipped | Duration | Evidence                                                                                                                                                              |
| ------- | ------------------------------------------------------ | -------------------------- | --------------------: | --------------------: | -----------------: | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| root    | `npm run test`                                         | failed                     | 779 child-test passes | 2 child-test failures |                 27 |      17s | Turbo stopped on API. API reported `763 passed, 2 failed, 27 skipped`; web reported `16 passed`.                                                                      |
| root    | `npm run test:e2e`                                     | failed                     |    no valid aggregate |    no valid aggregate | no valid aggregate |       3s | Admin browser was unavailable before its installer ran, vendor failed test collection, and Turbo cancelled web.                                                       |
| root    | `npm run smoke-test`                                   | passed                     |              no count |              no count |           no count |      73s | Script printed `All smoke tests passed!` after its external order lifecycle.                                                                                          |
| admin   | `npm run test:unit --workspace=@feastpot/admin`        | failed                     |                     0 |                     1 |                  0 |       1s | `ts-node` cannot resolve `@feastpot/config/tsconfig/nextjs` (`TS6053`).                                                                                               |
| admin   | `npm run test:e2e --workspace=@feastpot/admin`         | passed, but mostly skipped |                     1 |                     0 |                  4 |      55s | Auth setup passed by calling `test.skip` because `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` were absent; all selected debounce specs skipped.                       |
| API     | `npm run test --workspace=@feastpot/api`               | failed                     |                   786 |                     1 |                  5 |      31s | `GET /v1/vendors/not-a-uuid` returned 200 where `vendors.controller.spec.ts` expects 400.                                                                             |
| vendor  | `npm run test --workspace=@feastpot/vendor`            | passed without tests       |                     0 |                     0 |                  0 |       1s | The script only prints `[vendor] no unit tests - run test:e2e for the Playwright suite`.                                                                              |
| vendor  | `npm run test:e2e --workspace=@feastpot/vendor`        | failed before execution    |                     0 |                     0 |                  0 |       2s | Playwright collection stops on `e2e/helpers/verification-banner-mocks.ts:146`. The JSDoc text `/vendors/*/verification` contains `*/`, terminating the comment early. |
| vendor  | `npm run test:e2e:ui --workspace=@feastpot/vendor`     | timed out                  |              no count |              no count |           no count |      35s | `playwright test --ui` starts an interactive server and cannot complete in a non-interactive CI-like runner.                                                          |
| vendor  | `npm run test:e2e:report --workspace=@feastpot/vendor` | timed out                  |              no count |              no count |           no count |      35s | `playwright show-report e2e-report` served a report at port 9323 and waited for manual termination.                                                                   |
| web     | `npm run test --workspace=@feastpot/web`               | passed                     |                    16 |                     0 |                  0 |       5s | 3 Jest suites passed.                                                                                                                                                 |
| web     | `npm run test:e2e --workspace=@feastpot/web`           | failed                     |                    34 |                    35 |                  8 |     187s | 77 browser tests were selected. Failures include auth, registration, and alert assertions.                                                                            |
| web     | `npm run test:e2e:auth --workspace=@feastpot/web`      | failed                     |                    27 |                    25 |                  8 |      89s | 60 auth-only browser tests were selected. Static subdomain checks also build incorrect paths such as `apps/web/apps/web/...` and fail with `ENOENT`.                  |
| web     | `npm run test:e2e:ui --workspace=@feastpot/web`        | timed out                  |              no count |              no count |           no count |      35s | `playwright test --ui` requires a human session and does not produce a CI result.                                                                                     |

`npm run ci` was not included in the table because it is a broader composite command, not a test-named script. The root `smoke-test` was included because it is test-named.

### Failures that are not merely infrastructure noise

1. API unit testing currently detects a real route contract regression: `apps/api/src/modules/vendors/vendors.controller.spec.ts:173` expects invalid vendor IDs to be rejected with HTTP 400, but the current controller returns HTTP 200.
2. The entire vendor browser suite is syntactically un-runnable. The comment issue in `apps/vendor/e2e/helpers/verification-banner-mocks.ts:146` prevents any configured vendor Playwright project from collecting tests.
3. The admin's only unit-test command does not compile because its TypeScript configuration cannot resolve a shared config path.
4. The customer web browser suite has 35 actual failures, not just credential skips. It is not currently a CI job.

## 2.2 `--passWithNoTests`

`--passWithNoTests` appears in two workspace test commands:

| Workspace | Script                   | Has checked-in tests now?                                   | Finding                                                                                                                                                                         |
| --------- | ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API       | `jest --passWithNoTests` | Yes. 57 `.spec.ts` files were discovered in `apps/api/src`. | **This workspace can pass CI with no tests at all.** It currently has substantial tests, but a future test-discovery/configuration break can become green rather than fail.     |
| web       | `jest --passWithNoTests` | Yes. 3 Jest suites were selected and 16 tests passed.       | **This workspace can pass CI with no tests at all.** Its Jest `testMatch` is limited to `**/__tests__/**/*.test.ts`; tests outside that pattern do not protect the CI test job. |

Vendor does not use `--passWithNoTests`, but its `test` script is explicitly an echo command. It also passes with zero unit tests, by design.

## 2.3 Coverage honesty

### What CI claims

The CI job name at `.github/workflows/ci.yml:247` is `Test (coverage >= 70%)`. The command at lines 301-305 is:

```yaml
run: npx turbo run test -- --coverage --ci
```

The adjacent comment says each workspace should enforce a threshold in Jest or Vitest configuration.

### What is actually enforced

Neither `apps/api/jest.config.js` nor `apps/web/jest.config.js` defines `coverageThreshold`. Admin and vendor have no Jest or Vitest configuration and no coverage-producing `test` script. `turbo.json` declares `coverage/**` as an output for the generic test task, which caches artefacts but does not enforce a percentage.

**Finding: the checked-in code does not enforce the advertised 70% coverage threshold in any workspace.** The job can fail because tests fail, but not because coverage is below 70%.

### Measured coverage

Additional audit-only invocations used the same coverage flags CI supplies:

| Workspace       | Command                                                     | Result         | Statements | Branches | Functions |  Lines | Interpretation                                                                                                     |
| --------------- | ----------------------------------------------------------- | -------------- | ---------: | -------: | --------: | -----: | ------------------------------------------------------------------------------------------------------------------ |
| API             | `npm run test --workspace=@feastpot/api -- --coverage --ci` | failed: 1 test |     41.83% |   34.74% |    16.64% | 41.71% | Far below the job's claimed 70%; no threshold converted this into a coverage failure.                              |
| web             | `npm run test --workspace=@feastpot/web -- --coverage --ci` | passed         |       100% |     100% |      100% |   100% | Misleadingly narrow: the report lists only `feastpass-callout.ts`. It is not repository-wide application coverage. |
| admin           | no generic `test` script                                    | not measured   |        n/a |      n/a |       n/a |    n/a | `test:unit` failed before test execution and CI's Turbo command does not invoke it.                                |
| vendor          | generic `test` is an echo                                   | not measured   |        n/a |      n/a |       n/a |    n/a | No unit test runner or coverage reporter exists.                                                                   |
| shared packages | no test scripts                                             | not measured   |        n/a |      n/a |       n/a |    n/a | Not part of the generic CI test command.                                                                           |

## 2.4 What CI actually gates

GitHub branch-protection settings are not stored in this repository, so the actual required-check configuration is **NOT VERIFIED**. The comment at `.github/workflows/ci.yml:5-6` states that `typecheck`, `lint`, `prisma-validate`, `test`, and `build` are required. The same file says at lines 324-326 that `e2e-vendor` still needs to be manually added to branch protection. That is evidence that vendor E2E cannot be claimed as required from source control alone.

### CI workflow jobs

| Workflow and job                                             | What it runs                                                             | Required to merge main?                                    | User journey protected                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml` / `setup`                                           | Dependency install and Turbo cache                                       | no quality assertion                                       | None directly                                                                                                            |
| `ci.yml` / `typecheck`                                       | Prisma generation and all-workspace TypeScript check                     | stated as required in comment; actual setting not verified | Compile-time safety across all applications                                                                              |
| `ci.yml` / `lint`                                            | ESLint, Prettier, text guards, refund-path script                        | stated as required in comment; actual setting not verified | Code-quality and selected refund-path invariants, not a user flow                                                        |
| `ci.yml` / `prisma-validate`                                 | Prisma validate, format, migration diff on throwaway Postgres            | stated as required in comment; actual setting not verified | Database schema and migration deployment safety                                                                          |
| `ci.yml` / `test`                                            | `npx turbo run test -- --coverage --ci`                                  | stated as required in comment; actual setting not verified | API and web Jest tests only. It does not run admin's `test:unit`, any browser test, or vendor E2E.                       |
| `ci.yml` / `e2e-vendor`                                      | Vendor Playwright with seeded credentials and special AV2/D3 skip checks | **not verified and source says it must be manually added** | Vendor portal screens and two real-API discoverability/capacity checks, if secrets are available and collection succeeds |
| `ci.yml` / `rls-check`                                       | RLS SQL audit plus denial script against development database            | not listed as required; actual setting not verified        | Direct database access control                                                                                           |
| `ci.yml` / `build`                                           | All-workspace build                                                      | stated as required in comment; actual setting not verified | Buildability, not a completed user journey                                                                               |
| `deploy.yml` / `typecheck`, `deploy-database`, `build-api`   | Typecheck, production migration, API build after a push to main          | not a PR merge gate                                        | Deployment readiness and migration application                                                                           |
| `deploy.yml` / `deploy-web`, `deploy-vendor`, `deploy-admin` | Vercel deploy hooks                                                      | not a PR merge gate                                        | Publication only                                                                                                         |
| `deploy.yml` / `smoke-test`                                  | HTTP checks for API health and HTTP reachability of all three frontends  | not a PR merge gate                                        | Availability only; it does not perform a signed-in or payment action                                                     |
| `nightly-smoke.yml` / `smoke`                                | API vendor-onboarding smoke, then refund/chargeback concurrency test     | nightly/manual only, not a PR merge gate                   | Vendor onboarding and over-refund safety, when test secrets exist                                                        |
| `neon-branch.yml` / `create`, `destroy`, `cleanup`           | Create/migrate/delete/clean Neon PR branches                             | no test gate                                               | Temporary database environment lifecycle                                                                                 |

### Direct answers

| Critical journey  | Gate status                                 | Evidence                                                                                                                                                            |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer checkout | **No browser gate.**                        | No checkout E2E spec exists in `apps/web/e2e`; `ci.yml` invokes vendor Playwright only.                                                                             |
| Admin panel       | **No meaningful browser gate.**             | The admin config selects only `auth.setup.ts` and `debounce.spec.ts`; CI does not invoke admin Playwright or `test:unit`.                                           |
| Vendor portal     | **Conditional and not proven required.**    | `e2e-vendor` exists, but branch protection is not checked in, fork PRs skip it, and local collection currently fails before any test executes.                      |
| Payment paths     | **API unit coverage only, not end-to-end.** | API tests include payment/refund/chargeback services. There is no customer checkout or Stripe browser flow in CI. The nightly over-refund test is not a merge gate. |

## 2.5 Playwright project configuration

### Admin: uncovered specs

`apps/admin/playwright.config.ts:36-53` defines only:

1. `setup`, matching `auth.setup.ts`
2. `debounce`, matching `debounce.spec.ts` and depending on setup

Checked-in admin specs are:

| Spec                       | Covered by a runnable configured project? |
| -------------------------- | ----------------------------------------- |
| `e2e/debounce.spec.ts`     | Yes, `debounce`                           |
| `e2e/admin-shell.spec.ts`  | **No**                                    |
| `e2e/catering-sla.spec.ts` | **No**                                    |
| `e2e/vendors.spec.ts`      | **No**                                    |

The three unmatched files appear to be tests but Playwright never selects them with the current configuration.

### Vendor: projects cover every present spec, but collection prevents execution

`apps/vendor/playwright.config.ts:45-176` defines `setup` plus projects matching all ten present specs:

- `menu-screen` and `menu-screen-mobile` both select `menu-screen.spec.ts`
- `availability-screen`
- `delivery-screen`
- `profile-screen`
- `verification-state-banner`
- `orders-screen`
- `share-screen`
- `performance-screen`
- `account-compliance-screen`
- `cross-cutting`

No checked-in vendor `.spec.ts` is unmatched. However, none can currently run because the comment parse error described in section 2.1 stops collection first.

### Web: one project selects all present specs

`apps/web/playwright.config.ts:13-42` has `testDir: './e2e'` and one `chromium` project without a restrictive `testMatch`. It selects all 12 present web browser specs, including nine auth specs. This selection is not invoked by the PR CI workflow.

## 2.6 Skip-when-auth-absent and similar patterns

The following tests can be skipped because credentials or an external precondition are absent:

| Area                            | Location                                                                                                                                                                                              | Skip condition                                        | What it would have tested                                              | CI effect                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Admin E2E setup                 | `apps/admin/e2e/auth.setup.ts:18-24`                                                                                                                                                                  | `TEST_ADMIN_EMAIL` or `TEST_ADMIN_PASSWORD` absent    | Sign in as staff and create storage state                              | Setup reports as passed after skipping; selected debounce tests then skip. CI does not run admin Playwright. |
| Admin shell                     | `apps/admin/e2e/admin-shell.spec.ts:69`                                                                                                                                                               | No authenticated session                              | Admin shell                                                            | Also unmatched by the current config.                                                                        |
| Admin vendors                   | `apps/admin/e2e/vendors.spec.ts:23`                                                                                                                                                                   | No authenticated session                              | Vendor-management screen                                               | Also unmatched by the current config.                                                                        |
| Admin debounce                  | `apps/admin/e2e/debounce.spec.ts:42`                                                                                                                                                                  | No authenticated session                              | Search request-debouncing                                              | Four tests skipped in this audit.                                                                            |
| Admin catering SLA              | `apps/admin/e2e/catering-sla.spec.ts:125,143,161,186`                                                                                                                                                 | Server-side auth unavailable                          | Catering triage SLA experience                                         | Also unmatched by the current config.                                                                        |
| Vendor E2E workflow             | `ci.yml:365-370`                                                                                                                                                                                      | Vendor credentials unavailable, notably fork PRs      | Entire vendor browser suite                                            | CI job exits successfully with a visible notice. It tests nothing for that PR.                               |
| Vendor availability             | `apps/vendor/e2e/availability-screen.spec.ts:146-157,271-279`                                                                                                                                         | Missing `TEST_API_URL` or `TEST_VENDOR_ID`            | AV2/AV3 real API capacity and public daily-cap checks                  | Workflow post-processes results and fails if AV2/AV3 are skipped.                                            |
| Vendor delivery                 | `apps/vendor/e2e/delivery-screen.spec.ts:263-276`                                                                                                                                                     | Missing `TEST_API_URL` or `TEST_VENDOR_ID`            | D3 customer discoverability based on saved postcodes                   | Workflow post-processes results and fails if D3 is skipped.                                                  |
| Vendor mobile menu              | `apps/vendor/e2e/menu-screen.spec.ts:817`                                                                                                                                                             | Not running the mobile project                        | Mobile-only T10 behaviour                                              | Deliberate project-specific skip.                                                                            |
| Web real email                  | `apps/web/e2e/auth/helpers/mail.ts:22-34` and callers                                                                                                                                                 | Missing Mailosaur credentials                         | Delivered confirmation, reset, resend, and email-link behaviour        | Web Playwright is not run in CI, so these skips are not surfaced by a PR check.                              |
| Web runtime subdomain isolation | `apps/web/e2e/auth/i-subdomain-isolation.spec.ts:113-116`                                                                                                                                             | Missing `TEST_VENDOR_BASE_URL` on a distinct hostname | I2/I4 runtime session isolation between customer and vendor subdomains | Skips locally and is not in CI.                                                                              |
| Web OAuth                       | `apps/web/e2e/auth/g-oauth.spec.ts:114`                                                                                                                                                               | Explicitly manual/unsupported provider journey        | Real OAuth provider flow                                               | Not CI-gated.                                                                                                |
| Web register build check        | `apps/web/e2e/register.spec.ts:308`                                                                                                                                                                   | Required local `.next` artefact absent                | Registration UI flow                                                   | Not CI-gated.                                                                                                |
| API vendor onboarding smoke     | `apps/api/src/e2e/vendor-onboarding-smoke.spec.ts:46`                                                                                                                                                 | Required test admin and Supabase variables absent     | Full API vendor onboarding                                             | Not in PR CI; scheduled workflow supplies secrets.                                                           |
| API database integrations       | `orders-discount-constraint.integration.spec.ts:18`, `refund-chargeback-concurrency.integration.spec.ts:37`, `vendor-referral-chain.integration.spec.ts:23`, `delivery-search.integration.spec.ts:39` | `SUPABASE_DB_URL` absent                              | Database-backed order, refund, referral, and search behaviour          | They can skip outside the provisioned CI database.                                                           |

The vendor workflow has explicit protections for only AV2, AV3, and D3. Other vendor skips can still reduce suite coverage without a dedicated post-run failure.

## 2.7 Contract-test coverage

| Contract area                        | Status                  | Evidence and limitation                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp template slot counts        | Present and strong      | `apps/api/src/modules/notifications/whatsapp-template-contract.spec.ts:90-100` verifies every builder's expected slot count and non-empty slot values; the same file also checks registry and Content SID environment-variable consistency.                                                                                                 |
| Email template rendering             | Partial                 | `vendor-application-received.template.spec.ts:24-61` checks a single vendor-application email for representative fixture values, fallbacks, and escaping. There is no demonstrated all-email-template contract that renders every template with a full fixture, requires a non-empty subject and body, and rejects unresolved placeholders. |
| API response shapes consumed by apps | Partial and distributed | Individual tests assert selected shapes, such as vendor trust signals, thin vendor-onboarding projections, order visibility, and error fields. There is no dedicated consumer-driven or schema-compatibility contract suite covering all web, vendor, and admin API responses.                                                              |

## Conclusion

The repository contains meaningful API unit coverage and a well-structured WhatsApp template contract, but the CI signal currently overstates its protection:

1. The claimed 70% coverage threshold is not enforced, and measured API statement coverage is 41.83%.
2. Admin testing is not part of the generic CI test command; three admin E2E spec files are not assigned to a Playwright project.
3. Vendor E2E is neither verifiably merge-required nor currently collectable.
4. Customer web E2E is not run by CI and currently has 35 failures.
5. The purchase path has no browser specification at all.
