/**
 * Link audit CI guard. Runs in the existing `turbo run test` pipeline.
 *
 * Static assertions only (no HTTP, no running server) that verify:
 *   - All 18 vendor portal sidebar destinations + /help have a page.tsx
 *   - Nested routes required by the brief exist
 *   - VP-600 broken onboarding links remain fixed as absolute URLs
 *   - close-account page has no broken /dashboard href and privacy@ is a link
 *   - Step 3 specific links are well-formed in source
 *   - No relative /legal/* hrefs remain in the vendor app (all broken routes)
 *   - Web app /trust page exists (linked from footer)
 *
 * Adding a `href="/non-existent"` to a vendor page and running
 * `npm run test --workspace=@feastpot/api -- link-audit` will cause
 * the broken-links test to fail, satisfying the CI guard requirement.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '../../../');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function buildRouteSet(appDir: string): Set<string> {
  const appRoot = join(ROOT, appDir, 'src', 'app');
  const raw = execSync(`find "${appRoot}" -name 'page.tsx' -o -name 'page.ts' 2>/dev/null`, {
    encoding: 'utf8',
  });
  const routes = new Set<string>(['/']);
  for (const file of raw.trim().split('\n').filter(Boolean)) {
    let rel = relative(appRoot, file.trim());
    rel = rel.replace(/[/\\]page\.tsx?$/, '').replace(/^page\.tsx?$/, '');
    rel = rel.replace(/\([^)]+\)[/\\]/g, '');
    rel = rel.replace(/\\/g, '/');
    routes.add(rel ? `/${rel}` : '/');
  }
  return routes;
}

function matches(href: string, routes: Set<string>): boolean {
  const bare = href.split('?')[0].split('#')[0] || '/';
  if (routes.has(bare)) return true;
  for (const pattern of routes) {
    if (!pattern.includes('[')) continue;
    const re = new RegExp(
      '^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\[[^\]]+\]/g, '[^/]+') + '$',
    );
    if (re.test(bare)) return true;
  }
  return false;
}

const vendorRoutes = buildRouteSet('apps/vendor');

// ── Sidebar routes ────────────────────────────────────────────────────────────

describe('Vendor portal - all 18 sidebar destinations have a page.tsx', () => {
  it('Dashboard (/)', () => {
    expect(matches('/', vendorRoutes)).toBe(true);
  });
  it('Orders (/orders)', () => {
    expect(matches('/orders', vendorRoutes)).toBe(true);
  });
  it('Disputes (/disputes)', () => {
    expect(matches('/disputes', vendorRoutes)).toBe(true);
  });
  it('Menu (/menu)', () => {
    expect(matches('/menu', vendorRoutes)).toBe(true);
  });
  it('Availability (/availability)', () => {
    expect(matches('/availability', vendorRoutes)).toBe(true);
  });
  it('Analytics (/analytics)', () => {
    expect(matches('/analytics', vendorRoutes)).toBe(true);
  });
  it('Bring your own customers (/referrals)', () => {
    expect(matches('/referrals', vendorRoutes)).toBe(true);
  });
  it('Catering bookings (/catering)', () => {
    expect(matches('/catering', vendorRoutes)).toBe(true);
  });
  it('Earnings and fees (/earnings)', () => {
    expect(matches('/earnings', vendorRoutes)).toBe(true);
  });
  it('Payouts (/payouts)', () => {
    expect(matches('/payouts', vendorRoutes)).toBe(true);
  });
  it('Compliance (/compliance)', () => {
    expect(matches('/compliance', vendorRoutes)).toBe(true);
  });
  it('Account status (/account-status)', () => {
    expect(matches('/account-status', vendorRoutes)).toBe(true);
  });
  it('Tax information (/tax-information)', () => {
    expect(matches('/tax-information', vendorRoutes)).toBe(true);
  });
  it('Terms and Notices (/terms)', () => {
    expect(matches('/terms', vendorRoutes)).toBe(true);
  });
  it('Profile (/settings/profile)', () => {
    expect(matches('/settings/profile', vendorRoutes)).toBe(true);
  });
  it('Team (/settings/team)', () => {
    expect(matches('/settings/team', vendorRoutes)).toBe(true);
  });
  it('Security (/settings/security)', () => {
    expect(matches('/settings/security', vendorRoutes)).toBe(true);
  });
  it('User Guide (/user-guide)', () => {
    expect(matches('/user-guide', vendorRoutes)).toBe(true);
  });
});

describe('Vendor portal - contact support and nested routes', () => {
  it('Contact support button target (/help)', () => {
    expect(matches('/help', vendorRoutes)).toBe(true);
  });

  it('Catering: /catering/new', () => {
    expect(matches('/catering/new', vendorRoutes)).toBe(true);
  });

  it('Orders: /orders/[id] dynamic route', () => {
    expect(matches('/orders/abc123', vendorRoutes)).toBe(true);
  });

  it('Disputes: /disputes/[id] dynamic route', () => {
    expect(matches('/disputes/abc123', vendorRoutes)).toBe(true);
  });

  it('Catering: /catering/[id]/quote dynamic route', () => {
    expect(matches('/catering/abc123/quote', vendorRoutes)).toBe(true);
  });
});

// ── VP-600 broken links remain fixed ─────────────────────────────────────────

describe('VP-600 - onboarding broken links are fixed (absolute URLs)', () => {
  it('register: Terms of Service is not a relative /legal/terms link', () => {
    const src = read('apps/vendor/src/app/onboarding/register/page.tsx');
    expect(src).not.toContain('href="/legal/terms"');
    expect(src).toContain('feastpot.co.uk/legal/terms');
  });

  it('register: Privacy Policy is not a relative /legal/privacy link', () => {
    const src = read('apps/vendor/src/app/onboarding/register/page.tsx');
    expect(src).not.toContain('href="/legal/privacy"');
    expect(src).toContain('feastpot.co.uk/legal/privacy');
  });

  it('onboarding terms acceptance: vendor-terms is not a relative /legal/vendor-terms link', () => {
    const src = read('apps/vendor/src/app/onboarding/terms/terms-acceptance-client.tsx');
    expect(src).not.toContain('href="/legal/vendor-terms"');
    expect(src).toContain('feastpot.co.uk/legal/vendor-terms');
  });

  it('onboarding terms: window.open uses absolute URL', () => {
    const src = read('apps/vendor/src/app/onboarding/terms/terms-acceptance-client.tsx');
    expect(src).not.toContain("window.open('/legal/vendor-terms'");
    expect(src).toContain("window.open('https://feastpot.co.uk/legal/vendor-terms'");
  });
});

// ── Close-account page ────────────────────────────────────────────────────────

describe('Vendor portal - close-account page links', () => {
  it('return link is / not the non-existent /dashboard', () => {
    const src = read('apps/vendor/src/app/settings/close-account/page.tsx');
    expect(src).not.toContain('href="/dashboard"');
  });

  it('privacy@feastpot.co.uk is rendered as a mailto link, not plain text', () => {
    const src = read('apps/vendor/src/app/settings/close-account/page.tsx');
    expect(src).toContain('mailto:privacy@feastpot.co.uk');
  });
});

// ── Step 3 specific links ─────────────────────────────────────────────────────

describe('Step 3 - specific links present and well-formed', () => {
  it('/terms: Full Vendor Terms links to https://feastpot.co.uk/legal/vendor-terms', () => {
    const src = read('apps/vendor/src/app/terms/terms-client.tsx');
    expect(src).toContain('https://feastpot.co.uk/legal/vendor-terms');
  });

  it('/terms: Rate Schedule (Annex A) links to /legal/vendor-terms#annex-a', () => {
    const src = read('apps/vendor/src/app/terms/terms-client.tsx');
    expect(src).toContain('https://feastpot.co.uk/legal/vendor-terms#annex-a');
  });

  it('/tax-information: SI 2023/817 links to legislation.gov.uk', () => {
    const src = read('apps/vendor/src/app/tax-information/tax-information-client.tsx');
    expect(src).toContain('https://www.legislation.gov.uk/uksi/2023/817/contents');
  });

  it('/tax-information: UTR help links to gov.uk/find-utr-number', () => {
    const src = read('apps/vendor/src/app/tax-information/tax-information-client.tsx');
    expect(src).toContain('https://www.gov.uk/find-utr-number');
  });

  it('/tax-information: compliance email is a mailto link via PLATFORM_FACTS', () => {
    const src = read('apps/vendor/src/app/tax-information/tax-information-client.tsx');
    expect(src).toContain('mailto:');
    expect(src).toContain('PLATFORM_FACTS.contact.complianceEmail');
  });

  it('web app /trust route exists (linked from footer as "Trust and safety")', () => {
    const webRoutes = buildRouteSet('apps/web');
    expect(matches('/trust', webRoutes)).toBe(true);
  });

  it('web app /legal/vendor-terms route exists (target of absolute links from vendor portal)', () => {
    const webRoutes = buildRouteSet('apps/web');
    expect(matches('/legal/vendor-terms', webRoutes)).toBe(true);
  });
});

// ── No remaining relative /legal/* hrefs in vendor app ───────────────────────

describe('Vendor portal - no relative /legal/* hrefs (those routes do not exist)', () => {
  it('vendor app source contains no href="/legal/..." string literals', () => {
    const raw = execSync(
      `grep -r 'href="/legal/' "${join(ROOT, 'apps/vendor/src')}" --include='*.tsx' --include='*.ts' 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
    // Filter comment lines
    const hits = raw
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    expect(hits).toHaveLength(0);
  });
});

// ── Broken link regression guard ─────────────────────────────────────────────
// This describe block intentionally documents how to trigger a CI failure.
// It runs the full audit script in static mode to catch any NEW broken links
// introduced after this commit.

describe('Link audit script - zero broken internal links across all apps', () => {
  it('audit script exits 0 (no broken internal links)', () => {
    // Runs the static analysis only (no --fetch-external) so it is fast and
    // deterministic in CI without network access.
    let output = '';
    let exitCode = 0;
    try {
      output = execSync(
        `npx ts-node --project "${join(ROOT, 'tsconfig.json')}" "${join(ROOT, 'scripts/link-audit.ts')}" 2>&1`,
        { encoding: 'utf8', cwd: ROOT },
      );
    } catch (e: unknown) {
      exitCode = (e as NodeJS.ErrnoException & { status?: number }).status ?? 1;
      output = (e as NodeJS.ErrnoException & { stdout?: string }).stdout ?? '';
    }
    if (exitCode !== 0) {
      // Print audit output to make CI logs actionable
      console.error('Link audit failed:\n' + output);
    }
    expect(exitCode).toBe(0);
  }, 60_000); // allow up to 60 s for the full scan
});
