const assert = require('node:assert/strict');
const { test } = require('node:test');
const Reporter = require('./no-skipped-tests.cjs');

test('a fully executed suite does not report an error', () => {
  const reporter = new Reporter();
  reporter.onRunComplete(null, { numPendingTests: 0, numPendingTestSuites: 0 });
  assert.equal(reporter.getLastError(), undefined);
});
test('pending tests fail the required environment with a clear message', () => {
  const reporter = new Reporter();
  reporter.onRunComplete(null, { numPendingTests: 3, numPendingTestSuites: 0 });
  assert.match(reporter.getLastError().message, /SKIPPED_TESTS_FORBIDDEN: 3 tests/);
});
test('an entirely unexecuted suite also fails', () => {
  const reporter = new Reporter();
  reporter.onRunComplete(null, { numPendingTests: 0, numPendingTestSuites: 1 });
  assert.match(reporter.getLastError().message, /1 suites did not run/);
});
