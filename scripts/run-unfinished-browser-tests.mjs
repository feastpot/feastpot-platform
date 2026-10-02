import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const original = JSON.parse(readFileSync(resolve('apps/web/e2e-results.json'), 'utf8'));
const pending = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      const explicitSkip = test.annotations?.some(
        ({ type }) => type === 'skip' || type === 'fixme',
      );
      if (
        !result ||
        result.status === 'interrupted' ||
        (result.status === 'skipped' && !explicitSkip)
      ) {
        pending.push(spec.title);
      }
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
visit(original);
if (!pending.length) {
  console.log('No unfinished customer cases.');
} else {
  const summary = JSON.parse(readFileSync('.local/browser-determinism/summary.json', 'utf8'));
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grep = pending.map((title) => `(?:${escape(title)})$`).join('|');
  console.log(
    `Executing ${pending.length} unfinished customer cases, not rerunning completed cases.`,
  );
  const child = spawn(
    resolve('node_modules/.bin/playwright'),
    [
      'test',
      '--grep',
      grep,
      '--workers=1',
      '--retries=0',
      '--max-failures=0',
      '--global-timeout=300000',
      '--reporter=list,json',
    ],
    {
      cwd: resolve('apps/web'),
      stdio: 'inherit',
      env: {
        ...process.env,
        CI: '',
        PLAYWRIGHT_BASE_URL: 'http://localhost:3000',
        TEST_API_URL: 'http://127.0.0.1:3001',
        TEST_FACTORY_NAMESPACE: `${summary.namespace}-web`,
        PLAYWRIGHT_JSON_OUTPUT_NAME: resolve('.local/browser-determinism/web-unfinished.json'),
        PLAYWRIGHT_JSON_OUTPUT_FILE: resolve('.local/browser-determinism/web-unfinished.json'),
      },
    },
  );
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
