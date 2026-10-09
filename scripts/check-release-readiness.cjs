'use strict';

const REQUIRED_JOBS = [
  'setup',
  'typecheck',
  'lint',
  'prisma-validate',
  'test',
  'financial-suite',
  'link-audit-live',
  'rls-check',
  'e2e-customer',
  'e2e-admin',
  'e2e-vendor',
  'cross-surface-consistency',
  'build',
];
const REQUIRED_VERCEL_CONTEXTS = [
  'Vercel \u2013 feastpot-platform',
  'Vercel \u2013 feastpot-platform-vendor',
  'Vercel \u2013 feastpot-platform-admin',
];

function validateRequiredJobs(needs) {
  const failures = REQUIRED_JOBS.filter((job) => needs?.[job]?.result !== 'success').map(
    (job) => `${job}: ${needs?.[job]?.result ?? 'missing'}`,
  );
  if (failures.length) throw new Error(`Mandatory CI jobs did not pass: ${failures.join(', ')}`);
}

function validateVercelStatuses(statuses) {
  if (!Array.isArray(statuses)) throw new Error('GitHub returned no deployment status array');
  // The combined-status API returns the latest status for each context.
  const failures = REQUIRED_VERCEL_CONTEXTS.filter(
    (context) => statuses.find((status) => status.context === context)?.state !== 'success',
  ).map((context) => {
    const status = statuses.find((entry) => entry.context === context);
    return `${context}: ${status?.state ?? 'missing'}`;
  });
  if (failures.length) throw new Error(`Vercel previews did not pass: ${failures.join(', ')}`);
}

async function main(env = process.env, request = fetch) {
  validateRequiredJobs(JSON.parse(env.CI_REQUIRED_RESULTS || '{}'));
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.RELEASE_HEAD_SHA;
  const token = env.GITHUB_TOKEN;
  if (
    !repository ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    !token
  ) {
    throw new Error('Release gate requires repository, PR head SHA and GitHub token');
  }
  const response = await request(
    `https://api.github.com/repos/${repository}/commits/${sha}/status`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`Cannot verify Vercel statuses: HTTP ${response.status}`);
  const result = await response.json();
  if (result.sha !== sha) throw new Error('Deployment evidence does not match the PR head commit');
  validateVercelStatuses(result.statuses);
  console.log(
    `Release readiness passed for ${sha}: all mandatory jobs and Vercel previews succeeded`,
  );
}

module.exports = {
  REQUIRED_JOBS,
  REQUIRED_VERCEL_CONTEXTS,
  validateRequiredJobs,
  validateVercelStatuses,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
