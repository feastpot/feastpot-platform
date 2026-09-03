#!/usr/bin/env node
/**
 * Prevent a new production surface from inventing a commission percentage.
 * Rates belong in @feastpot/config/commission-rates; migrations retain their
 * historical values deliberately. The legal seed also contains immutable,
 * historical terms versions and is therefore not executable rate policy.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const excludedDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'e2e-report',
  'node_modules',
]);
const allowedFiles = new Set([
  'packages/config/src/commission-rates.ts',
  'packages/config/src/commission-rates.cjs.js',
  'prisma/seed-terms.ts',
  'scripts/check-commission-rate-literals.mjs',
  // This is an operational anomaly threshold, not a configured rate.
  'apps/api/src/modules/payouts/payouts.service.ts',
]);
const violations = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) visit(join(directory, entry.name));
      continue;
    }

    const path = join(directory, entry.name);
    const file = relative(root, path);
    if (
      !sourceExtensions.has(file.slice(file.lastIndexOf('.'))) ||
      file.startsWith('prisma/migrations/') ||
      file.startsWith('docs/') ||
      file.startsWith('audit/') ||
      file.includes('/fixtures/') ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
      allowedFiles.has(file)
    ) {
      continue;
    }

    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        // Discount and CSS percentages are intentionally outside this guard.
        if (
          /\b(?:commission|service fee)\b/i.test(line) &&
          /(?<![\w.])(?:5|8|10|12)(?:\.0+)?%/.test(line)
        ) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
  }
}

visit(root);

if (violations.length) {
  console.error(
    'Commission percentage literals must be defined in @feastpot/config/commission-rates:',
  );
  console.error(violations.join('\n'));
  process.exit(1);
}
