# Feastpot independent technical audit

## Phase 1 static working notes

**Audit date:** 25 August 2026  
**Scope:** Current working tree, excluding dependency and generated directories
unless a command specifically stated otherwise. This is a read-only audit. No
application, configuration, or database file was changed.

## Method and evidence standard

Every positive finding below has either an exact path and line range, or a
command that was run in this workspace with its outcome. Where static review
cannot prove runtime behaviour, the entry is marked **NOT VERIFIED** rather
than assumed.

Commands executed:

```text
npm run build
npm run typecheck
npm run lint
npm audit
npm audit --json
npm outdated --json
git grep / rg static searches for markers, environment use, routes, Prisma
models, error handling, tracked secret-like values, and U+2014
```

## 1.1 Repository map

### Workspace inventory

Source size is a static count of TypeScript, JavaScript, CSS, and JSON files
and lines. It excludes `node_modules`, `.next`, `dist`, and `.turbo`.

| Workspace         | Purpose evidenced by package scripts/source layout  | Files |  Lines | Declared Feastpot workspace dependencies                                          |
| ----------------- | --------------------------------------------------- | ----: | -----: | --------------------------------------------------------------------------------- |
| `apps/web`        | Next.js customer PWA                                |   213 | 32,677 | `@feastpot/types`, `@feastpot/ui`; `@feastpot/config` as a development dependency |
| `apps/vendor`     | Next.js vendor portal                               |   194 | 36,578 | `@feastpot/types`, `@feastpot/ui`; `@feastpot/config` as a development dependency |
| `apps/admin`      | Next.js staff/admin panel                           |   155 | 25,238 | `@feastpot/types`, `@feastpot/ui`; `@feastpot/config` as a development dependency |
| `apps/api`        | NestJS API, queues, payments, notifications         |   359 | 59,142 | `@feastpot/types`; `@feastpot/config` as a development dependency                 |
| `packages/config` | Shared TypeScript, ESLint, and policy configuration |    15 |    715 | No runtime Feastpot dependency                                                    |
| `packages/types`  | Shared Prisma-related types and Zod schemas         |     4 |    258 | `@feastpot/config` as a development dependency                                    |
| `packages/ui`     | Shared React UI component library                   |    31 |  2,015 | `@feastpot/config` as a development dependency                                    |

**Evidence:** workspace declaration in `package.json`; individual package
manifests under `apps/*/package.json` and `packages/*/package.json`; static
size command:

```text
apps/admin files=155 lines=25238
apps/api files=359 lines=59142
apps/vendor files=194 lines=36578
apps/web files=213 lines=32677
packages/config files=15 lines=715
packages/types files=4 lines=258
packages/ui files=31 lines=2015
```

### Observations

1. **No manifest-level orphaned workspace was found.** All application
   workspaces declare one or more shared Feastpot packages, and all shared
   packages have a stated purpose and source.

2. **Build-target asymmetry.** `npm run build` reported five successful tasks,
   not seven, because `packages/config` and `packages/ui` have no `build`
   script. This is not by itself a defect: `packages/ui` is typechecked and
   linted, while `packages/config` has a policy lint script. Evidence:
   `package.json`, `packages/config/package.json`, `packages/ui/package.json`,
   and the root build output in section 1.2.

3. **Duplicated frontend infrastructure requires maintenance in three places.**
   The customer, vendor, and admin applications each carry their own Supabase
   and environment helper modules under:

   ```text
   apps/web/src/lib/supabase/
   apps/vendor/src/lib/supabase/
   apps/admin/src/lib/supabase/
   ```

   This is an architectural observation, not a verified functional defect.
   Static review did not establish whether their behaviour has drifted.

## 1.2 Build and type health

### Exact results

| Command             | Result | Errors |               Warnings |
| ------------------- | ------ | -----: | ---------------------: |
| `npm run build`     | Exit 0 |      0 | Build emitted warnings |
| `npm run typecheck` | Exit 0 |      0 |    0 in command output |
| `npm run lint`      | Exit 1 |      8 |                    118 |

### Build

`npm run build` ran Turborepo 2.9.18. Its final result was:

```text
Tasks:    5 successful, 5 total
Cached:    0 cached, 5 total
Time:     1m12.31s
```

