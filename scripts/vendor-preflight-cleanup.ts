import { cleanupPreflight, preflightNamespaces } from '../apps/vendor/e2e/helpers/vendor-preflight';

import { TestDataFactory } from './test-factory';

async function main() {
  const root = process.env.TEST_FACTORY_NAMESPACE ?? '';
  const scopes = preflightNamespaces(root);
  await cleanupPreflight(root, [
    {
      namespace: scopes.actor,
      state: 'V4',
      factory: TestDataFactory.fromEnvironment({ namespace: scopes.actor }),
    },
    {
      namespace: scopes.target,
      state: 'V9',
      factory: TestDataFactory.fromEnvironment({ namespace: scopes.target }),
    },
  ]);
}

main().catch(() => {
  console.error('VENDOR_PREFLIGHT_CLEANUP_FAILED: inspect safe preflight step diagnostics');
  process.exitCode = 1;
});
