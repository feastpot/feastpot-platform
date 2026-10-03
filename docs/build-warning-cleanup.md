# Build warnings and vendor sitemap verification

## Result

The frontend compilation warning baseline was 19 warnings across the customer,
vendor and admin apps. Final production compilations emit zero warnings. The
additional sitemap HTTP warning is now a hard build failure rather than a
silently incomplete sitemap.

API lint started at **226 warnings and one error**, not the previously reported 202. It now has **178 warnings and zero errors**, a reduction of 48 warnings
(21.2%). All remaining API warnings are `no-explicit-any` in test files. No
production API source has an explicit `any` warning.

## Warning inventory

Counts are individual diagnostics, not summary banners such as “Compiled with
warnings”. Source lint warnings also appear in build output and are counted only
once.

| Warning type                                            | Customer before | Vendor before | Admin before |                                    After |
| ------------------------------------------------------- | --------------: | ------------: | -----------: | ---------------------------------------: |
| `react-hooks/exhaustive-deps`                           |               0 |             3 |            1 |                                        0 |
| `@next/next/no-img-element`                             |               1 |             2 |            1 |   0 active; 4 explained local exceptions |
| Node `MODULE_TYPELESS_PACKAGE_JSON`                     |               1 |             1 |            1 |                                        0 |
| Webpack oversized-string filesystem-cache serialization |               2 |             2 |            2 |                                        0 |
| Workbox oversized asset omitted from precache           |               1 |             0 |            0 |                                        0 |
| Edge runtime disables static generation                 |               1 |             0 |            0 |                                        0 |
| Sitemap HTTP 400, vendor URLs omitted                   |               1 |             0 |            0 | 0 warnings; missing data fails the build |

### Local image exceptions

No global image rule was disabled. Each exception is adjacent to its image:

- Customer application preview: a browser-owned blob/data URL cannot be fetched
  by the server-side image optimiser.
- Vendor referral and sharing QR images: preserve original printable pixels and
  the native fallback that works before hydration.
- Staff application menu photo: a private, expiring URL must not be retained in
  the public image optimiser. This is not a customer listing image.

### Other frontend fixes

- Editor effects now include fresh initial state and a stable close callback.
  Menu filtering and payout-selection inputs have stable memoized empty arrays.
- The shared UI package explicitly declares its existing ES-module semantics.
- One-shot production webpack compilations use memory caches rather than
  serializing large strings into filesystem packs. Development retains Next's
  existing HMR cache. The tradeoff is that repeated production compilations
  cannot reuse webpack filesystem intermediates; Turbo still caches eligible
  complete builds.
- The browser-side HEIC converter has a stable split-chunk name and is
  deliberately excluded from Workbox precaching. It stays lazy-loaded when
  needed; no server-side decoding was added and no precache size limit was
  raised. It was already omitted by Workbox's previous size limit.
- Social-card routes use the Node runtime. The generic image can be prerendered;
  the vendor lookup can honour its existing five-minute revalidation setting.
- Frontend lint uses ESLint directly, avoiding the deprecated `next lint`
  command, and fails on any new unsuppressed warning.
- The lint parser and matching rules package now officially support the
  installed TypeScript version. Three frontend lint invocations initially
  exposed the unsupported-version warning; it is now zero, without suppressing
  parser diagnostics. Newly exposed strict-rule errors were fixed using typed
  imports, inferred mock shapes and removal of unused catch bindings. The
  CommonJS lint-rule test has a local explanation for its intentional `require`.

## API lint by rule

| Rule                                       |  Before |   After |
| ------------------------------------------ | ------: | ------: |
| `@typescript-eslint/no-explicit-any`       |     186 |     178 |
| `import/no-named-as-default-member`        |      40 |       0 |
| Total warnings                             | **226** | **178** |
| `@typescript-eslint/no-unused-vars` errors |       1 |       0 |

Priority was production money and authentication code:

- Payout PDF rendering now uses PDFKit's installed types instead of seven
  handwritten `any` return types.
- Password-change notifications use the verified `AuthUser.email`, not a cast
  to arbitrary user metadata.
- Namespace imports make Express, Web Push and TypeScript API access explicit.
- Unused environment-inventory code was removed from the role-matrix test.

The remaining 178 warnings are in test mocks and fixtures. They were not broadly
suppressed or replaced with unchecked casts just to improve the count. Upload
production paths have no explicit `any` warnings. React hook and image rules
apply to the frontend inventory above, not this NestJS API.

## Sitemap diagnosis and safeguards

The public vendor-search API accepts at most 100 rows per request and returns
`{ data, nextCursor }`. The old request used `limit=1000`, triggering validation
HTTP 400. Its catch-and-warn fallback then returned only occasion URLs.

The replacement:

1. Requests `limit=100&status=live`, following every returned cursor.
2. Uses the public catalogue's existing publication gates, without staff access
   or bypasses. Public demo kitchens are not treated as live commercial sellers.
3. Rejects HTTP/network errors, malformed envelopes, invalid profiles, repeated
   cursors, duplicate profiles and an empty eligible catalogue.
4. Removes stale sitemap XML before fetching.
5. Calls the generator's throwing entry point: its normal CLI catches errors
   without setting a failing process exit code.
6. Validates generated XML, namespaces, the index, absolute URLs, duplicates,
   protocol limits and every required vendor and occasion location.
7. Disables the web build's Turbo cache: a cached successful build must not
   bypass this live-data gate. Sitemap API and site URLs are explicit task
   environment inputs.

`npm run test:sitemap --workspace=@feastpot/web` runs the regression checks and
is part of CI. It covers 1,005 vendors, later-page errors, invalid data, cursor
cycles, generated vendor XML, missing vendor XML, malformed XML and real
nonzero postbuild exits.

## Verification and remaining blocker

- API, vendor and admin production builds pass.
- Customer production compilation succeeds with zero warnings.
- All three frontend lint checks pass with zero warnings.
- Sitemap regression checks pass.
- Five targeted API suites pass: 313 tests, including payout accounting and
  statement coverage.
- Three further tooling/refund checks pass: 270 tests (the error-safety suite
  overlaps the first group; these counts are not a unique combined total).
- API and portal type checks pass.

**Production catalogue blocker:** the valid public production vendor request
currently returns zero eligible vendors. Development exposes only a public demo
kitchen, which is not a live seller. The customer build therefore correctly
fails postbuild with:

> Required live vendor profiles are missing; refusing incomplete sitemap

The positive generation test produces and validates vendor profile XML using an
isolated test catalogue. This is not proof that a live production sitemap now
contains vendors. A real publicly eligible vendor must exist before the
production sitemap/build can pass. No production vendor records were changed and no
fake vendor was published to make verification green.

## Runtime observations outside this build/lint scope

The restored previews start successfully and the public homepage renders.
The browser capture reported a server/client attribute hydration mismatch near
the homepage postcode input. This is not a compilation warning and was not
changed in this task.

API startup/monitoring also reports missing optional Slack alert configuration
and an existing notification-queue backlog. Those operational alerts were not
suppressed or cleared to make the build-warning count look better.