The build emitted these verified warning themes:

1. `@feastpot/admin` and `@feastpot/web`: `Compiled with warnings`.
2. `@feastpot/vendor`, `@feastpot/admin`, and `@feastpot/web`: Node warns that
   `packages/ui/package.json` should declare `"type": "module"`.
3. `@feastpot/web`: `Using edge runtime on a page currently disables static
generation for that page`.

**Evidence:** `/tmp/feastpot-audit-build.log`, produced by the command above.

### TypeScript

`npm run typecheck` invoked `tsc --noEmit` for every workspace:
`@feastpot/admin`, `@feastpot/api`, `@feastpot/config`,
`@feastpot/types`, `@feastpot/ui`, `@feastpot/vendor`, and
`@feastpot/web`.

```text
Tasks:    7 successful, 7 total
Cached:    1 cached, 7 total
Time:     16.486s
```

No type errors or warnings were emitted.

### Lint

`npm run lint` failed in `@feastpot/api`:

```text
126 problems (8 errors, 118 warnings)
8 errors and 0 warnings potentially fixable with the --fix option.
```

All eight errors are import-order violations:

| Location                                                                      | Evidence                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| `apps/api/src/app.module.ts:21`                                               | `aal.guard` import ordering              |
| `apps/api/src/commission/commission.service.spec.ts:15`                       | `@prisma/client` import ordering         |
| `apps/api/src/commission/commission.service.spec.ts:16`                       | `@nestjs/common` import ordering         |
| `apps/api/src/modules/compliance/compliance.service.ts:15`                    | Empty line within import group           |
| `apps/api/src/modules/compliance/compliance.service.ts:20`                    | Storage service import ordering          |
| `apps/api/src/modules/disputes/disputes.service.ts:31`                        | Empty line within import group           |
| `apps/api/src/modules/disputes/disputes.service.ts:33`                        | Storage service import ordering          |
| `apps/api/src/modules/vendor-enforcement/vendor-enforcement-audit.spec.ts:36` | Missing empty line between import groups |

The command also reported 113 `@typescript-eslint/no-explicit-any` warnings,
with remaining warnings from `react-hooks/exhaustive-deps`,
`import/no-named-as-default-member`, and `@next/next/no-img-element`.

**Finding A-01, release health:** The repository lint gate is red. This is
currently a verified CI-quality failure, irrespective of the successful build
and typecheck.

## 1.3 Dead and unreachable code

Static analysis cannot prove every call route in a Next.js/NestJS system,
because API users may be external, paths can be composed dynamically, and
Prisma access can be nested or raw SQL. The following are concrete candidates,
not asserted deletions.

### Candidate endpoint without a checked-in caller

**Finding A-02, candidate unreachable endpoint:** No checked-in frontend,
package, or script reference was found for the finance payout CSV endpoint:
`GET /v1/payouts/export.csv`.

**Evidence command:**

```text
rg -n --glob '!apps/api/**' --glob '!**/node_modules/**'
  --glob '!**/.next/**' --glob '!**/dist/**'
  --fixed-strings '/payouts/export.csv' apps packages scripts
```

Result: no matches. The route is defined at
`apps/api/src/modules/payouts/payouts.controller.ts:107`.

**NOT VERIFIED:** An administrator, an external integration, or an untracked
consumer may call the endpoint. The result proves only that no checked-in
first-party source call was found.

### Prisma models with no direct Prisma-client property reference

The following command produced no source reference outside generated output and
the schema:

```text
rg -n 'prisma\.session\b' apps packages scripts prisma
rg -n 'prisma\.vendorTrustSignal\b' apps packages scripts prisma
rg -n 'prisma\.cateringLineItem\b' apps packages scripts prisma
```

Candidate models:

```text
Session
VendorTrustSignal
CateringLineItem
```

**NOT VERIFIED:** These models may be used through relation includes, nested
writes, raw SQL, or external jobs. They must not be deleted based only on this
static result.

### Environment-driven features that are undocumented in examples

The environment comparison found these production-relevant reads that do not
appear in any checked-in `.env.example`:

