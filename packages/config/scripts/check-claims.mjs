#!/usr/bin/env node
/**
 * Claims and links audit.
 *
 * Runs in CI as part of the @feastpot/config lint script, which turbo picks up
 * via `npx turbo run lint` - the same command that runs check-brand-tokens.mjs
 * in @feastpot/ui. Exits non-zero on any violation with a precise file:line report.
 *
 * Checks:
 *   a. Dead internal links - href="/..." in an app's source pointing to a route
 *      that has no matching page.tsx in that app's Next.js file tree.
 *   b. Empty hrefs (href="" or href='').
 *   c. wa.me links whose number segment is absent/empty/null, when
 *      PLATFORM_FACTS.support.whatsapp is null (channel is inactive).
 *   d. Banned strings in first-party source files - phrases that imply false
 *      coverage claims, unsupported hours, or unavailable channels.
 *
 * Exclusions:
 *   - node_modules, .next, dist, .turbo, .git, .local, attached_assets
 *   - *.spec.* and *.test.* files, __tests__ directories (test fixtures)
 *   - This script itself
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** First-party directories to scan for banned strings and empty hrefs. */
const FIRST_PARTY_DIRS = [
  'apps/web/src',
  'apps/vendor/src',
  'apps/admin/src',
  'packages/config/src',
  'packages/ui/src',
];

/** App directories whose page.tsx files define the valid internal routes. */
const APP_DIRS = {
  web: 'apps/web/src/app',
  vendor: 'apps/vendor/src/app',
  admin: 'apps/admin/src/app',
};

/** Map a source directory prefix to its app name (for link checking). */
const SOURCE_PREFIX_TO_APP = [
  ['apps/web/src/', 'web'],
  ['apps/vendor/src/', 'vendor'],
  ['apps/admin/src/', 'admin'],
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.md']);

/**
 * Strings that must never appear in first-party source.
 *
 * Rationale per string:
 *   "24/7"                 - support is not staffed 24/7; use PLATFORM_FACTS.support.hours
 *   "9am to 9pm"           - not a documented support window; use PLATFORM_FACTS.support.hours
 *   "Birmingham"           - city not yet in launch geography; implies false coverage
 *   "Manchester"           - city not yet in launch geography; implies false coverage
 *   "Growing network of cooks" - vague unverifiable claim
 *   "500+ cooks"           - unverifiable specific number claim
 *   "Fair prices, every time" - superlative claim without basis; use specific fee facts
 */
const BANNED_STRINGS = [
  '24/7',
  '9am to 9pm',
  'Birmingham',
  'Manchester',
  'Growing network of cooks',
  '500+ cooks',
  'Fair prices, every time',
  // Registration error strings that must never recur in source or built output.
  // These were generic fallback messages that masked real Supabase errors and
  // caused sign-up failures to appear as false password-validation problems.
  'Unable to create account. Please ensure your password',
  'Ensure your password is 8',
  'check your details and try again. Ensure your password',
];

/** Directories excluded from all file-system walks. */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  '.git',
  '.local',
  'attached_assets',
]);

/** File-path patterns excluded from all checks (test fixtures, this script). */
const EXCLUDE_PATH_PATTERNS = [
  /\.spec\.[cm]?[tj]sx?$/,
  /\.test\.[cm]?[tj]sx?$/,
  /__tests__[\\/]/,
  /check-claims\.mjs$/,
];

// ---------------------------------------------------------------------------
// File system utilities
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route resolution
// ---------------------------------------------------------------------------

/**
 * Convert the absolute path of a page.tsx file to its URL route pattern.
 *
 * Rules (Next.js App Router):
 *   - Route groups  (groupname)  are transparent - strip them.
 *   - Dynamic params  [id]  become a wildcard matching one segment.
 *   - Catch-all     [...slug]  become a wildcard matching one or more segments.
 *   - Root page.tsx → "/".
 */
function pageFileToRoutePattern(appDirAbs, pageFileAbs) {
  const rel = relative(appDirAbs, pageFileAbs)
    .replace(/\/page\.[tj]sx?$/, '') // strip filename
    .replace(/^page\.[tj]sx?$/, ''); // root page
  if (!rel) return '/';
  // Strip route groups
  const stripped = rel.replace(/\([^)]+\)\//g, '');
  if (!stripped) return '/';
  return '/' + stripped;
}

/** Build a regex that matches a concrete URL path against a route pattern. */
function routePatternToRegex(pattern) {
  const re = pattern
    .replace(/\[\.\.\.([^\]]+)\]/g, '.+') // catch-all → one or more segments
    .replace(/\[([^\]]+)\]/g, '[^/]+') // dynamic  → one segment
    .replace(/\//g, '\\/');
  return new RegExp(`^${re}$`);
}

