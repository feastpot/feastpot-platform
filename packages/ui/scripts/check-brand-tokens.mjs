#!/usr/bin/env node
/**
 * Brand-palette drift check.
 *
 * Each app inlines the brand palette in its own globals.css (deliberate:
 * cross-package @layer CSS gets dropped in production builds), which is how
 * the vendor/admin portals silently stayed orange for months after the
 * customer site went green. This script fails lint when any inlined value
 * diverges from the shared token module (packages/ui/src/brand.ts).
 *
 * Checks per audited file:
 *   1. Every brand CSS variable in REQUIRED_VARS must be present AND bound
 *      to the exact token it maps to — assigning a *different* (but valid)
 *      token to e.g. `--brand-teal` fails, so palettes can't be silently
 *      reshuffled, only re-pointed at brand.ts.
 *   2. Every other 6-digit hex literal must still be a known brand token
 *      (or a plain white/black neutral), so no colours can be introduced
 *      outside the shared palette.
 *
 * The script also runs a negative self-test on every invocation: for each
 * audited file it substitutes each required variable with a different valid
 * token hex and asserts the check fails. If the guard ever stops catching
 * substitutions, lint fails immediately.
 *
 * Runs as part of `@feastpot/ui`'s lint script, so it gates the CI lint job
 * without any workflow changes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

const TOKEN_SOURCE = 'packages/ui/src/brand.ts';

// Explicit CSS-variable → token binding per audited file. A variable listed
// here must exist in the file and hold exactly this token's hex.
const SHARED_PORTAL_VARS = {
  '--brand-primary': 'brand.DEFAULT',
  '--brand-teal': 'teal.DEFAULT',
  '--brand-vendor': 'vendor.DEFAULT',
  '--brand-dark': 'charcoal.DEFAULT',
  '--brand-gray': 'charcoal.mid',
};

const REQUIRED_VARS = {
  'apps/web/src/app/globals.css': {
    '--brand': 'brand.DEFAULT',
    '--brand-primary': 'brand.DEFAULT',
    '--brand-light': 'brand.light',
    '--brand-dark': 'brand.dark',
    '--scotch': 'scotch',
    '--plantain': 'plantain',
    '--yam': 'yam',
    '--yam-light': 'brand.light',
    '--pot': 'pot',
    '--brand-teal': 'teal.DEFAULT',
    '--teal': 'teal.DEFAULT',
    '--teal-light': 'teal.light',
    '--cream': 'cream.DEFAULT',
    '--cream-warm': 'cream.warm',
    '--cream-deep': 'cream.deep',
    '--charcoal': 'charcoal.DEFAULT',
    '--charcoal-mid': 'charcoal.mid',
    '--charcoal-light': 'charcoal.light',
    '--brand-gray': 'charcoal.mid',
    '--surface': 'cream.DEFAULT',
  },
  'apps/vendor/src/app/globals.css': {
    ...SHARED_PORTAL_VARS,
    '--surface': 'surface.vendor',
  },
  'apps/admin/src/app/globals.css': { ...SHARED_PORTAL_VARS },
  'packages/ui/src/theme.css': { ...SHARED_PORTAL_VARS },
};

// Pure neutrals that are not brand decisions.
const NEUTRAL_ALLOWLIST = new Set(['#ffffff', '#000000']);

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

/** Parse brand.ts textually into a flat { 'group.key': '#hex' } map. */
function parseTokens(source) {
  const flat = {};
  // Nested groups: name: { key: '#hex', ... }
  for (const [, group, body] of source.matchAll(/(\w+):\s*{([^}]*)}/g)) {
    for (const [, key, hex] of body.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) {
      flat[`${group}.${key}`] = hex.toLowerCase();
    }
  }
  // Top-level scalars: name: '#hex'
  for (const [, key, hex] of source.matchAll(/^\s{2}(\w+):\s*'(#[0-9a-fA-F]{6})'/gm)) {
    flat[key] = hex.toLowerCase();
  }
  return flat;
}

/** Strip CSS comments so rationale notes citing old hexes don't trip checks. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Core audit: returns a list of error strings for one file's content. */
function auditContent(rel, css, tokens, tokenHexSet) {
  const errors = [];
  const required = REQUIRED_VARS[rel];
  const code = stripComments(css);

  for (const [cssVar, tokenPath] of Object.entries(required)) {
    const expected = tokens[tokenPath];
    if (!expected) {
      errors.push(
        `${rel}: token path '${tokenPath}' not found in ${TOKEN_SOURCE} - mapping stale?`,
      );
      continue;
    }
    const declRe = new RegExp(`${cssVar}:\\s*([^;\\n]+);`);
    const match = code.match(declRe);
    if (!match) {
      errors.push(
        `${rel}: missing required variable ${cssVar} (expected ${expected} = ${tokenPath})`,
      );
    } else if (match[1].trim().toLowerCase() !== expected) {
      errors.push(
        `${rel}: ${cssVar} is '${match[1].trim()}' but the shared token ${tokenPath} is '${expected}'`,
      );
    }
  }

  for (const hex of code.match(HEX_RE) ?? []) {
    const lower = hex.toLowerCase();
    if (!tokenHexSet.has(lower) && !NEUTRAL_ALLOWLIST.has(lower)) {
      errors.push(
        `${rel}: ${hex} is not a brand token - add it to ${TOKEN_SOURCE} or use an existing token`,
      );
    }
  }
  return errors;
}

/**
 * Negative self-test: for every audited file, substituting each required
 * variable with a *different* valid token hex must produce an error. Proves
 * the guard actually catches token reshuffling, not just unknown hexes.
 */
function selfTest(files, tokens, tokenHexSet) {
  const allHexes = [...new Set(Object.values(tokens))];
  for (const [rel, css] of Object.entries(files)) {
    for (const [cssVar, tokenPath] of Object.entries(REQUIRED_VARS[rel])) {
      const expected = tokens[tokenPath];
      const substitute = allHexes.find((h) => h !== expected);
      const declRe = new RegExp(`(${cssVar}:\\s*)[^;\\n]+;`);
      if (!declRe.test(css)) continue; // missing-var case is covered by the main audit
      const mutated = css.replace(declRe, `$1${substitute};`);
      const errors = auditContent(rel, mutated, tokens, tokenHexSet);
      if (!errors.some((e) => e.includes(cssVar))) {
        console.error(
          `check-brand-tokens SELF-TEST FAILED: swapping ${cssVar} to ${substitute} in ${rel} was not detected`,
        );
        process.exit(1);
      }
    }
  }
}

const tokenSource = readFileSync(resolve(repoRoot, TOKEN_SOURCE), 'utf8');
const tokens = parseTokens(tokenSource);
const tokenHexSet = new Set(Object.values(tokens));
if (tokenHexSet.size === 0) {
  console.error(`check-brand-tokens: no hex tokens parsed from ${TOKEN_SOURCE} - parser broken?`);
  process.exit(1);
}

const files = Object.fromEntries(
  Object.keys(REQUIRED_VARS).map((rel) => [rel, readFileSync(resolve(repoRoot, rel), 'utf8')]),
);

selfTest(files, tokens, tokenHexSet);

let failed = false;
for (const [rel, css] of Object.entries(files)) {
  for (const error of auditContent(rel, css, tokens, tokenHexSet)) {
    console.error(error);
    failed = true;
  }
}

if (failed) {
  console.error('\nBrand palette drift detected. Update the files above to match brand.ts.');
  process.exit(1);
}
console.log(
  `check-brand-tokens: ${Object.keys(files).length} files match ${TOKEN_SOURCE} (self-test passed)`,
);
