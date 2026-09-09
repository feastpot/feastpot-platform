import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './cross-surface',
  testMatch: /platform-facts\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'part-a-results.json' }]],
  projects: [{ name: 'part-a-platform-facts', use: { browserName: 'chromium' } }],
});