| Variable                            | Evidence                                                                                                   | Static impact                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `ADMIN_REQUIRE_AAL2`                | `apps/api/src/main.ts:147`, `apps/admin/src/middleware.ts:77`, `apps/admin/src/lib/auth/server-gate.ts:85` | Staff MFA is only enforced when exactly `true`          |
| `CAPACITY_ENFORCEMENT`              | `apps/api/src/modules/vendors/vendor-capacity.ts:70`                                                       | Capacity rule remains dry-run/off unless exactly `true` |
| `STRIPE_FEASTPASS_ANNUAL_PRICE_ID`  | `apps/api/src/feastpass/feastpass.service.ts:105`                                                          | FeastPass annual checkout needs an undeclared setting   |
| `STRIPE_FEASTPASS_MONTHLY_PRICE_ID` | `apps/api/src/feastpass/feastpass.service.ts:106`                                                          | FeastPass monthly checkout needs an undeclared setting  |
| `FINANCE_ALERT_EMAIL`               | `apps/api/src/modules/payouts/payouts.service.ts:730`                                                      | Finance-alert recipient is undocumented                 |
| `CHARGEBACK_EVIDENCE_WARN_HOURS`    | `apps/api/src/modules/payments/chargeback-deadline-monitor.service.ts:42`                                  | Chargeback warning window is undocumented               |
| `QUEUE_ALERT_SUSTAINED_CHECKS`      | `apps/api/src/queues/queue-depth-monitor.service.ts:92`                                                    | Queue alert persistence threshold is undocumented       |
| `QUEUE_ALERT_REPEAT_MINUTES`        | `apps/api/src/queues/queue-depth-monitor.service.ts:93`                                                    | Queue repeat interval is undocumented                   |
| `IP_HASH_SALT`                      | `apps/web/src/app/v/[slug]/route.ts:75`                                                                    | Referral hashing falls back to a source literal         |
| `API_PROXY_TARGET`                  | `apps/web/next.config.mjs:142`                                                                             | Proxy fallback is `http://localhost:3001`               |

**Finding A-03, configuration coverage:** Production-impacting switches and
service settings are read by code but are not discoverable through repository
environment examples or checked-in deployment configuration.

**NOT VERIFIED:** This audit did not inspect secret values. Presence metadata
cannot prove that a configured value is correct.

## 1.4 Unfinished work markers

The tracked-source marker search covered `TODO`, `FIXME`, `HACK`, `XXX`,
`temporary`, `placeholder`, `for now`, `not implemented`, and `coming soon`.
Ordinary form `placeholder=` attributes, test fixtures, generated output, and
historical audit documents were not treated as product gaps.

### Verified load-bearing markers

| Location                                                                                     | Marker/evidence                                                  | Assessment                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `apps/api/src/modules/catering-enquiries/catering-enquiries.service.ts:540`                  | `Placeholder: 30 days from now if the enquiry has no event date` | Load-bearing business-date fallback      |
| `apps/api/src/modules/payouts/payouts.service.ts:321-323`                                    | `fees` and `adjustments` are placeholder zero columns            | Load-bearing financial export limitation |
| `apps/api/src/modules/vendors/vendor-capacity.ts:108-109`                                    | Synthetic `not_provided` placeholders                            | Load-bearing API fallback semantics      |
| `apps/api/src/app.module.ts:328`                                                             | Host/port are placeholders that should never be used             | Load-bearing fallback configuration      |
| `apps/api/src/auth/supabase.service.ts:32,34`                                                | Placeholder URL and credential fallback                          | Load-bearing misconfiguration path       |
| `apps/api/src/modules/auth-public/auth-public.service.ts:66-67`                              | Placeholder URL and credential fallback                          | Load-bearing misconfiguration path       |
| `apps/vendor/src/app/onboarding/onboarding-client.tsx:112`                                   | Profile editing is on the roadmap; currently admin-only          | Missing vendor capability                |
| `apps/vendor/src/app/menu/menu-list-client.tsx:349`                                          | Thumbnail placeholder because payload omits image data           | Visible data/API limitation              |
| `apps/vendor/src/app/referrals/referrals-client.tsx:376`                                     | Order-source breakdown placeholder                               | Visible analytics limitation             |
| `apps/vendor/src/app/share/share-client.tsx:419`                                             | Order-source breakdown placeholder                               | Visible analytics limitation             |
| `apps/web/src/app/orders/[id]/review/page.tsx:218`                                           | Review detail not stored separately                              | Product data limitation                  |
| `prisma/migrations/20260814110000_vendor_verification_notification_tracking/migration.sql:8` | Email only for now; WhatsApp deferred                            | Notification-channel limitation          |

