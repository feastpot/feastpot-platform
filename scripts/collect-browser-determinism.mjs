import { readFileSync, writeFileSync } from 'node:fs';

function cases(path) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  const output = new Map();
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const result = test.results?.at(-1);
        const skip = test.annotations?.some(({ type }) => type === 'skip' || type === 'fixme');
        let status = 'didNotRun';
        if (result?.status === 'passed') status = 'passed';
        else if (result?.status === 'skipped' && skip) status = 'skipped';
        else if (result?.status === 'interrupted') status = 'interrupted';
        else if (result && result.status !== 'skipped') status = 'failed';
        output.set(`${spec.file}:${spec.title}:${test.projectName}`, status);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  return output;
}

function counts(tests) {
  const totals = { passed: 0, failed: 0, skipped: 0, didNotRun: 0, interrupted: 0 };
  for (const status of tests.values()) totals[status]++;
  return totals;
}

const customer = cases('apps/web/e2e-results.json');
const first = counts(customer);
const remaining = cases('.local/browser-determinism/web-unfinished.json');
for (const [id, status] of remaining) {
  if (!customer.has(id)) throw new Error('Completion run collected an unexpected test.');
  if (!['didNotRun', 'interrupted'].includes(customer.get(id))) {
    throw new Error('Completion run repeated an already-completed test.');
  }
  customer.set(id, status);
}
const result = {
  customerFirst: first,
  customerCompletion: counts(remaining),
  customer: counts(customer),
  vendor: counts(cases('apps/vendor/e2e-results.json')),
  admin: counts(cases('apps/admin/e2e-results.json')),
};
writeFileSync('.local/browser-determinism/final-results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
