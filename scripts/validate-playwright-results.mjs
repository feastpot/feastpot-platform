#!/usr/bin/env node
/**
 * Makes an E2E result report an execution gate rather than merely an artefact.
 * A project with no result, or only skipped results, has not tested its surface.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function collectProjectResults(report) {
  const resultsByProject = new Map();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const project = test.projectName;
        if (!project) continue;
        const results = resultsByProject.get(project) ?? [];
        results.push(...(test.results ?? []));
        resultsByProject.set(project, results);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  visit(report);
  return resultsByProject;
}

export function evaluateExecution(report, expectedProjectCount) {
  const configuredProjects = (report.config?.projects ?? [])
    .map(({ name }) => name)
    .filter(Boolean);
  if (configuredProjects.length !== expectedProjectCount) {
    return {
      error: `Expected ${expectedProjectCount} configured Playwright projects, found ${configuredProjects.length}.`,
      unexecutedProjects: [],
    };
  }

  const resultsByProject = collectProjectResults(report);
  const unexecutedProjects = configuredProjects.filter((project) => {
    const results = resultsByProject.get(project) ?? [];
    return !results.some(({ status }) => status !== 'skipped');
  });

  return { error: null, unexecutedProjects };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const resultsPath = argument('--results');
  const expectedProjectCount = Number(argument('--expected-project-count'));
  if (!resultsPath || !Number.isInteger(expectedProjectCount) || expectedProjectCount < 1) {
    throw new Error(
      'Usage: validate-playwright-results.mjs --results <path> --expected-project-count <n>',
    );
  }

  const absoluteResultsPath = resolve(resultsPath);
  if (!existsSync(absoluteResultsPath)) {
    throw new Error(`Playwright results file does not exist: ${resultsPath}`);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(absoluteResultsPath, 'utf8'));
  } catch {
    throw new Error(`Playwright results file is not valid JSON: ${resultsPath}`);
  }

  const validation = evaluateExecution(report, expectedProjectCount);
  if (validation.error) throw new Error(validation.error);
  if (validation.unexecutedProjects.length) {
    throw new Error(
      `Configured Playwright projects without a non-skipped execution: ${validation.unexecutedProjects.join(', ')}.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(
    `Playwright execution passed: every one of ${expectedProjectCount} configured projects has a non-skipped result.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