**Finding A-04, financial exports:** The payout CSV presents accountancy-shaped
`fees` and `adjustments` columns as zero despite the implementation not holding
those values. Evidence is `apps/api/src/modules/payouts/payouts.service.ts:320-323`.

## 1.5 Secrets and configuration

### Tracked secrets scan

The tracked-file scan found no provider-key pattern such as Stripe secret keys,
webhook secrets, GitHub tokens, Slack tokens, AWS keys, or private-key headers
outside lockfiles and user attachments.

It did find hard-coded **seed and test passwords** in:

```text
prisma/seed.ts:91-310
apps/web/e2e/auth/helpers/selectors.ts:61
apps/web/e2e/register.spec.ts:26,127
```

The password values are intentionally not reproduced in this report.

**Finding A-05, credential hygiene:** Seed and browser-test credentials are
tracked in source. This is acceptable only if they can never authenticate a
real production account and the production seed gate remains effective.

### Public browser variables

The inspected `NEXT_PUBLIC_*` variables are URL, Supabase anonymous-key,
Stripe publishable-key, VAPID public-key, support/contact, and build metadata
variables. Static review found no evidence that a service-role key, Stripe
secret key, webhook signing secret, or other private provider credential is
assigned a `NEXT_PUBLIC_*` name.

**NOT VERIFIED:** Static naming cannot prove a supplied value is non-sensitive.

### Required runtime configuration and safe presence result

`apps/api/src/common/config/required-env.ts:26-55` declares these runtime API
requirements:

```text
SUPABASE_DB_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
REDIS_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

The same file marks these optional-but-degrading groups:

```text
RESEND_API_KEY + EMAIL_FROM
TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
QUEUE_ALERT_SLACK_WEBHOOK_URL
```

Secret-presence metadata was queried without reading values. The safe result
confirmed the following configured secrets:

```text
REDIS_URL
RESEND_API_KEY
EMAIL_FROM
STRIPE_SECRET_KEY_LIVE
STRIPE_SECRET_KEY_TEST
STRIPE_WEBHOOK_SECRET_LIVE
SUPABASE_DB_URL
SUPABASE_DIRECT_URL
SUPABASE_SERVICE_ROLE_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
```

`SUPABASE_URL` and the resolved runtime aliases `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` were not exposed as separately named configured
secrets in the safe metadata query. The first uses the frontend-named Supabase
URL setting in this workspace; the latter aliases may be resolved at startup.

**NOT VERIFIED:** The safe secret API reports presence only. It cannot verify
whether alias resolution, provider credentials, webhook registration, or a
Slack alert recipient are correct at runtime.

### Committed environment files

Tracked environment files are:

```text
.env.example
apps/admin/.env.example
apps/vendor/.env.example
apps/web/.env.example
```

No committed `.env` or `.env.local` file was found. `apps/web/.env.local`
exists locally but is ignored by Git.

## 1.6 Dependency health

`npm audit --json` reported:

```text
9 total vulnerabilities
8 high
1 moderate
0 critical
```

Affected direct packages include `@nestjs/swagger`, `next`, `postcss`, and
`tailwindcss`. The audit also reports vulnerable transitive packages:
`brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, and `sharp`.

**Finding A-06, dependency security:** The installed dependency graph has
nine reported vulnerabilities, including eight high-severity findings.

`npm outdated --json` found 74 outdated dependency entries. Direct
dependencies verified as more than two major versions behind were:

```text
@nestjs/swagger 8.1.1 -> 11.4.7
@stripe/react-stripe-js 2.9.0 -> 6.8.2
@stripe/stripe-js 4.10.0 -> 9.14.0
@types/node 22.19.21 -> 26.3.0
prisma 5.22.0 -> 8.0.0-rc.10
stripe 17.7.0 -> 22.5.0
```

The installed direct package `@types/bull` is deprecated. Its installed
metadata says Bull provides its own types.

**NOT VERIFIED:** This audit did not assess migration effort or compatibility
for major upgrades. An upgrade must not be treated as a mechanical security fix.

