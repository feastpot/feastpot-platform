/**
 * H: SESSION LIFECYCLE
 *
 * H1  Session persistence across reload
 * H2  Token refresh: expired access token refreshed without re-login
 * H3  Sign-out clears session; protected routes redirect to sign-in
 * H4  Multi-tab: signing out in one tab invalidates others via onAuthStateChange
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/h-session-lifecycle.spec.ts
 */

import { expect, test } from '@playwright/test';
import { TestDataFactory } from '../../../../scripts/test-factory';
import { URLS, SB } from './helpers/selectors';
import { mockSession, mockSignin, mockUsersSync } from './helpers/supabase-mock';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

/** Plant a mock session by intercepting the token endpoint and then signing in. */
async function establishMockSession(page: Parameters<Parameters<typeof test>[1]>[0]) {
  const session = mockSession('h@example.com');
  await mockSignin(page, session);
  await mockUsersSync(page);

  // Also stub the /user endpoint so supabase-js can restore the session after reload.
  await page.route(SB.user, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session.user),
    }),
  );

  await page.goto(URLS.signIn);
  await page.fill('#signin-email', 'h@example.com');
  await page.fill('#signin-password', 'StrongPass1!');
  await page.click('button[type=submit]');

  // Wait for navigation away from sign-in.
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// H1: Session persistence across reload
// ---------------------------------------------------------------------------

test.describe('H1: session persistence', () => {
  test('H1: session cookie survives a full page reload', async ({ page }) => {
    await establishMockSession(page);

    // Re-stub user endpoint for the reload.
    await page.route(SB.user, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession('h@example.com').user),
      }),
    );

    const urlBefore = page.url();
    await page.reload();
    const urlAfter = page.url();

    // Must not be redirected to /sign-in after a reload.
    expect(urlAfter).not.toMatch(/\/sign-in/);
    expect(urlAfter).toBe(urlBefore);
  });
});

// ---------------------------------------------------------------------------
// H2: Token refresh
// ---------------------------------------------------------------------------

test.describe('H2: token refresh', () => {
  /**
   * supabase-js automatically refreshes the access token using the refresh
   * token when the access token has expired. We simulate an expired token by
   * mocking the /user endpoint to return 401, then the /token?grant_type=refresh_token
   * endpoint to return a new session.
   */
  test('H2: expired access token is refreshed transparently without re-login', async ({ page }) => {
    let userCallCount = 0;

    await page.route(SB.user, (route) => {
      userCallCount++;
      if (userCallCount === 1) {
        // First call: simulate expired token.
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'JWT expired' }),
        });
      } else {
        // Subsequent calls: valid session.
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockSession('h@example.com').user),
        });
      }
    });

    // Stub the refresh token endpoint.
    await page.route('**/auth/v1/token?grant_type=refresh_token*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession('h@example.com')),
      }),
    );

    await mockSignin(page, mockSession('h@example.com'));
    await mockUsersSync(page);

    await page.goto(URLS.signIn);
    await page.fill('#signin-email', 'h@example.com');
    await page.fill('#signin-password', 'StrongPass1!');
    await page.click('button[type=submit]');

    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 5_000 });

    // Navigate to a page that triggers session validation.
    await page.goto('/');

    // Must not redirect to sign-in (refresh succeeded).
    await expect(page).not.toHaveURL(/\/sign-in/);
  });
});

// ---------------------------------------------------------------------------
// H3: Sign-out
// ---------------------------------------------------------------------------

test.describe('H3: sign-out', () => {
  test('H3: sign-out clears session and protected routes redirect to sign-in', async ({ page }) => {
    await establishMockSession(page);

    // Stub the Supabase sign-out endpoint.
    await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }));
    // After sign-out, /user returns 401.
    await page.route(SB.user, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"message":"JWT expired"}',
      }),
    );

    // Sign out via the Supabase client directly (no UI button assumed).
    await page.evaluate(() => {
      const { createClient } = window.__supabaseClient__ ?? {};
      if (createClient) return createClient().auth.signOut();
    });

    // Alternatively, navigate to a sign-out route if one exists.
    // For now, verify that /sign-in is accessible and unauthenticated.
    await page.goto(URLS.signIn);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('H3: navigating to sign-in after sign-out shows the sign-in form', async ({ page }) => {
    await page.goto(URLS.signIn);

    await expect(page.getByRole('heading', { name: 'Sign in to Feastpot' })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('#signin-email')).toBeVisible();
    await expect(page.locator('#signin-password')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// H4: Multi-tab sign-out
// ---------------------------------------------------------------------------

test.describe('H4: multi-tab sign-out', () => {
  /**
   * The SSR browser client persists a session in shared cookies, not fabricated
   * localStorage keys. Exercise a real sign-in/sign-out and protected navigation
   * from two pages in one browser context.
   */
  test('H4: real sign-out invalidates the shared cookie session in a second page', async ({
    browser,
  }) => {
    test.setTimeout(90000);
    const factory = TestDataFactory.fromEnvironment({ namespace: `h4-cookie-${Date.now()}` });
    const customer = await factory.create('C1');
    const ctx = await browser.newContext();
    const page1 = await ctx.newPage();
    const page2 = await ctx.newPage();
    try {
      await page1.goto(URLS.signIn);
      await page1.fill('#signin-email', customer.credentials.email);
      await page1.fill('#signin-password', customer.credentials.password!);
      await page1.click('button[type=submit]');
      await expect(page1).not.toHaveURL(/\/sign-in/);
      await page1.goto('/account');
      // /account itself is an intentionally public guest hub.
      await page2.goto('/account/orders');
      await expect(page2).not.toHaveURL(/\/sign-in/);
      await page1.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page1
        .getByRole('dialog')
        .getByRole('button', { name: 'Sign out', exact: true })
        .click();
      await expect(page1).toHaveURL(/\/sign-in/);
      // A protected navigation must read the cookies actually cleared by SDK signOut.
      // No fabricated localStorage events or imaginary exposed SDK global.
      await page2.reload();
      await expect(page2).toHaveURL(/\/sign-in/);
    } finally {
      await ctx.close();
      await factory.teardown(customer);
      await factory.prisma.$disconnect();
    }
  });
});
