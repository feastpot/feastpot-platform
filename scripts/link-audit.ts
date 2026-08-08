#!/usr/bin/env ts-node
/**
 * scripts/link-audit.ts
 *
 * Static-analysis link audit across apps/vendor, apps/web, and apps/admin.
 *
 * For each app the script:
 *   1. Discovers all valid routes by finding page.tsx files in src/app/
 *   2. Extracts all static href values from .tsx source files
 *   3. Verifies every relative internal href has a matching page.tsx
 *   4. Warns on external links (optionally HTTP-checks them with --fetch-external)
 *   5. Explicitly asserts all 19 vendor sidebar / contact-support routes
 *
 * Exits 0 when no broken internal links are found, 1 otherwise.
 *
 * Usage:
 *   npx ts-node scripts/link-audit.ts
 *   npx ts-node scripts/link-audit.ts --fetch-external
 *   npx ts-node scripts/link-audit.ts --app vendor
 */

import { execSync } from 'child_process';
import { join, relative } from 'path';
import * as https from 'https';
import * as http from 'http';

const ROOT = join(__dirname, '..');
const FETCH_EXTERNAL = process.argv.includes('--fetch-external');
const APP_FILTER = (() => {
  const idx = process.argv.indexOf('--app');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

interface AppConfig {
  name: string;
  dir: string;
}

const APPS: AppConfig[] = [
  { name: 'vendor', dir: 'apps/vendor' },
  { name: 'web',    dir: 'apps/web' },
  { name: 'admin',  dir: 'apps/admin' },
].filter((a) => !APP_FILTER || a.name === APP_FILTER);

// ── Vendor sidebar routes (19 = 18 nav items + /help contact-support) ────────
const VENDOR_SIDEBAR_ROUTES = [
  '/', '/orders', '/disputes', '/menu', '/availability', '/analytics',
  '/referrals', '/catering', '/earnings', '/payouts', '/compliance',
  '/account-status', '/tax-information', '/terms',
  '/settings/profile', '/settings/team', '/settings/security',
  '/user-guide', '/help',
];

// ── Route map ────────────────────────────────────────────────────────────────

function buildRouteMap(appDir: string): Set<string> {
  const appRoot = join(ROOT, appDir, 'src', 'app');
  let raw: string;
  try {
    raw = execSync(`find "${appRoot}" \\( -name 'page.tsx' -o -name 'page.ts' \\) 2>/dev/null`, {
      encoding: 'utf8',
    });
  } catch {
    return new Set(['/']);
  }

  const routes = new Set<string>(['/']);
  for (const file of raw.trim().split('\n').filter(Boolean)) {
    let rel = relative(appRoot, file.trim());
    // Strip trailing /page.tsx
    rel = rel.replace(/[/\\]page\.tsx?$/, '').replace(/^page\.tsx?$/, '');
    // Collapse Next.js route groups: (auth)/sign-in → sign-in
    rel = rel.replace(/\([^)]+\)[/\\]/g, '');
    // Normalise backslashes (Windows)
    rel = rel.replace(/\\/g, '/');
    routes.add(rel ? `/${rel}` : '/');
  }
  return routes;
}

/**
 * Returns true if href matches any known route pattern.
 * Dynamic segments ([id], [slug], etc.) are treated as wildcards.
 */
function routeExists(href: string, routes: Set<string>): boolean {
  const bare = href.split('?')[0].split('#')[0] || '/';
  if (routes.has(bare)) return true;

  for (const pattern of routes) {
    if (!pattern.includes('[')) continue;
    // Escape regex-special chars, then replace [x] with [^/]+
    const reStr =
      '^' +
      pattern
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\[[^\]]+\]/g, '[^/]+') +
      '$';
    if (new RegExp(reStr).test(bare)) return true;
  }
  return false;
}

// ── Href extraction ──────────────────────────────────────────────────────────

interface LinkRef {
  href: string;
  file: string;
  line: number;
}

