import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const extensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.yaml',
  '.yml',
  '.sql',
  '.sh',
  '.txt',
]);

// Only root-level operator reports, uploaded inputs and agent-managed content
// are exempt. A workspace's own docs/audit directories are still checked.
const exemptRoots = ['.agents/', '.local/', 'attached_assets/', 'docs/', 'audit/'];

// Applied migrations must not be rewritten for typography: Prisma records
// their checksums. These two exact historical snapshots are grandfathered.
// Editing either file removes its exception; no migration directory is exempt.
export const historicalMigrations = {
  'prisma/migrations/20260530010000_coverage_interest_unique_email_postcode/migration.sql':
    '4cb0a0807827b070e9630e26d084178fa65fa3beefd24ab8f22f6e78448ac059',
  'prisma/migrations/20260810110000_purge_seed_data_and_invalid_reviews/migration.sql':
    'fd32210e089d80cc92aa6476e65c0db5446826c077c5935664700c8c2459ed5b',
};

export function checkEmDashes(root) {
  const paths = new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  );
  const violations = [];
  let checked = 0;
  for (const file of paths) {
    if (
      !extensions.has(path.extname(file)) ||
      exemptRoots.some((prefix) => file.startsWith(prefix))
    )
      continue;
    const bytes = readFileSync(path.join(root, file));
    checked++;
    if (
      historicalMigrations[file] &&
      createHash('sha256').update(bytes).digest('hex') === historicalMigrations[file]
    )
      continue;
    bytes
      .toString('utf8')
      .split('\n')
      .forEach((line, index) => {
        const column = line.indexOf('\u2014');
        if (column >= 0) violations.push(`${file}:${index + 1}:${column + 1}`);
      });
  }
  return { checked, violations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const result = checkEmDashes(root);
    if (result.violations.length) {
      console.error('ERROR: em dash (U+2014) detected; use an approved alternative.');
      console.error(result.violations.join('\n'));
      process.exitCode = 1;
    } else {
      console.info(`No em dash: checked ${result.checked} source files across all workspaces.`);
    }
  } catch (error) {
    console.error('No-em-dash check could not complete:', error.message);
    process.exitCode = 1;
  }
}