## 1.7 Error-handling patterns

### Empty state versus silent failure

**Finding A-07, silent customer-home degradation:**
`apps/web/src/app/page.tsx:73-85` catches every vendor-fetch failure and
returns `[]`. The calling page therefore receives the same result for an empty
catalogue, a timeout, a network failure, or API failure. Users see an empty
rail rather than a recoverable error state.

### Silent catch block

`apps/admin/src/lib/supabase/server.ts:30-32` has an empty catch block, but the
comment states that server components cannot set cookies and middleware handles
refresh. This is documented and not recorded as a product finding.

**NOT VERIFIED:** The broad catch-block sweep found 387 catches. A static
regex cannot reliably distinguish intentionally handled error paths, test
mocks, and truly swallowed operational failures without reviewing each control
flow. Only the customer-home case above is asserted.

### Internal details returned to users

| Location                                                          | Evidence                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/web/src/app/api/orders/[id]/status/route.ts:28-30`          | Returns database/provider `error.message` in a 502 JSON response                 |
| `apps/vendor/src/app/auth/callback/route.ts:41-46`                | Places Supabase callback `error.message` into a user-facing sign-in query string |
| `apps/vendor/src/app/menu/[menuId]/items-grid-client.tsx:156-162` | Renders raw item-load `error.message`                                            |

**Finding A-08, internal error exposure:** Multiple customer or vendor paths
can propagate provider/backend error text to a user-facing response or page.
The order-status route and auth callback are directly evidenced above.

## 1.8 Em-dash rule

### Static scan result

A Python scan of 2,118 tracked files found 1,709 lines containing U+2014.
They are distributed as follows:

```text
attached_assets: 1400
docs: 153
.agents: 68
.github: 39
scripts: 31
prisma: 10
.env.example: 4
packages: 1
apps: 0
```

The three application trees contain **zero** tracked U+2014 lines. The product
application, API, and TypeScript seed files therefore passed the direct source
part of this scan.

The remaining first-party code/configuration occurrences are primarily
comments and policy scripts, including:

```text
.github/workflows/ci.yml:1,26,61,207,225,243,250,294,295,304
.github/workflows/deploy.yml:1,5,65,80,108,166,176,203,205,212,214
.github/workflows/neon-branch.yml:21,56,110,112,124,151,153,194,224,271,308,335,351
scripts/apply-branch-protection.sh:2,10,47,70
scripts/git-sync.sh:2,16,34,92,119,143,150,162,177,186,191
scripts/vercel-ignore-build.sh:2,20,36,49,51,56,60
scripts/verify-deploy.sh:2,9,28,40,76,95,163
prisma/migrations/20260810110000_purge_seed_data_and_invalid_reviews/migration.sql:37,39,45,152,170
```

The report intentionally does not reproduce U+2014 in its prose.

### Rules and gate coverage

There is both:

1. An ESLint restricted-syntax policy in
   `packages/config/eslint-base.js:50-87`.
2. A custom ESLint rule in `packages/config/no-em-dash.js:1-38`.
3. A CI grep gate in `.github/workflows/ci.yml:111-122`.

The CI gate includes TypeScript, TSX, JavaScript, JSX, JSON, Markdown, HTML,
and CSS recursively from repository root. It does cover all three application
workspaces for those extensions.

**Finding A-09, incomplete policy coverage:** The CI grep does not include
YAML, SQL, shell scripts, or text files, although the stated rule says the
entire codebase is covered. It also fails to exclude `.cache`; running its grep
condition exactly as written found seven matches under
`.cache/replit/security-scan/dependencyAudit.json`. In the actual workflow,
any match takes the failure branch and exits with status 1.

**NOT VERIFIED:** The audit did not run a hosted GitHub Actions job, so it did
not verify whether `.cache` exists after `npm ci` on a fresh runner. The
checked-in glob omission is independently verified.

## Phase 1 conclusion

The strongest current evidence is:

1. The lint gate fails with eight errors and 118 warnings despite clean build
   and typecheck results.
2. Nine dependency vulnerabilities are present, including eight high severity.
3. Customer/vendor error paths can hide a failed data fetch or expose raw
   provider details to users.

This is working evidence for a later final report. It makes no production
claims that were not directly verified in this static audit.
