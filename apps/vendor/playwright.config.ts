import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the @feastpot/vendor e2e test suite.
 *
 * Environment variables:
 *   PLAYWRIGHT_BASE_URL   - Vendor portal origin. Defaults to http://localhost:3002.
 *   TEST_VENDOR_EMAIL     - Supabase email for the pre-seeded test vendor account.
 *   TEST_VENDOR_PASSWORD  - Corresponding password.
 *
 * Run:
 *   npx playwright install chromium   (first time only)
 *   npm run test:e2e --workspace=@feastpot/vendor
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Viewport chosen to keep the SideNav visible so bounding-box tests
    // on the desktop nav are deterministic.
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    // ── Auth project: signs in once and saves cookies/localStorage ──────────
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // ── Menu screen test suite ───────────────────────────────────────────────
    {
      name: 'menu-screen',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },
  ],
});
