#!/usr/bin/env node
/**
 * Verifies Playwright's machine-readable --list report covers every checked-in
 * spec and every configured project. It never opens a browser or starts a UI.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC_FILE = /\.spec\.ts$/;

function listSpecFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSpecFiles(entryPath);
    return entry.isFile() && SPEC_FILE.test(entry.name) ? [entryPath] : [];
  });
}

function collectReport(report) {
  const rootDir = report.config?.rootDir;
  const tests = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const file = spec.file ?? spec.location?.file;
      for (const test of spec.tests ?? []) {
        tests.push({
          file: file && resolve(rootDir ?? process.cwd(), file),
          project: test.projectName,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  visit(report);
  return tests;
}

export function evaluateDiscovery({ specFiles, collectedTests, configuredProjects }) {
  const collectedFiles = new Set(collectedTests.map(({ file }) => file));
  const collectedProjects = new Set(collectedTests.map(({ project }) => project).filter(Boolean));
  const missingFiles = specFiles.filter((file) => !collectedFiles.has(file));
  const missingProjects = configuredProjects.filter((project) => !collectedProjects.has(project));

  return {
    missingFiles,
    missingProjects,
    collectedProjects,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const app = argument('--app');
  const expectedSpecCountArgument = argument('--expected-spec-count');
  const expectedSpecCount =
    expectedSpecCountArgument === undefined ? undefined : Number(expectedSpecCountArgument);

  if (!app || (expectedSpecCount !== undefined && !Number.isInteger(expectedSpecCount))) {
    throw new Error(
      'Usage: check-playwright-discovery.mjs --app <path> [--expected-spec-count <n>]',
    );
  }

  const appDirectory = resolve(app);
  const specFiles = listSpecFiles(resolve(appDirectory, 'e2e'));
  if (expectedSpecCount !== undefined && specFiles.length !== expectedSpecCount) {
    throw new Error(
      `Expected ${expectedSpecCount} spec files in ${relative(process.cwd(), appDirectory) || '.'}/e2e, found ${specFiles.length}. Update the discovery guard deliberately when adding or removing specs.`,
    );
  }

  const result = spawnSync(
    process.execPath,
    ['../../node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json'],
    { cwd: appDirectory, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `Playwright collection failed (exit ${result.status ?? 'unknown'}):\n${result.stderr || result.stdout}`,
    );
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error('Playwright --list did not produce a valid JSON reporter output.');
  }

  const configuredProjects = (report.config?.projects ?? [])
    .map(({ name }) => name)
    .filter(Boolean);
  if (configuredProjects.length === 0) {
    throw new Error('Playwright JSON report did not contain configured projects.');
  }

  const discovery = evaluateDiscovery({
    specFiles,
    collectedTests: collectReport(report),
    configuredProjects,
  });
  if (discovery.missingFiles.length || discovery.missingProjects.length) {
    const lines = ['Playwright discovery guard failed.'];
    if (discovery.missingFiles.length) {
      lines.push(
        `Uncollected specs: ${discovery.missingFiles
          .map((file) => relative(appDirectory, file))
          .join(', ')}`,
      );
    }
    if (discovery.missingProjects.length) {
      lines.push(`Projects with no collected tests: ${discovery.missingProjects.join(', ')}`);
    }
    throw new Error(lines.join('\n'));
  }

  console.log(
    `Playwright discovery passed: ${specFiles.length} specs collected across ${configuredProjects.length} projects.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
