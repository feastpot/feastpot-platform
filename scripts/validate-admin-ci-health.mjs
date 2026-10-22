import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isAdminCiReady(health) {
  return Boolean(
    health &&
    ['ok', 'degraded'].includes(health.status) &&
    health.environment === 'test' &&
    health.checks?.database === 'ok' &&
    health.checks?.redis === 'ok' &&
    health.checks?.secrets === 'ok',
  );
}

export function readinessDiagnostics(health) {
  return {
    responseParsed: Boolean(health && typeof health === 'object'),
    testEnvironment: health?.environment === 'test',
    databaseReady: health?.checks?.database === 'ok',
    redisReady: health?.checks?.redis === 'ok',
    requiredSecretsReady: health?.checks?.secrets === 'ok',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let health;
  try {
    health = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  } catch {
    // Health bodies and filesystem/connection details remain private.
    health = undefined;
  }
  if (process.argv.includes('--diagnose')) {
    process.stdout.write(JSON.stringify(readinessDiagnostics(health)) + '\n');
  } else if (!isAdminCiReady(health)) {
    process.exitCode = 1;
  }
}
