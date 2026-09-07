import { defineConfig } from '@playwright/test';

/**
 * Bounded, source-only Part D gate. It deliberately has one project and one
 * spec so a broad admin E2E run cannot make its required inventory ambiguous.
 */
export default defineConfig({
  testDir: './cross-surface',
  testMatch: /data-truthfulness\.spec\.ts/,
  timeout: 15_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'cross-surface-results.json' }]],
  projects: [{ name: 'cross-surface-consistency' }],
});