/** Build the full set of route regexes for an app directory. */
function buildRouteSet(appDirRel) {
  const appDirAbs = resolve(repoRoot, appDirRel);
  const routes = [];
  for (const file of walkFiles(appDirAbs)) {
    const name = basename(file);
    if (name === 'page.tsx' || name === 'page.ts') {
      const pattern = pageFileToRoutePattern(appDirAbs, file);
      routes.push(routePatternToRegex(pattern));
    }
  }
  return routes;
}

/** Return true if `href` (a literal internal path) matches any known route. */
function isKnownRoute(routeRegexes, href) {
  // Strip query string and hash fragment before matching
  const path = href.split('?')[0].split('#')[0] || '/';
  return routeRegexes.some((re) => re.test(path));
}

// ---------------------------------------------------------------------------
// Read PLATFORM_FACTS.support.whatsapp from source (without TS compilation)
// ---------------------------------------------------------------------------

const pfSource = readFileSync(
  resolve(repoRoot, 'packages/config/src/platform-facts.ts'),
  'utf8',
);
// Matches `whatsapp: null as string | null` (the current "inactive" state)
const whatsappIsNull = /whatsapp:\s*null\b/.test(pfSource);

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

// Build route sets once per app
const routeSets = Object.fromEntries(
  Object.entries(APP_DIRS).map(([app, dir]) => [app, buildRouteSet(dir)]),
);

/** Return the app name if the file lives inside that app's source tree. */
function fileToApp(relPath) {
  for (const [prefix, app] of SOURCE_PREFIX_TO_APP) {
    if (relPath.startsWith(prefix)) return app;
  }
  return null;
}

const errors = [];

for (const firstPartyDir of FIRST_PARTY_DIRS) {
  for (const absPath of walkFiles(resolve(repoRoot, firstPartyDir))) {
    if (isExcluded(absPath)) continue;

    const relPath = relative(repoRoot, absPath).replace(/\\/g, '/');
    const app = fileToApp(relPath);
    const content = readFileSync(absPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const loc = `${relPath}:${i + 1}`;

      // -----------------------------------------------------------------------
      // (b) Empty hrefs
      // -----------------------------------------------------------------------
      if (/href\s*=\s*["']['"]/.test(line)) {
        errors.push(`${loc}: empty href (href="" or href='')`);
      }

      // -----------------------------------------------------------------------
      // (c) wa.me links with no number (literal strings only)
      //     Only fail when whatsapp is null - if the channel activates, the
      //     check is moot. Dynamic template literals are skipped (can't analyse
      //     statically); this targets copy-pasted support-link fragments.
      // -----------------------------------------------------------------------
      if (whatsappIsNull && /href\s*=\s*["']https?:\/\/wa\.me/.test(line)) {
        const m = line.match(/href\s*=\s*["'](https?:\/\/wa\.me\/?[^"']*)/);
        if (m) {
          const after = m[1].replace(/^https?:\/\/wa\.me\/?/, '').split('?')[0];
          if (!after || after === 'null' || after === 'undefined') {
            errors.push(
              `${loc}: wa.me link with no number - support.whatsapp is null; ` +
                `render this link conditionally or remove it`,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // (a) Dead internal links
      //     Only checked inside app source files (not shared packages), and only
      //     for literal href string values, not template-literal or JSX expressions.
      //     Regex: href="/<path>" or href='/<path>' (no template literals)
      // -----------------------------------------------------------------------
      if (app) {
        const hrefRe = /href\s*=\s*["'](\/[^"']*?)["']/g;
        let m;
        while ((m = hrefRe.exec(line)) !== null) {
          const href = m[1];
          if (!isKnownRoute(routeSets[app], href)) {
            errors.push(
              `${loc}: dead internal link "${href}" - no matching page.tsx in ${app} app`,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // (d) Banned strings
      // -----------------------------------------------------------------------
      for (const banned of BANNED_STRINGS) {
        if (line.includes(banned)) {
          errors.push(`${loc}: banned string - "${banned}"`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  for (const err of errors) {
    console.error(err);
  }
  console.error(
    `\ncheck-claims: ${errors.length} violation(s) found. Fix the files listed above.`,
  );
  process.exit(1);
}

const fileCount = FIRST_PARTY_DIRS.reduce((n, d) => {
  let c = 0;
  for (const _ of walkFiles(resolve(repoRoot, d))) c++;
  return n + c;
}, 0);
console.log(`check-claims: ${fileCount} first-party files checked - no violations found.`);
