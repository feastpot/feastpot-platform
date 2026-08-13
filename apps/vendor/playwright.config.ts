import { execSync } from 'child_process';

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the @feastpot/vendor e2e test suite.
 *
 * Browser resolution order:
 *   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var (CI override)
 *   2. `which chromium`  (pkgs.chromium from replit.nix - always present on Replit)
 *   3. Empty string      (falls back to Playwright's own downloaded browser)
 *
 * This avoids the "libglib-2.0.so.0: cannot open shared object file" crash
 * that occurs when Playwright's self-downloaded headless shell is run on
 * NixOS because the binary expects glibc paths that don't exist there.
 * The system pkgs.chromium binary is already patchelf'd for NixOS.
 *
 * Environment variables:
 *   PLAYWRIGHT_BASE_URL   - Vendor portal origin. Defaults to http://localhost:3002.
 *   TEST_VENDOR_EMAIL     - Supabase email for the pre-seeded test vendor account.
 *   TEST_VENDOR_PASSWORD  - Corresponding password.
 *
 * Run:
 *   npm run test:e2e --workspace=@feastpot/vendor
 */

function resolveChromiumPath(): string {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    return execSync('which chromium', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const CHROMIUM_PATH = resolveChromiumPath();

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
    // Use the NixOS-patchelf'd system Chromium so the binary can find
    // libglib and other shared libraries that don't exist at the paths
    // Playwright's own downloaded headless shell expects on NixOS/Replit.
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
  },

  projects: [
    // ── Auth project: signs in once and saves cookies/localStorage ──────────
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
      },
    },

    // ── Menu screen test suite ───────────────────────────────────────────────
    {
      name: 'menu-screen',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
        ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
      },
      dependencies: ['setup'],
    },
  ],
});
