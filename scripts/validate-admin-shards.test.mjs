import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdminShards, mergeAdminReports } from './validate-admin-shards.mjs';

const projects = Array.from({ length: 9 }, (_, i) => ({ name: `project-${i}` }));
test('merges four partial reports without duplicating project configuration', () => {
  const reports = Array.from({ length: 4 }, () => report());
  assert.equal(mergeAdminReports(reports).config.projects.length, 9);
  assert.throws(() => mergeAdminReports(reports.slice(1)), /Exactly four/);
  reports[0].config.projects = projects.slice(1);
  assert.throws(() => mergeAdminReports(reports), /nine configured/);
});
function report(status = 'passed') {
  return {
    config: { projects },
    suites: [
      {
        specs: projects.map(({ name }, i) => ({
          id: `case-${i}`,
          tests: [{ projectName: name, results: status ? [{ status }] : [] }],
        })),
      },
    ],
  };
}
test('accepts the complete discovered inventory', () => {
  assert.deepEqual(validateAdminShards(report(null), report()), { tests: 9, projects: 9 });
});
test('repeated shard setup must pass in every report', () => {
  const expected = report(null);
  const actual = report();
  for (const value of [expected, actual]) {
    value.config.projects = projects.map(({ name }, i) => ({ name: i === 0 ? 'setup' : name }));
    value.suites[0].specs[0].tests[0].projectName = 'setup';
  }
  const repeated = structuredClone(actual.suites[0].specs[0]);
  actual.suites[0].specs.push(repeated);
  assert.equal(validateAdminShards(expected, actual).tests, 9);
  repeated.tests[0].results = [{ status: 'interrupted' }];
  assert.throws(() => validateAdminShards(expected, actual), /Shared setup did not pass/);
});
test('rejects a missing shard even if every project still has another passing case', () => {
  const expected = report(null);
  expected.suites[0].specs.push({
    id: 'omitted',
    tests: [{ projectName: 'project-0', results: [] }],
  });
  assert.throws(() => validateAdminShards(expected, report()), /Missing discovered test/);
});
test('rejects a skipped discovered case', () => {
  const actual = report();
  actual.suites[0].specs[0].tests[0].results = [{ status: 'skipped' }];
  assert.throws(() => validateAdminShards(report(null), actual), /Unexecuted|did not pass/);
});
test('rejects failed and interrupted results', () => {
  for (const status of ['failed', 'interrupted']) {
    assert.throws(() => validateAdminShards(report(null), report(status)), /did not pass/);
  }
});
test('rejects unrun and unexpected cases', () => {
  assert.throws(() => validateAdminShards(report(null), report(null)), /Unexecuted/);
  const actual = report();
  actual.suites[0].specs.push({
    id: 'extra',
    tests: [{ projectName: 'project-0', results: [{ status: 'passed' }] }],
  });
  assert.throws(() => validateAdminShards(report(null), actual), /Unexpected test/);
});
test('rejects incomplete project configuration and duplicate identities', () => {
  const actual = report();
  actual.config.projects = projects.slice(1);
  assert.throws(() => validateAdminShards(report(null), actual), /Expected 9/);
  const duplicate = report();
  duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.throws(() => validateAdminShards(report(null), duplicate), /Duplicate/);
});
