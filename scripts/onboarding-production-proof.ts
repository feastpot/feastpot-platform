/**
 * Explicitly approved, isolated production vendor probe.
 * Never changes existing accounts, creates staff, fakes Stripe capabilities,
 * sends payments or deletes accounts. Credentials remain in process memory.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { PrismaClient, UserRole, UserStatus, VendorStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const dir = '.local/fx03-production-proof';
const manifestPath = `${dir}/vendor-manifest.json`;
const args = process.argv.slice(2);
const option = (key: string) =>
  args.find((arg) => arg.startsWith(`${key}=`))?.slice(key.length + 1);
const api = option('--api');
const portal = option('--portal');
const approved = args.includes('--approved-isolated-vendor');

async function main() {
  if (!approved || !api || !portal)
    throw new Error('EXPLICIT_APPROVAL_AND_VERIFIED_ORIGINS_REQUIRED');
  const db = process.env.PROD_DIRECT_URL ?? process.env.PROD_DATABASE_URL;
  const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.TEST_FACTORY_PASSWORD;
  if (!db || !key || !password) throw new Error('PRODUCTION_TEST_CONFIGURATION_MISSING');
  const target = new URL(db);
  const ref =
    /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(target.username))?.[1] ??
    /^db\.([a-z0-9]+)\.supabase\.co$/.exec(target.hostname)?.[1];
  if (
    !ref ||
    !/(\.pooler\.supabase\.com|\.supabase\.co)$/.test(target.hostname) ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(`//${ref}.`)
  )
    throw new Error('DISTINCT_PRODUCTION_SUPABASE_REQUIRED');
  const health = await fetch(`${api}/v1/health/z`);
  const healthText = await health.text();
  const healthBody = JSON.parse(healthText);
  const healthData = healthBody.data ?? healthBody;
  if (
    !health.ok ||
    healthData.checks?.supabase?.environment !== 'production' ||
    healthData.checks?.supabase?.ref !== ref
  )
    throw new Error('PRODUCTION_API_REQUIRED');
  mkdirSync(dir, { recursive: true });
  const prisma = new PrismaClient({ datasources: { db: { url: db } } });
  const auth = createClient(`https://${ref}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: import('playwright').Page | undefined;
  let manifest: { namespace: string; userId: string; vendorId?: string };
  const results: Record<string, unknown> = {
    at: new Date().toISOString(),
    environment: 'production',
    healthStatus: health.status,
    healthHash: createHash('sha256').update(healthText).digest('hex'),
    limitation:
      'Live evidence only. No claim of ready-to-trade, live KYC or physical iPhone Safari.',
    checks: [],
  };
  const resultPath = `${dir}/${args.includes('--journey-pages') ? 'production-journey' : 'production-baseline'}.json`;
  try {
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (!/^fx03-proof-[a-f0-9]{12}$/.test(manifest.namespace))
        throw new Error('INVALID_FIXTURE_MANIFEST');
      const user = await prisma.user.findUniqueOrThrow({ where: { id: manifest.userId } });
      if (!user.isTestData || user.email !== `tf-${manifest.namespace}@test.feastpot.co.uk`)
        throw new Error('EXISTING_ACCOUNT_NOT_OWNED_BY_PROBE');
    } else {
      const namespace = `fx03-proof-${randomBytes(6).toString('hex')}`;
      const email = `tf-${namespace}@test.feastpot.co.uk`;
      results.attemptedNamespace = namespace;
      const created = await auth.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'vendor', app_role: 'vendor', is_test_data: true },
        user_metadata: { full_name: 'PRODUCTION TEST ONLY', test_namespace: namespace },
      });
      if (created.error || !created.data.user) {
        results.authCreationFailure = {
          status: created.error?.status ?? null,
          code: created.error?.code ?? null,
          databaseFailure: /^Database error/i.test(created.error?.message ?? ''),
        };
        throw new Error('TEST_AUTH_ACCOUNT_CREATION_FAILED');
      }
      manifest = { namespace, userId: created.data.user.id };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      await prisma.user.upsert({
        where: { id: manifest.userId },
        create: {
          id: manifest.userId,
          email,
          firstName: 'PRODUCTION TEST',
          lastName: 'ONLY',
          role: UserRole.vendor,
          status: UserStatus.active,
          isTestData: true,
          provenance: 'test-factory',
        },
        update: {
          role: UserRole.vendor,
          status: UserStatus.active,
          isTestData: true,
          provenance: 'test-factory',
        },
      });
    }
    const ownAuth = await auth.auth.admin.getUserById(manifest.userId);
    if (ownAuth.error || ownAuth.data.user?.user_metadata?.test_namespace !== manifest.namespace)
      throw new Error('AUTH_FIXTURE_NAMESPACE_REQUIRED');
    if (ownAuth.data.user.app_metadata?.role !== 'vendor') {
      const updated = await auth.auth.admin.updateUserById(manifest.userId, {
        app_metadata: { role: 'vendor', app_role: 'vendor', is_test_data: true },
      });
      if (updated.error) throw new Error('OWNED_VENDOR_METADATA_UPDATE_FAILED');
    }
    const email = `tf-${manifest.namespace}@test.feastpot.co.uk`;
    const signedIn = await auth.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error('TEST_VENDOR_LOGIN_FAILED');
    const token = signedIn.data.session.access_token;
    async function check(path: string) {
      const response = await fetch(`${api}/v1${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      const data = body.data ?? body;
      const result = {
        path,
        status: response.status,
        code: data.code ?? null,
        canProfileGoLive: data.canProfileGoLive,
        blockingSteps: data.blockingPublication?.map((step: { name: string }) => step.name),
      };
      (results.checks as unknown[]).push(result);
      return data;
    }
    if (!manifest.vendorId) {
      // First record the genuine missing-profile API response, then provision
      // only this newly created account's approved but unpublished profile.
      await check('/vendors/me');
      const vendor = await prisma.vendor.create({
        data: {
          userId: manifest.userId,
          businessName: 'PRODUCTION TEST ONLY: mobile onboarding',
          slug: manifest.namespace,
          status: VendorStatus.approved,
          approvedAt: new Date(),
        },
      });
      manifest.vendorId = vendor.id;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
    const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: manifest.vendorId } });
    if (vendor.userId !== manifest.userId || vendor.status === VendorStatus.live)
      throw new Error('UNPUBLISHED_OWNED_FIXTURE_REQUIRED');
    await check('/vendors/me');
    await check('/vendors/me/onboarding-progress');
    await check('/terms/acceptance-status');
    await check('/vendors/me/stats');
    await check('/vendors/me/dashboard');
    results.stage = 'browser-launch';
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname === '/auth/v1/token') {
        results.browserLoginResponse = {
          status: response.status(),
          targetsProductionProject: url.hostname === `${ref}.supabase.co`,
        };
      }
    });
    results.stage = 'browser-sign-in-page';
    await page.goto(`${portal}/sign-in?next=/onboarding/welcome`, {
      waitUntil: 'domcontentloaded',
    });
    const emailInput = page.getByLabel('Email', { exact: true });
    const passwordInput = page.getByLabel('Password', { exact: true });
    await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
    results.stage = 'browser-sign-in-hydration';
    await emailInput.click();
    await page.waitForFunction(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="email"]');
      return input && !input.readOnly && !input.disabled;
    });
    results.stage = 'browser-sign-in-submit';
    await emailInput.fill(email);
    await passwordInput.click();
    await passwordInput.fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    results.stage = 'browser-sign-in-redirect';
    await page.waitForURL((url) => url.pathname !== '/sign-in', { timeout: 40_000 });
    results.browser = browser.version();
    results.pages = [];
    for (const [index, path] of (args.includes('--journey-pages')
      ? []
      : ['/onboarding/welcome', '/onboarding/terms']
    ).entries()) {
      await page.goto(`${portal}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(1500);
      const file = `${dir}/${index + 1}-mobile-${path.split('/').pop()}.jpg`;
      await page.screenshot({ path: file });
      (results.pages as unknown[]).push({
        requested: path,
        served: new URL(page.url()).pathname,
        headings: await page.locator('h1').allTextContents(),
        screenshot: file,
      });
    }
    if (args.includes('--accept-own-fixture-terms')) {
      const before = await prisma.termsAcceptance.count({
        where: { vendorId: vendor.id },
      });
      const checkbox = page.locator('#terms-accept-checkbox');
      if (await checkbox.count()) {
        const scrollArea = page.locator('div.overflow-y-auto').last();
        await scrollArea.hover();
        // Genuine input scrolls the terms. Do not change React state, remove
        // disabled, forge scrolledToEnd, or post acceptance directly.
        for (let i = 0; i < 30 && !(await checkbox.isEnabled()); i++) {
          await page.mouse.wheel(0, 2000);
          await page.waitForTimeout(100);
        }
        if (!(await checkbox.isEnabled())) throw new Error('GENUINE_TERMS_SCROLL_BLOCKED');
        await checkbox.check();
        await page.getByRole('button', { name: 'Accept and continue', exact: true }).click();
        await page.waitForURL((url) => url.pathname !== '/onboarding/terms', { timeout: 30000 });
      }
      const acceptance = await prisma.termsAcceptance.findFirst({
        where: { vendorId: vendor.id },
        orderBy: { acceptedAt: 'desc' },
      });
      results.termsAudit = acceptance
        ? {
            id: acceptance.id,
            termsVersionId: acceptance.termsVersionId,
            acceptedAt: acceptance.acceptedAt,
            hasIp: !!acceptance.ipAddress,
            hasUserAgent: !!acceptance.userAgent,
            contentHash: acceptance.contentHash,
            scrolledToEnd: acceptance.scrolledToEnd,
            method: acceptance.method,
            newAcceptanceRecorded: before === 0,
          }
        : null;
      await check('/terms/acceptance-status');
      await check('/vendors/me/onboarding-progress');
      await page.screenshot({ path: `${dir}/3-mobile-after-terms.jpg` });
    }
    if (args.includes('--journey-pages')) {
      results.blockedAutomaticMutations = [];
      await context.route(`${api}/v1/**`, async (route) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
          (results.blockedAutomaticMutations as unknown[]).push({
            method: route.request().method(),
            path: new URL(route.request().url()).pathname,
          });
          await route.abort();
        } else await route.continue();
      });
      results.journeyPages = [];
      for (const [index, path] of [
        '/account-and-compliance',
        '/tax-information',
        '/menu',
        '/availability',
        '/settings/delivery',
        '/referrals',
      ].entries()) {
        const started = Date.now();
        await page.goto(`${portal}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        let qrVisibleMs: number | undefined;
        if (path === '/referrals') {
          const qr = page.locator('img[alt^="QR code for"]');
          await qr.waitFor({ state: 'visible', timeout: 15000 });
          await qr.evaluate(async (image) => (image as HTMLImageElement).decode());
          qrVisibleMs = Date.now() - started;
        } else await page.waitForTimeout(1000);
        const file = `${dir}/${index + 4}-mobile-${path.split('/').pop()}.jpg`;
        await page.screenshot({ path: file });
        (results.journeyPages as unknown[]).push({
          requested: path,
          served: new URL(page.url()).pathname,
          headings: await page.locator('h1').allTextContents(),
          alerts: await page.locator('[role="alert"]').allTextContents(),
          qrVisibleMs,
          qrUnderFiveSeconds: qrVisibleMs === undefined ? undefined : qrVisibleMs < 5000,
          screenshot: file,
        });
      }
    }
    const publicProfile = await fetch(`${api}/v1/vendors/${vendor.slug}`);
    results.publicFixtureProfileStatus = publicProfile.status;
    await publicProfile.body?.cancel();
    results.fixtureRemainsUnpublished = true;
    writeFileSync(resultPath, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    // Never print provider errors, connection strings, passwords or sessions.
    results.error = error instanceof Error ? error.name : 'UNKNOWN_PROBE_ERROR';
    if (page) {
      results.lastBrowserPath = new URL(page.url()).pathname;
      const screenshot = `${dir}/mobile-blocked.jpg`;
      await page
        .screenshot({ path: screenshot, mask: [page.locator('input[type="password"]')] })
        .then(() => {
          results.blockedScreenshot = screenshot;
        })
        .catch(() => undefined);
    }
    if (error instanceof Error && /^[A-Z_]+$/.test(error.message))
      results.errorCode = error.message;
    writeFileSync(resultPath, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROBE_FAILED',
  );
  process.exitCode = 1;
});
