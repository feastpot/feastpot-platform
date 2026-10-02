import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Set by the runner config, inherited by workers, and outside Playwright output cleanup. */
export function browserAuthState(app: 'vendor' | 'admin', role: string): string {
  process.env.FEASTPOT_E2E_AUTH_ROOT ??= join(tmpdir(), 'feastpot-browser-auth', randomUUID());
  const directory = join(process.env.FEASTPOT_E2E_AUTH_ROOT, app);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return join(directory, `${role}.json`);
}
