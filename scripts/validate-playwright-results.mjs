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

/**
 * Validates a deliberately bounded Playwright suite.  Project execution alone
 * is insufficient for release gates: a renamed, skipped, or filtered test can
 * otherwise leave the job green while a required assertion never ran.
 */
export function evaluateRequiredInventory(report, manifest) {
  const expectedProjects = manifest.expectedProjects ?? [];
  const requiredTests = manifest.requiredTests ?? [];
  const configuredProjects = (report.config?.projects ?? [])
    .map(({ name }) => name)
    .filter(Boolean);

  const error =
    expectedProjects.length === 0
      ? 'Required test manifest has no expectedProjects.'
      : requiredTests.length === 0
        ? 'Required test manifest has no requiredTests.'
        : null;
  if (error) {
    return { error, missingTests: [], skippedTests: [], unrunTests: [] };
  }

  const unexpectedProjects = configuredProjects.filter((name) => !expectedProjects.includes(name));
  const missingProjects = expectedProjects.filter((name) => !configuredProjects.includes(name));
  if (unexpectedProjects.length || missingProjects.length) {
    const details = [
      missingProjects.length && `missing ${missingProjects.join(', ')}`,
      unexpectedProjects.length && `unexpected ${unexpectedProjects.join(', ')}`,
    ]
      .filter(Boolean)
      .join('; ');
    return {
      error: `Configured Playwright projects do not match required manifest: ${details}.`,
      missingTests: [],
      skippedTests: [],
      unrunTests: [],
    };
  }

  const collected = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        collected.push({
          title: spec.title ?? test.title ?? '',
          project: test.projectName,
          results: test.results ?? [],
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  visit(report);

  const missingTests = [];
  const skippedTests = [];
  const unrunTests = [];
  for (const required of requiredTests) {
    const matches = collected.filter(
      ({ title, project }) => project === required.project && title.startsWith(`${required.id}:`),
    );
    if (matches.length === 0) {
      missingTests.push(required.id);
      continue;
    }
    if (matches.some(({ results }) => results.length === 0)) {
      unrunTests.push(required.id);
      continue;
    }
    if (matches.some(({ results }) => results.some(({ status }) => status === 'skipped'))) {
      skippedTests.push(required.id);
    }
  }

  return { error: null, missingTests, skippedTests, unrunTests };
}

/** The Jest equivalent of the Playwright inventory gate. Failed assertions ran;
 * pending/todo assertions did not, and are therefore release-gate failures. */
export function evaluateJestInventory(report, manifest) {
  const requiredTests = manifest.requiredTests ?? [];
  if (requiredTests.length === 0) {
    return {
      error: 'Required test manifest has no requiredTests.',
      missingTests: [],
      skippedTests: [],
    };
  }
  const assertions = (report.testResults ?? []).flatMap(({ name, assertionResults = [] }) =>
    assertionResults.map(({ title, status, ancestorTitles = [] }) => ({
      file: name,
      title,
      fullTitle: [...ancestorTitles, title].join(' '),
      status,
    })),
  );
  const missingTests = [];
  const skippedTests = [];
  for (const required of requiredTests) {
    const matches = assertions.filter(
      ({ file, title, fullTitle }) =>
        file.endsWith(required.file) && (title === required.title || fullTitle === required.title),
    );
    if (!matches.length) {
      missingTests.push(`${required.file} :: ${required.title}`);
    } else if (
      matches.some(
        ({ status }) => status === 'pending' || status === 'todo' || status === 'disabled',
      )
    ) {
      skippedTests.push(`${required.file} :: ${required.title}`);
    }
  }
  return { error: null, missingTests, skippedTests };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const resultsPath = argument('--results');
  const jestResultsPath = argument('--jest-results');
  const expectedProjectCount = Number(argument('--expected-project-count'));
  const manifestPath = argument('--manifest');
  const manifestSection = argument('--manifest-section');
  if (
    (!resultsPath && !jestResultsPath) ||
    (!manifestPath && (!Number.isInteger(expectedProjectCount) || expectedProjectCount < 1))
  ) {
    throw new Error(
      'Usage: validate-playwright-results.mjs --results <path> (--expected-project-count <n> | --manifest <path>)',
    );
  }

  const selectedResultsPath = resultsPath ?? jestResultsPath;
  const absoluteResultsPath = resolve(selectedResultsPath);
  if (!existsSync(absoluteResultsPath)) {
    throw new Error(`Test results file does not exist: ${selectedResultsPath}`);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(absoluteResultsPath, 'utf8'));
  } catch {
    throw new Error(`Test results file is not valid JSON: ${selectedResultsPath}`);
  }

  let manifest;
  if (manifestPath) {
    const absoluteManifestPath = resolve(manifestPath);
    if (!existsSync(absoluteManifestPath)) {
      throw new Error(`Required test manifest does not exist: ${manifestPath}`);
    }
    try {
      manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8'));
    } catch {
      throw new Error(`Required test manifest is not valid JSON: ${manifestPath}`);
    }
    if (manifestSection) {
      if (!manifest[manifestSection]) {
        throw new Error(`Required test manifest has no "${manifestSection}" section.`);
      }
      manifest = manifest[manifestSection];
    }
  }

  const validation = manifest
    ? jestResultsPath
      ? evaluateJestInventory(report, manifest.jest ?? manifest)
      : evaluateRequiredInventory(report, manifest)
    : evaluateExecution(report, expectedProjectCount);
  if (validation.error) throw new Error(validation.error);
  if (manifest) {
    const label = jestResultsPath ? 'Jest' : 'Playwright';
    const failures = [
      validation.missingTests.length &&
        `missing required cases: ${validation.missingTests.join(', ')}`,
      validation.skippedTests.length &&
        `skipped required cases: ${validation.skippedTests.join(', ')}`,
      validation.unrunTests?.length &&
        `required cases without results: ${validation.unrunTests.join(', ')}`,
    ].filter(Boolean);
    if (failures.length) {
      throw new Error(`Required ${label} inventory failed: ${failures.join('; ')}.`);
    }
    console.log(
      `${label} required inventory passed: ${(jestResultsPath ? manifest.jest : manifest).requiredTests.length} cases executed without skips.`,
    );
    return;
  }
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
