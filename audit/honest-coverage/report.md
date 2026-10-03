# Honest coverage and LR-03 corrections

Measured 3 October 2026. This is a partial acceptance result, not a claim that every corrected browser/acceptance test passes.

## Coverage that completed

| Surface                       | Statements | Branches | Functions | Lines  |
| ----------------------------- | ---------- | -------- | --------- | ------ |
| API, unit + isolated database | 40.27%     | 36.35%   | 33.82%    | 41.14% |
| Web, all TS and TSX           | 0.85%      | 0.46%    | 0.89%     | 0.8%   |

- API unit: 103 suites, 1,266 passed, zero skipped, 67.779 seconds with open-handle detection.
- API unit + database: 107 suites, 1,288 passed, zero skipped, 79.531 seconds. Disposable loopback PostgreSQL, all migrations, no shared database migration.
- Web: 5 suites, 36 passed, zero skipped, 3.127 seconds with the final thresholds enforced.
- Denominator verification accounts for 329 executable API and 182 executable web source files. Type-only modules are excluded by compiler output, not an arbitrary whitelist.
- Web previously excluded TSX entirely. Its TS-only 5.13/3.95/5.17/4.80 figures are NOT full workspace coverage.
- Admin: existing native unit tests passed, but their loaded-library coverage includes test files and is not full-workspace coverage. No invented full-workspace figure or threshold.
- Vendor: no genuine unit suite. Removed the echo-only test command and explicitly exclude it from unit coverage. Its real Playwright lifecycle is the separate release gate.

The original coverage path mixed fast unit tests with live-database and externally authenticated acceptance setup. It now has explicit unit, database, and authoritative environments, bounded workers and test timeout. The isolated measured runs finish below five minutes; no hanging open handle was reported. This does not establish that every original timeout had one unique root cause.

## Thresholds and ratcheting

The checked-in scripts/coverage-baselines.json holds the measured API unit and database baselines separately, plus full web TS/TSX coverage. Jest enforces all four dimensions.

After generating coverage for the chosen surface, run:

    node scripts/coverage-guard.cjs database
    node scripts/coverage-guard.cjs --ratchet database

For a unit-only API measurement use unit instead of database. Ratcheting raises each baseline only; it never lowers one. Commit raised baselines with added tests. The guard also rejects missing executable source files. CI uploads HTML, LCOV and JSON summaries even when the gate fails.

## The historical 283 skipped API tests

| Suite                             | Cases | What it protects                                                                                         | Missing inputs / former skip reason                                       |
| --------------------------------- | ----: | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| role-matrix-acceptance            |   250 | Every API role/resource combination, including real AAL1 versus AAL2                                     | Supabase URL, anon key, service-role key, DB connection, factory password |
| admin-authoritative-actions       |    13 | Moderation, enforcement, terms/commission safeguards, role denial and evidence                           | Same credentials and genuinely verified MFA tokens                        |
| admin-action-propagation          |     8 | Administrative actions reaching vendor/customer state, notice/effective dating and immutable commissions | Same factory credentials and database                                     |
| cross-surface-reverse-propagation |     7 | Customer/vendor/payment/notification events reaching operations                                          | Same factory credentials, database and isolated queue infrastructure      |
| vendor-onboarding-smoke           |     5 | Vendor terms/setup activation, documents, tax/menu/order readiness                                       | Same factory credentials and database                                     |

These sum to 283. LR-03 itself executed 278: 254 passed, 24 failed, 5 skipped. All five conditional suite skips are removed. Missing credentials now fail explicitly in authoritative mode, never pass through describe.skip. Separate required database suites for discount constraints, refund/chargeback concurrency, delivery search and referral chains now fail when their database URL is missing. The shared Jest reporter turns any pending/skipped test or suite into a nonzero result. Explicit unit-only selection is not claimed to verify those excluded acceptance cases.

## All 49 bucket C entries

See bucket-c.csv for one row per original case/project, correction and verification status.

Most failures are non-rate failures: wrong assurance level, ambiguous selectors, OAuth navigation, cookie persistence, moderation state, or obsolete UI controls. There were no standalone bucket C rate-engine numerical failures to blanket-update. The two relevant commission propagation cases retain earlier order snapshots and verify newly effective rates for new orders. No historic 12% snapshot was changed to 8%. No arbitrary captured-rate snapshot was rewritten without an engine-based reason.

API MFA uses a real TOTP enrollment/challenge/verification. Password sign-in yields AAL1 even for a previously verified A2 identity, so privileged paths use the genuine MFA token. Guards remain enabled.

## Live GitHub protection and the one verification push

Live main protection originally required Typecheck, Lint, Build all apps, Prisma validate + drift check, and Test (coverage thresholds), with strict up-to-date checks and administrator enforcement. Neither vendor name was required.

The live required context now additionally includes exactly E2E (vendor authoritative lifecycle), bound to GitHub Actions app 15368. Existing checks and strictness were preserved. The checked-in vendor name is aligned.

One test-branch push created PR 118:
https://github.com/feastpot/feastpot-platform/pull/118

Its workflow failed validation before jobs ran because a duplicate top-level env mapping had been introduced. The local workflow is corrected and parses with duplicate-key validation. The test branch is also behind main. Therefore this push does NOT prove that a vendor job failure independently blocks merge. No second push or production merge was made. A fresh up-to-date disposable branch and one additional authorized push are still required.

## Verification limitations

API typechecking passed. No-skip reporter tests passed. Production denominator and baseline checks passed. Browser discovery found 14 selected corrected web cases, but browser execution failed before assertions after the workspace restart; no passing browser claim is made. The original interrupted run also provided no valid completed browser result. Vendor/admin workflows are restored after browser activity ends. All 49 source corrections have not yet received a completed authenticated/browser regression run.

The disposable proof PR was closed without merging. The task is not fully accepted: runtime regression of the corrected acceptance/browser cases and the deliberately failing vendor merge-block proof remain outstanding.
