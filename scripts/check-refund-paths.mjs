#!/usr/bin/env node
/**
 * Refund-path invariant guard.
 *
 * Enforces the "exactly one Stripe refund path" rule:
 *
 *   1. stripe.refunds.create (direct Stripe SDK call) must ONLY appear inside
 *      the StripeService module (apps/api/src/stripe/stripe.service.ts).
 *      Every other module must call StripeService.refund(), never the SDK
 *      directly, so the idempotency-key wrapper is always exercised.
 *
 *   2. this.stripe.refund( (StripeService.refund call) must ONLY be called
 *      from apps/api/src/modules/payments/payments.service.ts - the single
 *      implementation of the "refund with full ledger" contract.  Any other
 *      caller bypasses commission reversal, allowance restoration, the Refund
 *      record, and the AuditLog row.
 *
 * Run via: node scripts/check-refund-paths.mjs
 * Exits non-zero on any violation with a precise file:line report.
 * Runs in CI as part of the turbo lint pipeline (see packages/config/package.json).
 *
 * To extend the allowlist legitimately:
 *   - Add an `// refund-path-ok: <reason>` comment on the same line.
 *   - Update this comment block explaining why.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const SCAN_DIR = join(repoRoot, 'apps/api/src');
const SCAN_EXTENSIONS = new Set(['.ts', '.js']);

/** Directories excluded from the walk. */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  '.turbo',
  '.git',
  '.local',
]);

/** File path patterns excluded from all checks (test fixtures etc.). */
const EXCLUDE_PATH_PATTERNS = [
  /\.spec\.[cm]?[tj]sx?$/,
  /\.test\.[cm]?[tj]sx?$/,
  /__tests__[\\/]/,
];

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * Each rule has:
 *   pattern  - regex matched against each source line
 *   allowlist - relative paths (from repoRoot) whose violation is intentional
 *   message  - human-readable violation description
 */
const RULES = [
  {
    pattern: /stripe\.refunds\.create\b/,
    // StripeService wraps the SDK call with the idempotency-key contract.
    // It is the ONLY legitimate home for the raw SDK call.
    allowlist: new Set(['apps/api/src/stripe/stripe.service.ts']),
    message:
      'Direct stripe.refunds.create call detected. ' +
      'Route all Stripe refund SDK calls through StripeService (apps/api/src/stripe/stripe.service.ts). ' +
      'If this is intentional, add a `// refund-path-ok: <reason>` comment on the same line ' +
      'and extend the allowlist in scripts/check-refund-paths.mjs.',
  },
  {
    // StripeService.refund() is the abstraction. Only PaymentsService.createRefund
    // may call it - that is the single implementation with commission reversal,
    // allowance restoration, Refund record, and AuditLog all in one transaction.
    pattern: /\bthis\.stripe\.refund\b\s*\(/,
    allowlist: new Set(['apps/api/src/modules/payments/payments.service.ts']),
    message:
      'this.stripe.refund() call detected outside PaymentsService. ' +
      'All refunds must go through PaymentsService.createRefund() which applies the full ' +
      'ledger (commission reversal, allowance restoration, Refund record, AuditLog). ' +
      'If this is intentional, add a `// refund-path-ok: <reason>` comment on the same line ' +
      'and extend the allowlist in scripts/check-refund-paths.mjs.',
  },
];

// ─── File system walk ─────────────────────────────────────────────────────────

function* walkFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkFiles(full);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      yield full;
    }
  }
}

function isExcluded(absPath) {
  return EXCLUDE_PATH_PATTERNS.some((re) => re.test(absPath));
}

// ─── Audit ────────────────────────────────────────────────────────────────────

const errors = [];

for (const absPath of walkFiles(SCAN_DIR)) {
  if (isExcluded(absPath)) continue;

  const relPath = relative(repoRoot, absPath).replace(/\\/g, '/');
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');

  for (const rule of RULES) {
    if (rule.allowlist.has(relPath)) continue; // this file is allowed

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!rule.pattern.test(line)) continue;
      // Inline opt-out: `// refund-path-ok: <reason>` suppresses the violation.
      if (/\/\/\s*refund-path-ok:/i.test(line)) continue;
      errors.push(`${relPath}:${i + 1}: ${rule.message}`);
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  for (const err of errors) {
    console.error(err);
  }
  console.error(`\ncheck-refund-paths: ${errors.length} violation(s) found. Fix the files above.`);
  process.exit(1);
}

let fileCount = 0;
for (const _ of walkFiles(SCAN_DIR)) fileCount++;
console.log(`check-refund-paths: ${fileCount} API source files checked - no violations found.`);
