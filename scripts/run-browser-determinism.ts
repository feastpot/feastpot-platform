import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { browserAuthState } from './browser-auth-state';
import { TestDataFactory, type TestIdentity } from './test-factory';

const output = resolve('.local/browser-determinism');
mkdirSync(output, { recursive: true });
const namespace = `browser-${Date.now()}`;
const deadline = Date.now() + 40 * 60_000;
browserAuthState('vendor', 'vendor');
const report: Record<string, unknown> = { namespace, startedAt: new Date().toISOString() };
const save = () => writeFileSync(resolve(output, 'summary.json'), JSON.stringify(report, null, 2));

function counts(path: string, startedAt: number) {
  if (!existsSync(path)) return { reportMissing: true };
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const reportStartedAt = Date.parse(json.stats?.startTime ?? '');
  if (!Number.isFinite(reportStartedAt) || reportStartedAt < startedAt)
    return { reportMissing: true };
  const result = { passed: 0, failed: 0, skipped: 0, didNotRun: 0, interrupted: 0 };
  function visit(suite: { specs?: any[]; suites?: any[] }) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.at(-1);
        if (!last) result.didNotRun++;
        else if (last.status === 'passed') result.passed++;
        else if (last.status === 'skipped') {
          if (test.annotations?.some((annotation: { type: string }) => annotation.type === 'skip'))
            result.skipped++;
          else result.didNotRun++;
        } else if (last.status === 'interrupted') result.interrupted++;
        else result.failed++;
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(json);
  return result;
}

async function run(app: string, credentials?: TestIdentity['credentials']) {
  const startedAt = Date.now();
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`Harness runtime budget exhausted before ${app}.`);
  const cwd = resolve('apps', app);
  const resultPath = resolve(output, `${app}.json`);
  const env = {
    ...process.env,
    CI: '',
    ADMIN_REQUIRE_AAL2: 'true',
    NEXT_PUBLIC_ADMIN_REQUIRE_AAL2: 'true',
    ADMIN_E2E_ALLOW_AAL1: 'false',
    TEST_FACTORY_NAMESPACE: `${namespace}-${app}`,
    TEST_API_URL: 'http://127.0.0.1:3001',
    PLAYWRIGHT_BASE_URL: `http://localhost:${app === 'web' ? 3000 : app === 'vendor' ? 3002 : 3003}`,
    PLAYWRIGHT_JSON_OUTPUT_NAME: resultPath,
    PLAYWRIGHT_JSON_OUTPUT_FILE: resultPath,
    ...(credentials
      ? { TEST_VENDOR_EMAIL: credentials.email, TEST_VENDOR_PASSWORD: credentials.password! }
      : {}),
  };
  const exit = await new Promise<number | null>((done) => {
    const child = spawn(
      resolve('node_modules/.bin/playwright'),
      [
        'test',
        '--workers=1',
        '--retries=0',
        '--max-failures=0',
        `--global-timeout=${Math.min(1_200_000, remaining)}`,
      ],
      { cwd, env, stdio: 'inherit' },
    );
    child.on('error', () => done(null));
    child.on('exit', done);
  });
  const suiteCounts = counts(
    existsSync(resultPath) ? resultPath : resolve(cwd, 'e2e-results.json'),
    startedAt,
  );
  report[app] = { exit, ...suiteCounts };
  if (exit !== 0 || 'reportMissing' in suiteCounts) process.exitCode = 1;
  save();
  console.log(`BROWSER_SUITE_RESULT ${app} ${JSON.stringify(report[app])}`);
}

async function main() {
  console.log('BROWSER_STAGE provisioning all documented identities');
  save();
  const factory = TestDataFactory.fromEnvironment({ namespace: `${namespace}-shared` });
  let identities: TestIdentity[] = [];
  try {
    identities = await factory.createAll();
    const vendor = identities.find((identity) => identity.state === 'V4')!;
    const menus = await factory.prisma.menu.count({ where: { vendorId: vendor.vendorId } });
    const orders = await factory.prisma.order.count({ where: { vendorId: vendor.vendorId } });
    if (menus || orders) throw new Error('V4 factory is not zero-data.');
    report.factory = {
      states: identities.map((identity) => identity.state),
      v4Menus: menus,
      v4Orders: orders,
    };
    save();
    for (const identity of identities.filter((identity) => identity !== vendor)) {
      await factory.teardown(identity);
    }
    identities = [vendor];
    for (const app of ['vendor', 'admin']) {
      const child = spawn('node', [`apps/${app}/e2e/install-chromium.js`], { stdio: 'inherit' });
      await new Promise<void>((done) => child.on('exit', () => done()));
    }
    console.log('BROWSER_STAGE running customer suite');
    await run('web');
    console.log('BROWSER_STAGE running vendor suite');
    await run('vendor', vendor.credentials);
    const state = browserAuthState('vendor', 'vendor');
    report.vendorSessionIntact = existsSync(state);
    if (existsSync(state)) {
      report.vendorSessionHash = createHash('sha256').update(readFileSync(state)).digest('hex');
    }
    save();
    console.log('BROWSER_STAGE running admin suite');
    await run('admin');
  } catch (error) {
    // Do not dump provider request objects or credentials into the report.
    report.blocker = error instanceof Error ? error.message : 'Harness setup failed';
    save();
    process.exitCode = 1;
  } finally {
    for (const identity of identities) await factory.teardown(identity);
    await factory.dispose();
    report.finishedAt = new Date().toISOString();
    save();
  }
}

void main();
