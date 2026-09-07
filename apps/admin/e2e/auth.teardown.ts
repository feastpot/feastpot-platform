import { test as teardown } from '@playwright/test';
import { TestDataFactory } from '../../../scripts/test-factory';

/** Remove only the current factory namespace after all dependent projects end. */
teardown('remove staff matrix identities', async () => {
  teardown.setTimeout(120_000);
  const factory = TestDataFactory.fromEnvironment();
  try {
    for (const state of ['A1', 'A3', 'A4', 'A5', 'C1', 'V4'] as const) {
      await factory.teardownState(state);
    }
  } finally {
    await factory.dispose();
  }
});
