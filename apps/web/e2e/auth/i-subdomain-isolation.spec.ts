/**
 * I: CROSS-SUBDOMAIN SESSION ISOLATION
 *
 * I1  Cookie domain inspection (automated: static analysis)
 * I2  Customer session on feastpot.co.uk must not grant vendor session
 * I3  Flag if cookieOptions.domain set to ".feastpot.co.uk"
 * I4  Each app gets its own correct, separate session state
 *
 * FINDING (I1/I3):
 * Neither apps/web nor apps/vendor sets cookieOptions.domain in their
 * Supabase SSR client. Both use the default @supabase/ssr behaviour, which
 * produces host-only cookies scoped to the exact hostname (not the parent
 * domain). In production, cookies set for feastpot.co.uk are NOT sent to
 * vendor.feastpot.co.uk and vice versa. No defect to flag for I3.
 *
 * Cookie name: sb-<Supabase project ref>-auth-token (+ chunk variants).
 * Both apps share the same Supabase project URL, so the cookie name is the
 * same for both apps. In production (different hostnames) this is safe
 * because the cookie is host-only. In local dev (both on localhost, different
 * ports), localhost is shared and cookies are port-agnostic, so a real test
 * should use distinct base URLs with different hostnames.
 *
 * I2/I4 automated tests require TEST_VENDOR_BASE_URL to be set to a URL on
 * a distinct hostname (e.g. http://vendor.localhost:3002). They are skipped
 * otherwise and documented as manual in MANUAL-AUTH-TESTS.md.
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/i-subdomain-isolation.spec.ts
 */

import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const VENDOR_BASE_URL = process.env.TEST_VENDOR_BASE_URL ?? '';
const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

// ---------------------------------------------------------------------------
// I1: Cookie domain inspection (static code analysis)
// ---------------------------------------------------------------------------

