import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateExecution,
  evaluateJestInventory,
  evaluateRequiredInventory,
} from './validate-playwright-results.mjs';

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

const manifest = {
  expectedProjects: ['truthfulness'],
  requiredTests: [
    { id: 'D1', project: 'truthfulness' },
    { id: 'D2', project: 'truthfulness' },
  ],
};

test('accepts every required case when each has a non-skipped result', () => {
  const result = evaluateRequiredInventory(
    report(
      ['truthfulness'],
      [
        {
          projectName: 'truthfulness',
          title: 'D1: percentages include a denominator',
          results: [{ status: 'passed' }],
        },
        {
          projectName: 'truthfulness',
          title: 'D2: zero denominators are neutral',
          results: [{ status: 'passed' }],
        },
      ],
    ),
    manifest,
  );
  assert.equal(result.error, null);
  assert.deepEqual(result.missingTests, []);
  assert.deepEqual(result.skippedTests, []);
  assert.deepEqual(result.unrunTests, []);
});

test('deliberate inventory fixtures fail for missing, skipped, and unrun required cases', () => {
  const result = evaluateRequiredInventory(
    report(
      ['truthfulness'],
      [
        {
          projectName: 'truthfulness',
          title: 'D1: percentages include a denominator',
          results: [{ status: 'skipped' }],
        },
        { projectName: 'truthfulness', title: 'D2: zero denominators are neutral', results: [] },
      ],
    ),
    {
      ...manifest,
      requiredTests: [...manifest.requiredTests, { id: 'D3', project: 'truthfulness' }],
    },
  );
  assert.deepEqual(result.missingTests, ['D3']);
  assert.deepEqual(result.skippedTests, ['D1']);
  assert.deepEqual(result.unrunTests, ['D2']);
});

test('Jest inventory rejects deliberate missing and skipped fixtures', () => {
  const result = evaluateJestInventory(
    {
      testResults: [
        {
          name: '/workspace/apps/api/src/cross-surface-consistency.spec.ts',
          assertionResults: [
            { title: 'all facts agree', ancestorTitles: ['Part A'], status: 'pending' },
          ],
        },
      ],
    },
    {
      requiredTests: [
        { file: 'apps/api/src/cross-surface-consistency.spec.ts', title: 'all facts agree' },
        {
          file: 'apps/api/src/e2e/cross-surface-reverse-propagation.spec.ts',
          title: 'waitlist arrives',
        },
      ],
    },
  );
  assert.deepEqual(result.skippedTests, [
    'apps/api/src/cross-surface-consistency.spec.ts :: all facts agree',
  ]);
  assert.deepEqual(result.missingTests, [
    'apps/api/src/e2e/cross-surface-reverse-propagation.spec.ts :: waitlist arrives',
  ]);
});
