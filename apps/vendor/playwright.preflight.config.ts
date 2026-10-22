import { defineConfig } from '@playwright/test';

/** Separate inventory: never replace or filter the authoritative eight projects. */
export default defineConfig({
  testDir: './preflight',
  testMatch: 'vendor-preflight.spec.ts',
  timeout: 180_000,
  globalTimeout: 250_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  forbidOnly: true,
  reporter: [['line'], ['json', { outputFile: 'preflight-results.json' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3002',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    // Cookie/JWT-bearing traces, screenshots and video are not uploadable diagnostics.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'vendor-preflight' }],
});