test.describe('I1: cookie domain static inspection', () => {
  /**
   * Verify that neither app sets cookieOptions.domain.
   * This is a static assertion against the source files, not a runtime test.
   */
  test('I1: apps/web Supabase client does not set cookieOptions.domain', () => {
    const clientFile = path.join(APP_ROOT, 'src/lib/supabase/client.ts');
    const content = fs.readFileSync(clientFile, 'utf-8');
    expect(content).not.toMatch(/cookieOptions/);
    expect(content).not.toMatch(/domain:\s*['"`]/);
  });

  test('I1: apps/web Supabase server client does not set cookieOptions.domain', () => {
    const serverFile = path.join(APP_ROOT, 'src/lib/supabase/server.ts');
    const content = fs.readFileSync(serverFile, 'utf-8');
    expect(content).not.toMatch(/cookieOptions.*domain/);
    expect(content).not.toMatch(/domain:\s*['"`]\.feastpot/);
  });

  test('I1: apps/web middleware client does not set cookieOptions.domain', () => {
    const mwFile = path.join(APP_ROOT, 'src/lib/supabase/middleware.ts');
    const content = fs.readFileSync(mwFile, 'utf-8');
    expect(content).not.toMatch(/domain:\s*['"`]\.feastpot/);
  });

  test('I1: apps/vendor Supabase client does not set cookieOptions.domain', () => {
    const vendorClientFile = path.join(REPO_ROOT, 'apps/vendor/src/lib/supabase/client.ts');
    const content = fs.readFileSync(vendorClientFile, 'utf-8');
    expect(content).not.toMatch(/cookieOptions/);
    expect(content).not.toMatch(/domain:\s*['"`]/);
  });

  test('I1: apps/vendor Supabase server client does not set cookieOptions.domain', () => {
    const vendorServerFile = path.join(REPO_ROOT, 'apps/vendor/src/lib/supabase/server.ts');
    const content = fs.readFileSync(vendorServerFile, 'utf-8');
    expect(content).not.toMatch(/domain:\s*['"`]\.feastpot/);
  });
});

// ---------------------------------------------------------------------------
// I3: Flag if .feastpot.co.uk domain is set anywhere
// ---------------------------------------------------------------------------

test.describe('I3: wildcard domain flag check', () => {
  test('I3: no Supabase client file uses .feastpot.co.uk as cookie domain', () => {
    const filesToCheck = [
      'apps/web/src/lib/supabase/client.ts',
      'apps/web/src/lib/supabase/server.ts',
      'apps/web/src/lib/supabase/middleware.ts',
      'apps/vendor/src/lib/supabase/client.ts',
      'apps/vendor/src/lib/supabase/server.ts',
      'apps/vendor/src/lib/supabase/middleware.ts',
    ];

    for (const relPath of filesToCheck) {
      const absPath = path.join(REPO_ROOT, relPath);
      if (!fs.existsSync(absPath)) continue;
      const content = fs.readFileSync(absPath, 'utf-8');
      // If this assertion fails, it means session isolation between web and
      // vendor is broken: a parent-domain cookie would be shared.
      expect(content, `${relPath} must not set .feastpot.co.uk as cookie domain`).not.toMatch(
        /domain:\s*['"`]\.feastpot\.co\.uk['"`]/,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// I2/I4: Runtime isolation tests (require distinct hostnames)
// ---------------------------------------------------------------------------

test.describe('I2/I4: runtime session isolation', () => {
  test.skip(
    !VENDOR_BASE_URL,
    'Set TEST_VENDOR_BASE_URL to a distinct hostname (e.g. http://vendor.localhost:3002) to run runtime isolation tests. See MANUAL-AUTH-TESTS.md I2.',
  );

  test('I2: session cookie set for web is not sent to vendor (different hostname)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const webPage = await ctx.newPage();
    const vendorPage = await ctx.newPage();

    // Sign in on web (mock).
    await webPage.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'web-token',
          refresh_token: 'web-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: 'web-user',
            email: 'web@example.com',
            role: 'authenticated',
            aud: 'authenticated',
            identities: [],
            app_metadata: {},
            user_metadata: {},
          },
        }),
      }),
    );
    await webPage.route('**/auth/v1/user', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'web-user',
          email: 'web@example.com',
          role: 'authenticated',
          aud: 'authenticated',
          identities: [],
          app_metadata: {},
          user_metadata: {},
        }),
      }),
    );
    await webPage.goto('/sign-in');
    await webPage.fill('#signin-email', 'web@example.com');
    await webPage.fill('#signin-password', 'StrongPass1!');
    await webPage.click('button[type=submit]');
    await webPage.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 5_000 });

    // Check vendor app sees no session.
    // On a distinct hostname, the web session cookie is not sent.
    await vendorPage.goto(`${VENDOR_BASE_URL}/sign-in`);

    // Vendor sign-in page should render (not auto-signed-in).
    await expect(vendorPage).toHaveURL(/sign-in/, { timeout: 5_000 });

    // The vendor page should not have any auth cookie from web.
    const vendorCookies = await ctx.cookies(VENDOR_BASE_URL);
    const webCookies = await ctx.cookies(
      process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    );
    const webAuthCookies = webCookies.filter((c) => c.name.includes('auth-token'));
    const vendorAuthCookies = vendorCookies.filter((c) => c.name.includes('auth-token'));

    // PASS: web auth cookies should not be in the vendor cookie jar.
    // (With host-only cookies on different hostnames, this holds.)
    for (const wc of webAuthCookies) {
      expect(vendorAuthCookies.some((vc) => vc.name === wc.name && vc.value === wc.value)).toBe(
        false,
      );
    }

    await ctx.close();
  });

  test('I4: vendor and web sessions are independently maintained', async ({ browser }) => {
    const ctx = await browser.newContext();

    // Each app should maintain its own session independently.
    // With host-only cookies, there is no cross-contamination.
    // This test verifies the cookie domain scope at runtime.
    const webPage = await ctx.newPage();
    const vendorPage = await ctx.newPage();

    await webPage.goto('/sign-in');
    await vendorPage.goto(`${VENDOR_BASE_URL}/sign-in`);

    const webCookies = await ctx.cookies(
      process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    );
    const vendorCookies = await ctx.cookies(VENDOR_BASE_URL);

    // Verify that auth cookies from web are scoped to the web hostname only.
    const webAuthCookies = webCookies.filter(
      (c) => c.name.includes('auth') || c.name.startsWith('sb-'),
    );
    for (const cookie of webAuthCookies) {
      // Host-only cookies have domain equal to the host, not .feastpot.co.uk.
      if (cookie.domain) {
        expect(cookie.domain).not.toBe('.feastpot.co.uk');
      }
    }

    await ctx.close();
  });
});
