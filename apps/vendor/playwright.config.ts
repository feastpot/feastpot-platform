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
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
    ['json', { outputFile: 'e2e-results.json' }],
  ],

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

    // ── Menu screen – mobile Chromium emulation (375×812, iPhone 12) ─────────
    // Covers the TopNav two-row header that renders on screens narrower than
    // the md:hidden breakpoint (768 px). T10 (desktop SideNav) and T10-mobile
    // (mobile TopNav) guard the same layout invariant on their respective surfaces.
    {
      name: 'menu-screen-mobile',
      testMatch: /menu-screen\.spec\.ts/,
      use: {
        ...devices['iPhone 12'],
        browserName: 'chromium',
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

    // ── Verification state banner (dashboard) test suite ──────────────────────
    {
      name: 'verification-state-banner',
      testMatch: /verification-state-banner\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Merged Orders screen test suite (M1–M4) ───────────────────────────────
    {
      name: 'orders-screen',
      testMatch: /orders-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── End-to-end vendor lifecycle (onboarding → fulfilment → payout) ───────
    {
      name: 'vendor-lifecycle',
      testMatch: /vendor-lifecycle\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Share and Customers screen test suite (S1–S6) ─────────────────────────
    {
      name: 'share-screen',
      testMatch: /share-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Performance screen test suite (PF1–PF5) ───────────────────────────────
    {
      name: 'performance-screen',
      testMatch: /performance-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Account and compliance screen test suite (A1–A5) ──────────────────────
    {
      name: 'account-compliance-screen',
      testMatch: /account-compliance-screen\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },

    // ── Empty-vendor canonical destination coverage ────────────────────────────
    {
      name: 'empty-vendor-screen',
      testMatch: /empty-vendor-screen\.spec\.ts/,
      grep: /EV[1-4]|EV6/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'empty-vendor-screen-mobile',
      testMatch: /empty-vendor-screen\.spec\.ts/,
      grep: /EV5/,
      use: {
        ...devices['iPhone 12'],
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },
    // ── Auth identity/profile mismatch regression ─────────────────────────────
    {
      name: 'vendor-missing-profile',
      testMatch: /vendor-missing-profile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },
    // ── State-matrix setup and cleanup ─────────────────────────────────────────
    // The matrix owns isolated V1-V11 test-factory identities. It does not reuse
    // the shared test vendor or mutate developer/demo seed data.
    {
      name: 'vendor-state-matrix-setup',
      testMatch: /vendor-state-matrix\.setup\.ts/,
      teardown: 'vendor-state-matrix-teardown',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'vendor-state-matrix',
      testMatch: /vendor-state-matrix\.spec\.ts/,
      grep: /V(?:[1-9]|10|11) routes render/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['vendor-state-matrix-setup'],
    },
    {
      name: 'vendor-state-matrix-mobile',
      testMatch: /vendor-state-matrix\.spec\.ts/,
      grep: /V4 routes do not overflow/,
      use: {
        ...devices['iPhone 12'],
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
      },
      dependencies: ['vendor-state-matrix-setup'],
    },
    // ── Factory-backed cross-vendor authorization contract ─────────────────────
    {
      name: 'vendor-authorization',
      testMatch: /vendor-authorization\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['vendor-state-matrix-setup'],
    },
    {
      name: 'vendor-order-contracts',
      testMatch: /vendor-order-contracts\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['vendor-state-matrix-setup'],
    },
    {
      name: 'vendor-menu-contracts',
      testMatch: /vendor-menu-contracts\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['vendor-state-matrix-setup'],
    },
    {
      name: 'vendor-lifecycle-evidence',
      testMatch: /vendor-lifecycle-evidence\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['vendor-state-matrix-setup'],
    },
    {
      name: 'vendor-state-matrix-teardown',
      testMatch: /vendor-state-matrix\.teardown\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // ── Cross-cutting tests (X1–X2) ───────────────────────────────────────────
    // X1 audits every interactive control on all four screens for observable
    // effects. X2 checks nav and header rendering at a 40-char business name.
    {
      name: 'cross-cutting',
      testMatch: /cross-cutting\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
    },
  ],
});
