import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDiscovery } from './check-playwright-discovery.mjs';

const specs = ['/repo/apps/example/e2e/first.spec.ts', '/repo/apps/example/e2e/second.spec.ts'];

test('accepts a complete spec and project collection', () => {
  const result = evaluateDiscovery({
    specFiles: specs,
    collectedTests: [
      { file: specs[0], project: 'desktop' },
      { file: specs[1], project: 'mobile' },
    ],
    configuredProjects: ['desktop', 'mobile'],
  });

  assert.deepEqual(result.missingFiles, []);
  assert.deepEqual(result.missingProjects, []);
});

test('reports a configured project that Playwright did not collect', () => {
  const result = evaluateDiscovery({
    specFiles: specs,
    collectedTests: [{ file: specs[0], project: 'desktop' }],
    configuredProjects: ['desktop', 'mobile'],
  });

  assert.deepEqual(result.missingFiles, [specs[1]]);
  assert.deepEqual(result.missingProjects, ['mobile']);
});
