/**
 * Real signed-in development browser checks. No auth/API mocks or production writes.
 * Run with ts-node/register/transpile-only, module CommonJS, ES2022.
 */
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TestDataFactory, totp, type TestIdentity } from './test-factory';

const api = 'http://127.0.0.1:3001/v1';
const output = 'screenshots/storage-lifecycle-browser';
const namespace = `storage-browser-${randomUUID()}`;
const results: string[] = [];
let phase = 'development prerequisites';
const objects: Array<{ bucket: string; path: string }> = [];
const identities: TestIdentity[] = [];
const errors: string[] = [];
const navigationCancellations: string[] = [];
let activePage: Page | undefined;
const pdf = Buffer.from('%PDF-1.7\nHarmless browser storage lifecycle fixture\n%%EOF\n');
function pass(message: string) {
  results.push(message);
  console.log(`PASS: ${message}`);
}

async function main() {
  const health = await (await fetch(`${api}/health/z`)).json();
  if (health.checks?.supabase?.environment !== 'development')
    throw Error('DEVELOPMENT_API_REQUIRED');
  const factory = new TestDataFactory({ namespace, databaseUrl: process.env.SUPABASE_DIRECT_URL });
  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const browser = await chromium.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
    headless: true,
  });
  mkdirSync(output, { recursive: true });
  function watch(page: Page) {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).pathname.includes('/v1/')) {
        const message = `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`;
        if (request.failure()?.errorText === 'net::ERR_ABORTED')
          navigationCancellations.push(message);
        else errors.push(message);
      }
    });
    page.on('response', (r) => {
      if (r.url().includes('/v1/') && r.status() >= 400) {
        const u = new URL(r.url());
        errors.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
      }
    });
  }
  async function login(page: Page, origin: string, identity: TestIdentity) {
    await page.goto(`${origin}/sign-in`, { waitUntil: 'load', timeout: 90_000 });
    for (const [selector, value] of [
      ['#email', identity.credentials.email],
      ['#password', identity.credentials.password!],
    ]) {
      const input = page.locator(selector);
      await input.waitFor({ state: 'visible', timeout: 60_000 });
      await expect(input.locator('xpath=ancestor::form')).toHaveAttribute('method', 'post');
      await page.waitForFunction((id) => {
        const element = document.querySelector(id);
        return element && Object.keys(element).some((key) => key.startsWith('__reactProps'));
      }, selector);
      await input.evaluate((element) => element.blur());
      await input.click();
      await expect(input).toBeEditable({ timeout: 30_000 });
      await input.fill(value);
    }
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 90_000 });
  }
  async function docs(token: string, vendorId: string) {
    const response = await fetch(`${api}/vendors/${vendorId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw Error('DOCUMENT_LIST_FAILED');
    return response.json();
  }
  function remember(url: string) {
    const match = new URL(url).pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (!match) throw Error('MANAGED_OBJECT_EXPECTED');
    const ref = { bucket: match[1], path: decodeURIComponent(match[2]) };
    objects.push(ref);
    return ref;
  }
  async function absent(ref: { bucket: string; path: string }) {
    const response = await storage.storage.from(ref.bucket).download(ref.path);
    if (response.data || (response.error?.statusCode !== '404' && response.error?.status !== 404))
      throw Error('OBJECT_NOT_CONFIRMED_DELETED');
  }
  try {
    phase = 'vendor fixture';
    const vendor = await factory.create('V4');
    identities.push(vendor);
    const token = await factory.issueAccessToken(vendor);
    // V4's baseline documents are factory-owned; start this row empty.
    await factory.prisma.vendorDocument.deleteMany({
      where: { vendorId: vendor.vendorId, type: 'insurance' },
    });
    const vc = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    // Forward configured public API URLs to the REAL development API. No mocks,
    // and no browser request is allowed to reach production.
    await vc.route('https://api.feastpot.co.uk/**', async (route) => {
      const original = new URL(route.request().url());
      const response = await route.fetch({
        url: `http://127.0.0.1:3001${original.pathname}${original.search}`,
      });
      await route.fulfill({ response });
    });
    const vp = await vc.newPage();
    activePage = vp;
    watch(vp);
    phase = 'real vendor sign-in';
    await login(vp, 'http://localhost:3002', vendor);
    await vp.goto('http://localhost:3002/account-and-compliance', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    const row = vp.locator('#doc-insurance');
    await row.waitFor({ state: 'visible', timeout: 90_000 });
    phase = 'vendor upload';
    const firstName = 'browser-insurance-first.pdf';
    await vp.waitForFunction(() => {
      const input = document.querySelector('#doc-insurance input[type=file]');
      return input && Object.keys(input).some((key) => key.startsWith('__reactProps'));
    });
    const firstChooser = vp.waitForEvent('filechooser');
    await row.getByRole('button', { name: /^(Upload|Replace) document$/ }).click();
    const request = vp.waitForResponse(
      (r) =>
        r.url().includes(`/vendors/${vendor.vendorId}/documents`) &&
        r.request().method() === 'POST',
    );
    await (
      await firstChooser
    ).setFiles({ name: firstName, mimeType: 'application/pdf', buffer: pdf });
    const created = await request;
    expect(created.status()).toBe(201);
    await expect(row).toContainText(firstName, { timeout: 30_000 });
    const first = (await docs(token, vendor.vendorId!)).find((d: any) => d.type === 'insurance');
    const oldRef = remember(first.fileUrl);
    await vp.reload({ waitUntil: 'domcontentloaded' });
    await expect(row).toContainText(firstName, { timeout: 30_000 });
    pass('Vendor UI upload persists after reload');
    phase = 'vendor replacement';
    const secondName = 'browser-insurance-replacement.pdf';
    const replacement = vp.waitForResponse(
      (r) => r.url().includes(`/documents/${first.id}`) && r.request().method() === 'PUT',
    );
    const nextChooser = vp.waitForEvent('filechooser');
    await row.getByRole('button', { name: 'Replace document', exact: true }).click();
    await (
      await nextChooser
    ).setFiles({ name: secondName, mimeType: 'application/pdf', buffer: pdf });
    expect((await replacement).status()).toBe(200);
    await expect(row).toContainText(secondName, { timeout: 30_000 });
    const current = (await docs(token, vendor.vendorId!)).filter(
      (d: any) => d.type === 'insurance',
    );
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(first.id);
    expect(current[0].status).toBe('pending');
    const newRef = remember(current[0].fileUrl);
    await absent(oldRef);
    await vp.reload({ waitUntil: 'domcontentloaded' });
    await expect(row).toContainText(secondName, { timeout: 30_000 });
    await row.scrollIntoViewIfNeeded();
    await vp.screenshot({ path: `${output}/vendor-replaced-desktop.png` });
    await vp.setViewportSize({ width: 390, height: 844 });
    await row.scrollIntoViewIfNeeded();
    await expect(row.getByRole('button', { name: /delete/i })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Replace document' })).toBeVisible();
    await vp.screenshot({ path: `${output}/vendor-replaced-mobile.png` });
    pass(
      'Replacement uses PUT, preserves row ID, resets pending, removes old object and persists on desktop/mobile',
    );
    phase = 'vendor deletion cancellation';
    vp.once('dialog', (dialog) => dialog.dismiss());
    await row.getByRole('button', { name: /delete/i }).click();
    await expect(row).toContainText(secondName);
    expect((await docs(token, vendor.vendorId!)).some((d: any) => d.id === first.id)).toBe(true);
    const retained = await storage.storage.from(newRef.bucket).download(newRef.path);
    expect(retained.error).toBeNull();
    expect(retained.data).toBeTruthy();
    pass('Cancelling deletion preserves both row and actual file');
    phase = 'vendor confirmed deletion';
    const deletion = vp.waitForResponse(
      (r) => r.url().includes(`/documents/${first.id}`) && r.request().method() === 'DELETE',
    );
    vp.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: /delete/i }).click();
    const deleted = await deletion;
    expect(deleted.status()).toBe(200);
    const response = await deleted.json();
    expect(response.storageCleanup).toBe('complete');
    await expect(row).not.toContainText(secondName, { timeout: 30_000 });
    await expect(
      vp.getByText('The stored file has also been removed.', { exact: true }),
    ).toBeVisible();
    await absent(newRef);
    await vp.reload({ waitUntil: 'domcontentloaded' });
    await expect(row.getByRole('button', { name: 'Upload document' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(row).not.toContainText(secondName);
    await row.scrollIntoViewIfNeeded();
    await vp.screenshot({ path: `${output}/vendor-deleted-mobile.png` });
    pass(
      'Confirmed deletion removes row/file, shows accurate toast and remains deleted after reload',
    );
    phase = 'vendor denied staff report';
    await vp.goto('http://localhost:3003/storage-reconciliation', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await expect(vp).toHaveURL(/\/unauthorized(?:\?|$)/, { timeout: 30_000 });
    const denied = await fetch(`${api}/admin/storage-reconciliation/latest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(denied.status).toBe(403);
    pass('Vendor cannot access the admin report in the browser or through the API');
    await vc.close();

    phase = 'admin fixture and real sign-in';
    const admin = await factory.create('A1');
    identities.push(admin);
    const ac = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ac.route('https://api.feastpot.co.uk/**', async (route) => {
      const original = new URL(route.request().url());
      const response = await route.fetch({
        url: `http://127.0.0.1:3001${original.pathname}${original.search}`,
      });
      await route.fulfill({ response });
    });
    const ap = await ac.newPage();
    activePage = ap;
    watch(ap);
    await login(ap, 'http://localhost:3003', admin);
    phase = 'real admin MFA';
    await ap.goto('http://localhost:3003/storage-reconciliation', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    if (new URL(ap.url()).pathname.includes('/settings/2fa')) {
      await ap.getByRole('button', { name: 'Enable 2FA', exact: true }).click();
      const element = ap.locator('code').filter({ hasText: /^[A-Z2-7]{16,}$/ });
      await element.waitFor({ state: 'visible', timeout: 30_000 });
      const secret = await element.textContent();
      if (!secret) throw Error('MFA_SECRET_MISSING');
      const verified = ap.waitForResponse(
        (r) =>
          /\/auth\/v1\/factors\/[^/]+\/verify/.test(r.url()) && r.request().method() === 'POST',
      );
      await ap.locator('#totp-code').fill(totp(secret.trim()));
      await ap.getByRole('button', { name: /Verify (?:&|and) enable/, exact: true }).click();
      const result = await verified;
      expect(result.ok()).toBe(true);
      const session = await result.json();
      expect(
        JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()).aal,
      ).toBe('aal2');
      pass('Real staff sign-in and TOTP verification issued AAL2 without bypass');
      await ap.goto('http://localhost:3003/storage-reconciliation', {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
    } else throw Error('EXPECTED_ADMIN_MFA_GATE_NOT_ENABLED');
    phase = 'admin report-only refresh';
    await expect(ap.getByRole('heading', { name: 'Storage reconciliation' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(ap.getByText('Objects', { exact: true })).toBeVisible({ timeout: 30_000 });
    const orphan = {
      bucket: 'feastpot-documents',
      path: `lifecycle-browser-report/${namespace}/seeded-orphan.pdf`,
    };
    objects.push(orphan);
    const uploaded = await storage.storage
      .from(orphan.bucket)
      .upload(orphan.path, pdf, { contentType: 'application/pdf', cacheControl: '0' });
    expect(uploaded.error).toBeNull();
    const generated = ap.waitForResponse(
      (r) => r.url().includes('/storage-reconciliation/report') && r.request().method() === 'POST',
    );
    await ap.getByRole('button', { name: 'Run report (no deletion)', exact: true }).click();
    const result = await generated;
    expect(result.status()).toBe(201);
    const report = await result.json();
    expect(report.mode).toBe('report_only');
    expect(
      report.orphaned.some((o: any) => o.name === orphan.path && o.bucket_id === orphan.bucket),
    ).toBe(true);
    await expect(ap.getByText(orphan.path, { exact: true })).toBeVisible({ timeout: 30_000 });
    const untouched = await storage.storage.from(orphan.bucket).download(orphan.path);
    expect(untouched.error).toBeNull();
    expect(untouched.data).toBeTruthy();
    await ap.reload({ waitUntil: 'domcontentloaded' });
    await expect(ap.getByText(orphan.path, { exact: true })).toBeVisible({ timeout: 30_000 });
    await ap.screenshot({ path: `${output}/admin-report-desktop.png` });
    pass(
      'Admin report authenticates, refreshes, displays seeded orphan, persists on reload and deletes nothing',
    );
    await ac.close();
  } finally {
    if (activePage && !activePage.isClosed() && phase.startsWith('vendor')) {
      await activePage
        .screenshot({ path: `${output}/vendor-last-state.png` })
        .catch(() => undefined);
    }
    await browser.close();
    for (const ref of objects) {
      const removed = await storage.storage.from(ref.bucket).remove([ref.path]);
      if (removed.error) errors.push('Fixture object cleanup failed');
    }
    for (const identity of identities.reverse()) await factory.teardown(identity);
    await factory.dispose();
    writeFileSync(
      `${output}/results.json`,
      JSON.stringify({ phase, results, errors, navigationCancellations }, null, 2),
    );
    if (errors.length) throw Error('UNEXPECTED_BROWSER_ERRORS');
  }
}
main().catch((error) => {
  console.error(`FAIL during ${phase}: ${error.name}`);
  const safe = String(error.message)
    .replace(/https?:\/\/\S+/g, '[URL]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]');
  console.error(safe.slice(0, 1800));
  process.exitCode = 1;
});
