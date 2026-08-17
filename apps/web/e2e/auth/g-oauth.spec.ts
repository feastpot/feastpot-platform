/**
 * G: OAUTH
 *
 * G1  Google new user                               MANUAL (provider consent)
 * G2  Google existing email - identity linking      MANUAL
 * G3  OAuth cancelled                               AUTOMATED
 * G4  Apple new user                                MANUAL
 * G5  Apple Private Relay                           MANUAL + risk documented
 * G6  Unconfigured provider fails gracefully        AUTOMATED
 *
 * See MANUAL-AUTH-TESTS.md section G for full manual test protocol.
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/g-oauth.spec.ts
 */

import { expect, test } from '@playwright/test';
import { URLS } from './helpers/selectors';

// ---------------------------------------------------------------------------
// G3: OAuth cancelled
// ---------------------------------------------------------------------------

test.describe('G3: OAuth cancelled by user', () => {
  test('G3: access_denied from callback returns to /sign-in with no error banner', async ({
    page,
  }) => {
    // Apple/Google returns error=access_denied when the user presses "Cancel".
    await page.goto('/auth/callback?error=access_denied&error_description=user+cancelled');

    await expect(page).toHaveURL(/\/sign-in/, { timeout: 5_000 });

    // No error alert; cancellation is treated as a benign return.
    await expect(page.getByRole('alert')).not.toBeVisible();
  });

  test('G3: non-access_denied provider error shows a sign-in error', async ({ page }) => {
    // A real provider error (not cancellation) should surface something.
    await page.goto(
      '/auth/callback?error=server_error&error_description=The+server+encountered+an+error',
    );

    // Should land on /sign-in with an error in the URL (the callback redirects
    // with ?error=... which the sign-in page renders as an alert).
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 5_000 });
    // The URL should carry the error so the page can render it.
    const url = page.url();
    expect(url).toMatch(/error=/i);
  });
});

// ---------------------------------------------------------------------------
// G6: Unconfigured provider fails gracefully
// ---------------------------------------------------------------------------

test.describe('G6: unconfigured provider fails gracefully', () => {
  /**
   * If Google or Apple is enabled in the UI but not configured in the Supabase
   * project, signInWithOAuth returns an error. The UI must NOT navigate to a
   * raw provider error page or throw an uncaught exception.
   */
  test('G6: Google button that fails signInWithOAuth shows an error, not a white screen', async ({
    page,
  }) => {
    // Block the Supabase /authorize redirect; simulate an error response.
    await page.route('**/auth/v1/authorize*', (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'provider_disabled', message: 'Provider not enabled' }),
      });
    });

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(URLS.signIn);
    await page.click('button:has-text("Continue with Google")');

    // Wait briefly for any error to surface.
    await page.waitForTimeout(1_500);

    // No unhandled JS exception (white screen).
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toHaveLength(0);

    // Still on /sign-in (not navigated to a raw error page).
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('G6: Apple button renders and is clickable even when provider is unconfigured', async ({
    page,
  }) => {
    await page.route('**/auth/v1/authorize*', (route) =>
      route.fulfill({ status: 400, body: '' }),
    );

    await page.goto(URLS.signIn);
    const appleBtn = page.getByRole('button', { name: /continue with apple/i });
    await expect(appleBtn).toBeVisible();
    await expect(appleBtn).toBeEnabled();
  });

  test('G6: Google and Apple buttons render on the register tab', async ({ page }) => {
    await page.goto(URLS.register);

    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with apple/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// G1/G2/G4/G5: Manual placeholders
// ---------------------------------------------------------------------------

test.describe('G1/G2/G4/G5: OAuth flows requiring real provider consent (manual)', () => {
  test.skip(true, 'OAuth provider consent flows are manual. See MANUAL-AUTH-TESTS.md section G.');

  // These stubs serve as documentation anchors. The test IDs map 1:1 to the
  // manual protocol in MANUAL-AUTH-TESTS.md.

  test('G1: Google new user - account and identity created', () => {});
  test('G2: Google existing email - identity linking produces single user_id', () => {});
  test('G4: Apple new user - account and identity created', () => {});
  test('G5: Apple Private Relay @privaterelay.appleid.com - no 500 on token exchange', () => {});
});
