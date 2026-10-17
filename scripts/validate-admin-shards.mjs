import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { evaluateExecution } from './validate-playwright-results.mjs';

function inventory(report, sharedSetup = false) {
  const entries = new Map();
  const visit = (suite, ancestors = []) => {
    const titles = [...ancestors, ...(suite.title ? [suite.title] : [])];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (!spec.id || !test.projectName) throw new Error('Missing test or project identity.');
        // JSON spec.id varies when different projects are first in a shard.
        const key = JSON.stringify([
          spec.file ?? '',
          titles,
          spec.title ?? spec.id,
          test.projectName,
        ]);
        if (entries.has(key)) {
          if (!sharedSetup || !['setup', 'auth-teardown'].includes(test.projectName)) {
            throw new Error(`Duplicate test identity: ${key}`);
          }
          if (test.results?.at(-1)?.status !== 'passed') {
            throw new Error(`Shared setup did not pass: ${key}`);
          }
          continue;
        }
        entries.set(key, test);
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return entries;
}

export function validateAdminShards(discovery, results) {
  const execution = evaluateExecution(results, 9);
  if (execution.error) throw new Error(execution.error);
  if (execution.unexecutedProjects.length) {
    throw new Error(`Unexecuted projects: ${execution.unexecutedProjects.join(', ')}`);
  }
  const expected = inventory(discovery);
  const actual = inventory(results, true);
  if (expected.size === 0) throw new Error('Discovery inventory is empty.');
  for (const [id] of expected) {
    const test = actual.get(id);
    if (!test) throw new Error(`Missing discovered test: ${id}`);
    const final = test.results?.at(-1)?.status;
    if (final !== 'passed') throw new Error(`Test did not pass: ${id} (${final ?? 'unrun'})`);
  }
  for (const [id] of actual) {
    if (!expected.has(id)) throw new Error(`Unexpected test: ${id}`);
  }
  return { tests: expected.size, projects: 9 };
}

export function mergeAdminReports(reports) {
  if (reports.length !== 4) throw new Error('Exactly four admin shard reports are required.');
  const projects = reports[0].config?.projects ?? [];
  if (projects.length !== 9) throw new Error('Expected nine configured admin projects.');
  const names = projects.map(({ name }) => name).sort();
  for (const report of reports) {
    if (
      JSON.stringify((report.config?.projects ?? []).map(({ name }) => name).sort()) !==
      JSON.stringify(names)
    ) {
      throw new Error('Shard project configurations differ.');
    }
  }
  return {
    ...reports[0],
    suites: reports.flatMap(({ suites = [] }) => suites),
    stats: reports.reduce(
      (stats, { stats: next = {} }) => {
        for (const key of ['expected', 'unexpected', 'flaky', 'skipped'])
          stats[key] += next[key] ?? 0;
        return stats;
      },
      { expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--merge') {
    const reports = process.argv.slice(3).map((path) => JSON.parse(readFileSync(path, 'utf8')));
    writeFileSync('apps/admin/e2e-results.json', JSON.stringify(mergeAdminReports(reports)));
  } else {
    const [discovery, results] = process.argv.slice(2);
    if (!discovery || !results)
      throw new Error('Usage: validate-admin-shards.mjs discovery.json results.json');
    const summary = validateAdminShards(
      JSON.parse(readFileSync(discovery, 'utf8')),
      JSON.parse(readFileSync(results, 'utf8')),
    );
    console.log(
      `Admin execution verified: ${summary.tests} tests across ${summary.projects} projects.`,
    );
  }
}
