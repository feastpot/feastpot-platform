'use strict';

const fs = require('node:fs');
const path = require('node:path');

function entries(report) {
  const result = [];
  function visit(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (!spec.id || typeof test.projectName !== 'string' || !test.projectName) {
          throw new Error('Customer report has no stable test identity');
        }
        result.push({
          key: `${spec.id}:${test.projectName}`,
          title: spec.title,
          test,
        });
      }
    }
    for (const child of suite.suites || []) visit(child);
  }
  for (const suite of report.suites || []) visit(suite);
  return result;
}

function validateCustomerShards(manifest, reports, expectedRun, shardCount = 3) {
  if (
    !/^\d+$/.test(expectedRun.id || '') ||
    !/^\d+$/.test(expectedRun.attempt || '') ||
    !/^[a-f0-9]{40}$/.test(expectedRun.sha || '')
  ) {
    throw new Error('Customer validation requires the current CI run, attempt and commit');
  }
  const discovered = entries(manifest);
  const expected = new Map(discovered.map((entry) => [entry.key, entry]));
  if (expected.size !== discovered.length) throw new Error('Duplicate discovery identities');
  if (!expected.size || ![...expected.values()].some((entry) => entry.title.includes('CP-1:'))) {
    throw new Error('Full customer discovery manifest is empty or missing CP-1');
  }
  if (reports.length !== shardCount) throw new Error('Missing customer shard reports');
  const seen = new Set();
  const shards = new Set();
  for (const report of reports) {
    const metadata = report.config?.metadata || {};
    if (
      metadata.ciRunId !== expectedRun.id ||
      metadata.ciRunAttempt !== expectedRun.attempt ||
      metadata.ciCommitSha !== expectedRun.sha
    ) {
      throw new Error('Customer report belongs to another run, attempt or commit');
    }
    const shard = String(metadata.ciShard);
    if (!/^[1-3]$/.test(shard) || shards.has(shard)) {
      throw new Error('Duplicate or invalid customer shard');
    }
    shards.add(shard);
    if (
      report.config?.shard?.current !== Number(shard) ||
      report.config?.shard?.total !== shardCount
    ) {
      throw new Error('Customer runner did not execute the declared shard');
    }
    const executed = entries(report);
    if (!executed.length) throw new Error('Customer shard omitted discovered tests');
    for (const entry of executed) {
      if (!expected.has(entry.key) || seen.has(entry.key)) {
        throw new Error('Unexpected or duplicate customer test execution');
      }
      const results = entry.test.results || [];
      if (!results.length || results.some((result) => result.status === 'skipped')) {
        throw new Error(`Customer test did not execute: ${entry.title}`);
      }
      if (
        results.at(-1).status !== 'passed' ||
        !['expected', 'flaky'].includes(entry.test.status)
      ) {
        throw new Error(`Customer test failed: ${entry.title}`);
      }
      seen.add(entry.key);
    }
  }
  if (seen.size !== expected.size) throw new Error('Customer shards omitted discovered tests');
  return { tests: seen.size, shards: shards.size };
}

function findReports(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return findReports(file);
    return entry.name === 'e2e-results.json' ? [JSON.parse(fs.readFileSync(file, 'utf8'))] : [];
  });
}

module.exports = { validateCustomerShards };

if (require.main === module) {
  try {
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const result = validateCustomerShards(manifest, findReports(process.argv[3]), {
      id: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      sha: process.env.GITHUB_SHA,
    });
    console.log(
      `All ${result.tests} discovered customer tests passed across ${result.shards} shards; CP-1 executed.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
