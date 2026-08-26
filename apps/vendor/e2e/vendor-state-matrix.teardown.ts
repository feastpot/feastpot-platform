import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import { test as teardown } from '@playwright/test';

import { TestDataFactory } from '../../../scripts/test-factory';

import {
  matrixManifestPath,
  matrixNamespace,
  type VendorStateMatrixManifest,
} from './helpers/vendor-state-matrix';

teardown('remove V4–V8 vendor matrix fixtures', async () => {
  const namespace = matrixNamespace();
  const manifestPath = matrixManifestPath(namespace);
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as VendorStateMatrixManifest;
  const factory = TestDataFactory.fromEnvironment({ namespace: manifest.namespace });

  try {
    for (const identity of Object.values(manifest.identities)) {
      await factory.teardown(identity);
    }
  } finally {
    await factory.dispose();
    rmSync(dirname(manifestPath), { recursive: true, force: true });
  }
});
