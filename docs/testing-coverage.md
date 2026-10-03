# Coverage surfaces and ratcheting

Only API and web have full production-source unit coverage gates. Vendor's
echo-only test command was removed: real vendor Playwright acceptance is its
separate release gate. Admin's loaded-library native coverage is not a
full-workspace measurement.

API selects an explicit environment:

- Default: unit tests, without external authentication or live database suites.
- `FEASTPOT_TEST_ENVIRONMENT=database`: unit plus database integration tests.
- `npm run test:acceptance --workspace=@feastpot/api`: authoritative acceptance,
  with missing credentials failing rather than skipping.

Use disposable PostgreSQL for database coverage, not the shared development or
production database. Required authentication uses real Supabase MFA. A password
sign-in yields AAL1 even when the identity previously completed MFA; do not
disable the guard to make a privileged test pass.

Generate API and web coverage in the chosen environment, then:

```sh
node scripts/coverage-guard.cjs database
node scripts/coverage-guard.cjs --ratchet database
```

Use `unit` instead of `database` for a unit-only API measurement. The second
command raises the JSON baselines only; commit its changes with the tests.
Never use a database-inclusive summary to ratchet the unit-only baseline.

Web includes `.ts` and `.tsx`. The denominator guard requires every executable
production source file; compiler-erased type-only modules are not executable.
Jest's shared reporter rejects pending/skipped tests and suites. CI publishes
HTML, LCOV and JSON reports even when a threshold fails. Turbo tracks the
baseline, reporter and factory dependencies to avoid stale cached validation.
