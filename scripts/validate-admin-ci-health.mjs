import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isAdminCiReady(health) {
  return Boolean(
    health &&
    ['ok', 'degraded'].includes(health.status) &&
    health.environment === 'test' &&
    health.checks?.database === 'ok' &&
    health.checks?.redis === 'ok',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (!isAdminCiReady(JSON.parse(readFileSync(process.argv[2], 'utf8')))) {
      process.exitCode = 1;
    }
  } catch {
    // Health bodies and filesystem/connection details remain private.
    process.exitCode = 1;
  }
}
