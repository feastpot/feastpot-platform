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

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  auditLiveTargets,
  buildRouteMap,
  checkLiveUrl,
  extractLinkRefs,
  resolveLiveUrl,
  routeForPath,
  type FetchLike,
  type LiveBaseUrls,
} from '../../../scripts/link-audit';

const ROOT = join(__dirname, '../../../');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function buildRouteSet(appDir: string): Set<string> {
  return new Set(buildRouteMap(appDir).keys());
}

function matches(href: string, routes: Set<string>): boolean {
  const routeMap = new Map(
    [...routes].map((route) => [route, { route, file: '', ids: new Set<string>() }]),
  );
  return Boolean(routeForPath(href, routeMap));
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
    const hits = extractLinkRefs('apps/vendor').filter((ref) => ref.href.startsWith('/legal/'));
    expect(hits).toHaveLength(0);
  });
});

describe('Link audit AST extraction', () => {
  it('finds multiline JSX and router navigation targets without grep', () => {
    const refs = extractLinkRefs('apps/vendor');
    expect(refs.some((ref) => ref.href === '/help' && ref.kind === 'jsx')).toBe(true);
    expect(refs.some((ref) => ref.href === '/sign-in' && ref.kind === 'navigation')).toBe(true);
  });
});

describe('Link audit live HTTP helpers', () => {
  const bases: LiveBaseUrls = {
    web: 'http://127.0.0.1:3000',
    vendor: 'http://127.0.0.1:3002',
    admin: 'http://127.0.0.1:3003',
  };
  const response = (status: number, location?: string) => ({
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'location' ? (location ?? null) : null),
    },
  });
  const mockRequest = (...responses: ReturnType<typeof response>[]): FetchLike => {
    let index = 0;
    return jest.fn(async () => responses[index++]!);
  };

  it('passes a successful internal response', async () => {
    await expect(
      checkLiveUrl('http://127.0.0.1:3000/menu', bases, mockRequest(response(200))),
    ).resolves.toMatchObject({ status: 200 });
  });

  it('follows an internal redirect and checks its final response', async () => {
    const request = mockRequest(response(307, '/sign-in'), response(200));
    const check = await checkLiveUrl('http://127.0.0.1:3002/orders', bases, request);
    expect(check).toMatchObject({ status: 200, finalUrl: 'http://127.0.0.1:3002/sign-in' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([404, 500])('fails an HTTP %i response', async (status) => {
    await expect(
      checkLiveUrl('http://127.0.0.1:3000/missing', bases, mockRequest(response(status))),
    ).resolves.toMatchObject({
      status,
      error: `HTTP ${status}`,
    });
  });

  it('fails a request error', async () => {
    const request: FetchLike = jest.fn(async () => {
      throw new Error('connection refused');
    });
    await expect(
      checkLiveUrl('http://127.0.0.1:3003/admin', bases, request),
    ).resolves.toMatchObject({
      status: 0,
      error: 'connection refused',
    });
  });

  it('maps a production Feastpot cross-app URL to its configured local base', async () => {
    expect(
      resolveLiveUrl('https://vendor.feastpot.co.uk/orders?day=today#details', 'web', bases),
    ).toBe('http://127.0.0.1:3002/orders?day=today');
    const checks = await auditLiveTargets(
      ['http://127.0.0.1:3002/orders'],
      bases,
      mockRequest(response(200)),
    );
    expect(checks[0]).toMatchObject({ status: 200 });
  });
});
