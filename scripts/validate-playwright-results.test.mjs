import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateExecution } from './validate-playwright-results.mjs';

function report(projects, tests) {
  return {
    config: { projects: projects.map((name) => ({ name })) },
    suites: [{ specs: [{ tests }] }],
  };
}

test('accepts a non-skipped result for every configured project', () => {
  const result = evaluateExecution(
    report(
      ['setup', 'desktop'],
      [
        { projectName: 'setup', results: [{ status: 'passed' }] },
        { projectName: 'desktop', results: [{ status: 'failed' }] },
      ],
    ),
    2,
  );
  assert.equal(result.error, null);
  assert.deepEqual(result.unexecutedProjects, []);
});

test('rejects projects with zero results or only skipped results', () => {
  const result = evaluateExecution(
    report(
      ['setup', 'desktop', 'mobile'],
      [
        { projectName: 'setup', results: [{ status: 'passed' }] },
        { projectName: 'desktop', results: [{ status: 'skipped' }] },
        { projectName: 'mobile', results: [] },
      ],
    ),
    3,
  );
  assert.equal(result.error, null);
  assert.deepEqual(result.unexecutedProjects, ['desktop', 'mobile']);
});

test('rejects an unexpected configured project count', () => {
  const result = evaluateExecution(report(['setup'], []), 2);
  assert.equal(result.error, 'Expected 2 configured Playwright projects, found 1.');
});
