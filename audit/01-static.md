# Phase 1: Static health

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

The build was run from a clean `git archive` in `/tmp` with the workspace
`node_modules` linked in. This was necessary because all three Next.js dev
servers were running, the brief prohibited restarts, and `next build` shares
mutable `.next` directories with `next dev`.

## Build

Command:

    npm run build

Result:

    Tasks: 5 successful, 5 total
    Cached: 0 cached, 5 total
    Time: 1m28.14s
    ELAPSED=90.751 seconds
    EXIT=0

This was not a clean build. All three frontends reported "Compiled with
warnings":

- Admin: 2.8 seconds
- Vendor: 2.6 seconds
- Web: 36.9 seconds

Confirmed build warnings included:

- Admin: three `<img>` optimisation warnings and one unstable `useMemo`
  dependency warning.
- Vendor: two missing or unstable hook dependency warnings, one unstable
  `useMemo` input warning and two `<img>` warnings.
- Web: one `<img>` warning and an edge-runtime static-generation warning.
- Web sitemap generation received HTTP 400 from the vendor fetch and printed
  `[sitemap] vendor fetch returned 400; skipping vendor URLs`.
- The package tree generated module-format and browser/server dependency
  warnings involving Supabase dependencies.

The complete command output was captured locally at
`/tmp/feastpot-phase1-build.out` during the audit.

## Typecheck

Command:

    npm run typecheck

Result:

    Tasks: 7 successful, 7 total
    Cached: 1 cached, 7 total
    Time: 18.523s
    ELAPSED=18.823 seconds
    EXIT=0

No type errors or typecheck warnings were printed.

## Lint

Command:

    npm run lint

Result:

    Tasks: 7 successful, 7 total
    Cached: 0 cached, 7 total
    Time: 25.293s
    ELAPSED=25.633 seconds
    EXIT=0

This was not clean:

- API: 202 problems, 0 errors and 202 warnings.
- Admin, vendor and web each printed that `next lint` is deprecated.
- Frontend warnings included unoptimised images and React hook dependency
  concerns.

The complete command output was captured locally at
`/tmp/feastpot-phase1-lint.out`.

## Dependency audit

Command:

    npm audit

Result:

    13 vulnerabilities (3 moderate, 10 high)
    EXIT=1

Packages reported:

- High: `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `multer`,
  `nanoid`, `postcss`, `sharp`.
- Moderate: `baseline-browser-mapping`, `qs`.

The report says some fixes require breaking framework upgrades. No
`npm audit fix` command was run.

Launch relevance:

- `multer` includes denial-of-service, file-descriptor leak and file-size
  limit bypass advisories on a platform with multiple upload endpoints.
- `sharp` includes inherited libvips and libheif vulnerabilities and the
  platform is specifically expected to process HEIC vendor images.
- `fast-uri` includes host-confusion and SSRF advisories.

The complete report was captured at `/tmp/feastpot-phase1-audit.out`.

## Tracked secret scan

Read-only tracked-file scans found no private-key header or recognisable live
provider credential outside examples and tests. Stripe-looking literals were
test-only values at
`apps/api/src/modules/payments/stripe-webhook.controller.spec.ts:76,164,167`.

No secret values are reproduced in this audit.

## Environment contract

Environment reads were extracted from the applications, scripts and Prisma
code and compared with the root and application `.env.example` files.

Undocumented names found:

    ADMIN_E2E_ALLOW_AAL1
    API_URL
    CI
    DATABASE_URL
    NEXT_PUBLIC_ADMIN_REQUIRE_AAL2
    NEXT_PUBLIC_BUILD_SHA
    NEXT_PUBLIC_SENTRY_DSN
    NEXT_PUBLIC_VENDOR_PORTAL_URL
    NEXT_PUBLIC_WEB_URL
    PROD_DATABASE_URL
    PROD_DIRECT_URL
    PROD_SUPABASE_URL
    PRODUCTION_SUPABASE_URL
    SEED_VOLUME
    TEST_FACTORY_STATES
    WEB_URL

Evidence includes:

- `apps/admin/src/lib/auth/mfa-enforcement.ts:9` reads
  `NEXT_PUBLIC_ADMIN_REQUIRE_AAL2`.
- `scripts/test-factory/index.ts:201,220,340-362` reads the production and
  factory database variables.
- `prisma/seed.ts:2644` reads `SEED_VOLUME`.
- `scripts/test-factory/cli.ts:8` reads `TEST_FACTORY_STATES`.
- `apps/web/src/app/(auth)/sign-in/page.tsx:560` reads
  `NEXT_PUBLIC_BUILD_SHA`.

The client-visible MFA flag is not itself a secret, but must not be the
authoritative enforcement control. Phase 8 must verify that the server-side
`ADMIN_REQUIRE_AAL2` gate is effective.

## Unfinished work markers

The read-only marker scan found 14 meaningful source lines, with no TODO,
FIXME or HACK markers and one test/example XXX value. Load-bearing limitations
included:

- `prisma/migrations/20260814110000_vendor_verification_notification_tracking/migration.sql:8`
  documents email-only notification tracking "for now".
- `apps/vendor/src/app/onboarding/onboarding-client.tsx:243` says profile
  editing remains in Admin rather than the vendor portal.
- `apps/web/src/app/orders/[id]/review/page.tsx:244` says review detail is not
  stored separately and contributes to the overall rating.

Other hits were product copy, comments, test scope or example phone/URL values.

## Em dash guard

A U+2014 scan of tracked source found 14 occurrences across six files. They
were comments or operator documentation, not verified user-facing content.

`.husky/pre-commit:1-20` blocks new em dashes in staged additions, but CI does
not run that hook. Workspace lint is run across all workspaces through Turbo
at `.github/workflows/ci.yml:83-108`, but no dedicated CI U+2014 check was
found. Therefore the stated rule is locally guarded but not independently
enforced in CI.

## User-facing error leakage

Confirmed paths render raw internal or provider-derived messages:

1. `apps/vendor/src/app/menu/menu-list-client.tsx:209-214` renders the caught
   `error.message` on `/menu`.
2. `apps/vendor/src/app/analytics/analytics-client.tsx:53-59` renders
   `error.message` on `/performance`.
3. `apps/vendor/src/app/payouts/payouts-client.tsx:193-197` renders
   `error.message` on `/payouts`.
4. `apps/api/src/modules/compliance/compliance.service.ts:94-100` promotes the
   Supabase storage provider's `error.message` into a `BadRequestException`.
5. `apps/web/src/app/account/addresses/page.tsx:29-39` renders arbitrary API
   error text for address deletion except for one specially mapped code.

The shared API client preserves server JSON message text at
`apps/web/src/lib/api/client.ts:99-109`; the vendor client follows the same
pattern.

No verified stack trace was found rendered to users. Exhaustive empty-dataset
behaviour is NOT VERIFIED at this phase. Positive examples include the vendor
empty-screen assertions at `apps/vendor/e2e/empty-vendor-screen.spec.ts:14-26`
and customer vendor-search empty handling at
`apps/web/src/app/vendors/page.tsx:233-236`.
