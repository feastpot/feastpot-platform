import { defineConfig, devices } from '@playwright/test';

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
 *   TEST_ADMIN_EMAIL       Supabase email for the pre-seeded test admin account.
 *   TEST_ADMIN_PASSWORD    Corresponding password.
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
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],

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
    },

    // ── Debounce tests ───────────────────────────────────────────────────────
    {
      name: 'debounce',
      testMatch: /debounce\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // ── Admin shell tests ─────────────────────────────────────────────────────
    {
      name: 'admin-shell',
      testMatch: /admin-shell\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // ── Catering SLA tests ────────────────────────────────────────────────────
    {
      name: 'catering-sla',
      testMatch: /catering-sla\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // ── Vendors page tests ─────────────────────────────────────────────────────
    {
      name: 'vendors',
      testMatch: /vendors\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
});
