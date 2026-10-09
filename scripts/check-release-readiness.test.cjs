'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  REQUIRED_JOBS,
  REQUIRED_VERCEL_CONTEXTS,
  validateRequiredJobs,
  validateVercelStatuses,
  main,
} = require('./check-release-readiness.cjs');

const successfulJobs = () =>
  Object.fromEntries(REQUIRED_JOBS.map((job) => [job, { result: 'success' }]));
const successfulDeployments = () =>
  REQUIRED_VERCEL_CONTEXTS.map((context) => ({ context, state: 'success' }));

test('all mandatory jobs must actually succeed; optional cleanup may be skipped', () => {
  validateRequiredJobs({ ...successfulJobs(), cleanup: { result: 'skipped' } });
});

for (const result of ['failure', 'skipped', 'cancelled', 'pending']) {
  test(`a mandatory ${result} result cannot qualify for release`, () => {
    const jobs = successfulJobs();
    jobs['e2e-customer'].result = result;
    assert.throws(() => validateRequiredJobs(jobs), /e2e-customer/);
  });
}

test('missing mandatory jobs fail closed', () => {
  const jobs = successfulJobs();
  delete jobs.build;
  assert.throws(() => validateRequiredJobs(jobs), /build: missing/);
});

test('all three successful Vercel previews qualify', () => {
  validateVercelStatuses(successfulDeployments());
});

for (const state of ['pending', 'failure', 'error']) {
  test(`a ${state} Vercel preview blocks release`, () => {
    const statuses = successfulDeployments();
    statuses[0].state = state;
    assert.throws(() => validateVercelStatuses(statuses), /Vercel/);
  });
}

test('missing Vercel previews and malformed responses fail closed', () => {
  assert.throws(() => validateVercelStatuses(successfulDeployments().slice(1)), /missing/);
  assert.throws(() => validateVercelStatuses(undefined), /status array/);
});

test('a passing comment bot is not successful deployment evidence', () => {
  assert.throws(
    () => validateVercelStatuses([{ context: 'Vercel Preview Comments', state: 'success' }]),
    /missing/,
  );
});

const fixtureEnvironment = () => ({
  CI_REQUIRED_RESULTS: JSON.stringify(successfulJobs()),
  GITHUB_REPOSITORY: 'fixture/repository',
  RELEASE_HEAD_SHA: 'a'.repeat(40),
  GITHUB_TOKEN: 'fixture-token',
});

test('GitHub status API failures block release', async () => {
  await assert.rejects(
    main(fixtureEnvironment(), async () => ({ ok: false, status: 403 })),
    /HTTP 403/,
  );
});

test('successful deployments for another commit do not qualify', async () => {
  await assert.rejects(
    main(fixtureEnvironment(), async () => ({
      ok: true,
      json: async () => ({ sha: 'b'.repeat(40), statuses: successfulDeployments() }),
    })),
    /does not match/,
  );
});

test('invalid gate configuration fails before any API request', async () => {
  let requested = false;
  const env = fixtureEnvironment();
  delete env.GITHUB_TOKEN;
  await assert.rejects(
    main(env, async () => {
      requested = true;
    }),
    /requires repository/,
  );
  assert.equal(requested, false);
});

test('failed jobs block the gate without contacting GitHub', async () => {
  let requested = false;
  const env = fixtureEnvironment();
  env.CI_REQUIRED_RESULTS = '{}';
  await assert.rejects(
    main(env, async () => {
      requested = true;
    }),
    /Mandatory CI jobs/,
  );
  assert.equal(requested, false);
});