function extractHrefs(appDir: string): LinkRef[] {
  const srcDir = join(ROOT, appDir, 'src');
  let raw: string;
  try {
    raw = execSync(
      `grep -rn --include='*.tsx' --include='*.ts' 'href=' "${srcDir}" 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
  } catch {
    return [];
  }

  const results: LinkRef[] = [];
  for (const lineStr of raw.trim().split('\n').filter(Boolean)) {
    const m = lineStr.match(/^(.+?):(\d+):(.*)/);
    if (!m) continue;
    const [, file, lineNum, content] = m;
    // Extract only static string literals (double or single quoted); skip template literals
    for (const match of content.matchAll(/href=["']([^"']+)["']/g)) {
      results.push({ href: match[1], file, line: parseInt(lineNum, 10) });
    }
  }
  return results;
}

// ── External HTTP check ──────────────────────────────────────────────────────

function httpHead(url: string): Promise<{ status: number; final: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      const location = res.headers.location;
      if (location && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        httpHead(location).then(resolve).catch(reject);
      } else {
        resolve({ status: res.statusCode ?? 0, final: url });
      }
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Audit one app ────────────────────────────────────────────────────────────

interface AuditResult {
  routes: Set<string>;
  broken: LinkRef[];
  externalWarnings: Array<LinkRef & { reason: string }>;
  externalOk: number;
  internalOk: number;
}

async function auditApp(app: AppConfig): Promise<AuditResult> {
  const routes = buildRouteMap(app.dir);
  const refs = extractHrefs(app.dir);
  const result: AuditResult = {
    routes,
    broken: [],
    externalWarnings: [],
    externalOk: 0,
    internalOk: 0,
  };

  const externalSeen = new Map<string, Promise<{ status: number; final: string }>>();

  for (const ref of refs) {
    const { href } = ref;

    // Skip non-navigable hrefs
    if (
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('#') ||
      href === ''
    ) {
      continue;
    }

    if (href.startsWith('http://') || href.startsWith('https://')) {
      if (FETCH_EXTERNAL) {
        const base = href.split('#')[0];
        if (!externalSeen.has(base)) {
          externalSeen.set(base, httpHead(base).catch((e: Error) => ({ status: -1, final: e.message })));
        }
        const { status } = await externalSeen.get(base)!;
        if (status === -1 || status >= 400) {
          result.externalWarnings.push({ ...ref, reason: status === -1 ? 'fetch error' : `HTTP ${status}` });
        } else {
          result.externalOk++;
        }
      } else {
        result.externalOk++;
      }
      continue;
    }

    if (href.startsWith('/')) {
      if (routeExists(href, routes)) {
        result.internalOk++;
      } else {
        result.broken.push(ref);
      }
      continue;
    }

    // Relative hrefs without leading / are unusual in Next.js app router; treat as ok
    result.internalOk++;
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function fmt(rel: string): string {
  return relative(ROOT, rel);
}

async function main(): Promise<void> {
  const line = '='.repeat(64);
  console.log('Feastpot link audit');
  console.log(line);
  if (FETCH_EXTERNAL) console.log('External HTTP checks: enabled\n');

  let totalBroken = 0;

  for (const app of APPS) {
    console.log(`\n[${app.name.toUpperCase()}] ${app.dir}`);
    const result = await auditApp(app);
    console.log(`  Routes discovered: ${result.routes.size}`);

    // Sidebar check (vendor only)
    if (app.name === 'vendor') {
      const missing = VENDOR_SIDEBAR_ROUTES.filter((r) => !routeExists(r, result.routes));
      if (missing.length === 0) {
        console.log(`  \u2713 All ${VENDOR_SIDEBAR_ROUTES.length} sidebar/contact routes resolve`);
      } else {
        console.log(`  \u2717 Missing sidebar routes (${missing.length}): ${missing.join(', ')}`);
        totalBroken += missing.length;
      }
    }

    // Internal links
    if (result.broken.length === 0) {
      console.log(`  \u2713 No broken internal links (${result.internalOk} OK)`);
    } else {
      console.log(`  \u2717 ${result.broken.length} broken internal link(s):`);
      for (const b of result.broken) {
        console.log(`    ${fmt(b.file)}:${b.line}  \u2192  ${b.href}`);
      }
      totalBroken += result.broken.length;
    }

    // External
    const extTotal = result.externalOk + result.externalWarnings.length;
    if (FETCH_EXTERNAL && extTotal > 0) {
      if (result.externalWarnings.length === 0) {
        console.log(`  \u2713 All ${extTotal} external link(s) reachable`);
      } else {
        console.log(`  \u26a0 ${result.externalWarnings.length} external link warning(s) (not a build failure):`);
        for (const w of result.externalWarnings) {
          console.log(`    ${fmt(w.file)}:${w.line}  \u2192  ${w.href}  (${w.reason})`);
        }
      }
    } else if (!FETCH_EXTERNAL && extTotal > 0) {
      console.log(`  \u2139 ${extTotal} external link(s) not checked (use --fetch-external)`);
    }
  }

  console.log('\n' + line);
  if (totalBroken === 0) {
    console.log('\u2713 PASS: zero broken internal links');
    process.exit(0);
  } else {
    console.log(`\u2717 FAIL: ${totalBroken} broken internal link(s) found`);
    process.exit(1);
  }
}

main().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
