import { defineConfig, devices } from '@playwright/test';
import { browserAuthState } from '../../scripts/browser-auth-state';

const adminStorageState = browserAuthState('admin', 'admin');

/**
 * Playwright configuration for the @feastpot/admin e2e test suite.
 *
 * Browser resolution:
 *   Playwright resolves the browser binary through its own registry.
 *   The test:e2e npm script runs e2e/install-chromium.js first, which
 *   symlinks downloaded Chromium binaries to the NixOS system Chromium
 *   (already patchelf'd), fixing the missing-libglib crash on Replit.
 *
 * Environment variables:
 *   PLAYWRIGHT_BASE_URL    Admin app origin. Defaults to http://localhost:3003.
 *   TEST_FACTORY_NAMESPACE Namespaced real staff/customer/vendor factory identities.
 *   ADMIN_REQUIRE_AAL2 and NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 must both be true.
 *   ADMIN_E2E_ALLOW_AAL1 must be disabled; setup performs genuine TOTP verification.
 *
 * Run:
 *   npm run test:e2e --workspace=@feastpot/admin
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  maxFailures: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
    ['json', { outputFile: 'e2e-results.json' }],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    // ── Auth: sign in once and save session ──────────────────────────────────
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      teardown: 'auth-teardown',
      use: { trace: 'off', screenshot: 'off', video: 'off' },
    },
    {
      name: 'auth-teardown',
      testMatch: /auth\.teardown\.ts/,
    },

    // ── Debounce tests ───────────────────────────────────────────────────────
    {
      name: 'debounce',
      testMatch: /debounce\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: adminStorageState,
      },
      dependencies: ['setup'],
    },

    // ── Admin shell tests ─────────────────────────────────────────────────────
    {
      name: 'admin-shell',
      testMatch: /admin-shell\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: adminStorageState,
      },
      dependencies: ['setup'],
    },

    // ── Catering SLA tests ────────────────────────────────────────────────────
    {
      name: 'catering-sla',
      testMatch: /catering-sla\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: adminStorageState,
      },
      dependencies: ['setup'],
    },
    {
      name: 'admin-compliance',
      testMatch: /admin-compliance\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: adminStorageState,
      },
      dependencies: ['setup'],
    },

    // ── Vendors page tests ─────────────────────────────────────────────────────
    {
      name: 'vendors',
      testMatch: /vendors\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: adminStorageState,
      },
      dependencies: ['setup'],
    },
    // ── Authorization matrix ─────────────────────────────────────────────────
    {
      name: 'admin-destination-map',
      testMatch: /admin-destination-map\.spec\.ts/,
    },
    {
      name: 'admin-destination-matrix',
      testMatch: /admin-destination-matrix\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },
  ],
});
