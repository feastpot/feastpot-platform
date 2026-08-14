import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the @feastpot/vendor e2e test suite.
 *
 * Browser resolution:
 *   Playwright resolves the browser binary through its own registry; the
 *   use.executablePath config key is silently ignored in this bundled
 *   version of @playwright/test. To point at the NixOS system Chromium
 *   (pkgs.chromium in replit.nix) instead of the downloaded headless shell
 *   that crashes with a missing-libglib error, the test:e2e npm script runs
 *   e2e/install-chromium.js first. That script symlinks every downloaded
 *   chrome/chrome-headless-shell binary to the system Chromium binary,
 *   which is already correctly patchelf'd for NixOS.
 *
 * Environment variables:
 *   PLAYWRIGHT_BASE_URL   - Vendor portal origin. Defaults to http://localhost:3002.
 *   TEST_VENDOR_EMAIL     - Supabase email for the pre-seeded test vendor account.
 *   TEST_VENDOR_PASSWORD  - Corresponding password.
 *   TEST_API_URL          - NestJS API origin for D3 integration search assertions.
 *                           Defaults to http://localhost:3001.
 *
 * Run:
 *   npx playwright install chromium   (first time only - downloads browser package)
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
      testMatch: /menu-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Menu screen – mobile viewport (375×812, iPhone 12) ───────────────────
    // Covers the TopNav two-row header that renders on screens narrower than
    // the md:hidden breakpoint (768 px). T10 (desktop SideNav) and T10-mobile
    // (mobile TopNav) guard the same layout invariant on their respective surfaces.
    {
      name: 'menu-screen-mobile',
      testMatch: /menu-screen\.spec\.ts/,
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 375, height: 812 },
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Availability settings test suite ─────────────────────────────────────
    {
      name: 'availability-screen',
      testMatch: /availability-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Delivery settings test suite ─────────────────────────────────────────
    {
      name: 'delivery-screen',
      testMatch: /delivery-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Profile settings test suite ──────────────────────────────────────────
    {
      name: 'profile-screen',
      testMatch: /profile-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },
  ],
});
