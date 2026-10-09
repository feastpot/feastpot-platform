'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateCustomerShards } = require('./validate-customer-shards.cjs');
const run = { id: '123', attempt: '2', sha: 'a'.repeat(40) };
const spec = (id, title = `Test ${id}`) => ({
  id,
  title,
  tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed' }] }],
});
const manifest = { suites: [{ specs: [spec('a', 'CP-1: real payment'), spec('b'), spec('c')] }] };
const reports = () =>
  manifest.suites[0].specs.map((entry, index) => ({
    config: {
      shard: { current: index + 1, total: 3 },
      metadata: {
        ciRunId: run.id,
        ciRunAttempt: run.attempt,
        ciCommitSha: run.sha,
        ciShard: String(index + 1),
      },
    },
    suites: [{ specs: [structuredClone(entry)] }],
  }));

test('all discovered tests and CP-1 must actually pass', () => {
  assert.deepEqual(validateCustomerShards(manifest, reports(), run), { tests: 3, shards: 3 });
});
test('missing shard report fails closed', () => {
  assert.throws(() => validateCustomerShards(manifest, reports().slice(1), run), /Missing/);
});
for (const field of ['ciRunId', 'ciRunAttempt', 'ciCommitSha']) {
  test(`stale ${field} evidence cannot qualify`, () => {
    const input = reports();
    input[0].config.metadata[field] = 'stale';
    assert.throws(() => validateCustomerShards(manifest, input, run), /another run/);
  });
}
test('duplicate shard evidence fails closed', () => {
  const input = reports();
  input[1].config.metadata.ciShard = '1';
  assert.throws(() => validateCustomerShards(manifest, input, run), /Duplicate/);
});
test('omitted discovered tests fail closed', () => {
  const input = reports();
  input[1].suites[0].specs = [];
  assert.throws(() => validateCustomerShards(manifest, input, run), /omitted/);
});
for (const status of ['failed', 'skipped', 'timedOut', 'interrupted']) {
  test(`${status} execution cannot qualify`, () => {
    const input = reports();
    input[0].suites[0].specs[0].tests[0].results[0].status = status;
    assert.throws(() => validateCustomerShards(manifest, input, run), /failed|did not execute/);
  });
}
test('CP-1 must exist in the complete manifest', () => {
  assert.throws(() => validateCustomerShards({ suites: [] }, reports(), run), /missing CP-1/);
});
test('unexpected tests cannot substitute for discovered tests', () => {
  const input = reports();
  input[0].suites[0].specs[0].id = 'extra';
  assert.throws(() => validateCustomerShards(manifest, input, run), /Unexpected/);
});
test('an eventual retry pass retains the existing retry contract', () => {
  const input = reports();
  const result = input[0].suites[0].specs[0].tests[0];
  result.status = 'flaky';
  result.results.unshift({ status: 'failed' });
  validateCustomerShards(manifest, input, run);
});

test('a missing run context fails closed', () => {
  assert.throws(() => validateCustomerShards(manifest, reports(), {}), /requires the current CI/);
});
test('a missing stable identity fails closed', () => {
  const input = structuredClone(manifest);
  delete input.suites[0].specs[0].id;
  assert.throws(() => validateCustomerShards(input, reports(), run), /stable test identity/);
});
test('duplicate discovery identities cannot reduce the required inventory', () => {
  const input = structuredClone(manifest);
  input.suites[0].specs.push(structuredClone(input.suites[0].specs[0]));
  assert.throws(() => validateCustomerShards(input, reports(), run), /Duplicate discovery/);
});
test('the actual Playwright shard must match its evidence label', () => {
  const input = reports();
  input[0].config.shard.current = 2;
  assert.throws(() => validateCustomerShards(manifest, input, run), /declared shard/);
});
