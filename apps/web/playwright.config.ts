import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Feastpot customer web app.
 *
 * Tests live in apps/web/e2e/. Run with:
 *   npx playwright test --config apps/web/playwright.config.ts
 *
 * Browser binaries must be installed once:
 *   npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // Always start with a clean browser context so tests are isolated.
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Next.js dev server when running locally.
  // In CI the server is expected to be running already.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev --workspace=@feastpot/web',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
