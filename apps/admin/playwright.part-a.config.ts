import { defineConfig } from '@playwright/test';
import { browserAuthState } from '../../scripts/browser-auth-state';

// Initialise in the runner so setup and facts workers inherit the same private directory.
browserAuthState('admin', 'admin');

export default defineConfig({
  testDir: './cross-surface',
  testMatch: /platform-facts\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'part-a-results.json' }]],
  projects: [
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: /auth\.setup\.ts/,
      teardown: 'auth-teardown',
      use: { trace: 'off', screenshot: 'off', video: 'off' },
    },
    {
      name: 'auth-teardown',
      testDir: './e2e',
      testMatch: /auth\.teardown\.ts/,
    },
    {
      name: 'part-a-platform-facts',
      dependencies: ['setup'],
      use: { browserName: 'chromium' },
    },
  ],
});
