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
  workers: 1,
  // Shard independent tests rather than whole, unevenly sized spec files.
  // Each runner still executes one test at a time in its own API/Redis scope.
  fullyParallel: !!process.env.CI_SHARD,
  maxFailures: 0,
  metadata: {
    ciRunId: process.env.GITHUB_RUN_ID,
    ciRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
    ciCommitSha: process.env.GITHUB_SHA,
    ciShard: process.env.CI_SHARD,
  },
  // CI keeps a JSON result so the required customer-purchase guard can prove
  // CP-1 was discovered and actually ran rather than being silently skipped.
  reporter: [['list'], ['json', { outputFile: 'e2e-results.json' }]],

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
