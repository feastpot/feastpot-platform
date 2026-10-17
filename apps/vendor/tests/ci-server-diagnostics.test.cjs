const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { collectDiagnostics, summarizeLog } = require('../../../scripts/vendor-ci-diagnostics.cjs');

test('server diagnostics classify failures without retaining sensitive log text', () => {
  const raw =
    'Bearer fixture-private-token https://example.invalid/?token=fixture-private-token\n' +
    'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n' +
    'SIGKILL ECONNRESET P2024 unhandledRejection';
  const summary = summarizeLog(raw);
  assert.equal(summary.signals.heapExhaustion, 3);
  assert.equal(summary.signals.processKilled, 1);
  assert.equal(summary.signals.connectionFailure, 1);
  assert.equal(summary.signals.databaseFailure, 1);
  assert.equal(summary.signals.unhandledError, 1);
  assert.doesNotMatch(JSON.stringify(summary), /fixture-private-token|Bearer|example\.invalid/);
  assert.deepEqual(summarizeLog(null), { available: false });
});

test('server diagnostics distinguish missing evidence and validate numeric exit metadata', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-diagnostics-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'vendor-e2e-web.exit'), '137\n');
  fs.writeFileSync(path.join(directory, 'vendor-e2e-api.exit'), 'fixture-private-token');
  const result = collectDiagnostics(directory);
  assert.equal(result.services.web.exitCode, 137);
  assert.equal(result.services.api.exitCode, null);
  assert.equal(result.services.web.processPresent, null);
  assert.deepEqual(result.services.web.log, { available: false });
  assert.doesNotMatch(JSON.stringify(result), /fixture-private-token/);
});
