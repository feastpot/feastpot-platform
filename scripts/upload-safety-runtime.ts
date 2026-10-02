/**
 * Explicit opt-in runtime proof against the WORKSPACE API, never production.
 * Real factory JWTs, real multipart endpoints, real Supabase Storage. No Bull
 * worker or AppModule is started and no queue state is changed.
 *
 * TS_NODE_SKIP_PROJECT=1 TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","target":"ES2022","esModuleInterop":true}' node -r ts-node/register/transpile-only scripts/upload-safety-runtime.ts
 */
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import sharp from 'sharp';
import ts from 'typescript';

import { TestDataFactory, type TestIdentity } from './test-factory';

const namespace = `upload-proof-${Date.now()}`;
const base = `https://${process.env.REPLIT_DEV_DOMAIN}/v1`;
const results: Record<string, unknown>[] = [];
const checks: Record<string, unknown> = {};
const objects: { bucket: string; path: string }[] = [];
const identities: TestIdentity[] = [];
let draftId: string | undefined;
let factory: TestDataFactory;
let otherFactory: TestDataFactory;
let otherIdentity: TestIdentity;
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
function remember(url: string) {
  const match = new URL(url).pathname.match(
    /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/,
  );
  if (match) objects.push({ bucket: match[1]!, path: decodeURIComponent(match[2]!) });
}
async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  return body.data ?? body;
}
async function status(url: string, token?: string) {
  const response = await fetch(url, {
    headers: token
      ? { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }
      : {},
  });
  await response.body?.cancel();
  return response.status;
}
function pdf() {
  const stream = 'BT /F1 12 Tf 20 200 Td (Harmless upload safety fixture) Tj ET';
  const parts = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  parts.forEach((part, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${part}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
async function main() {
  if (!process.env.REPLIT_DEV_DOMAIN || process.env.NODE_ENV === 'production')
    throw new Error('WORKSPACE_ONLY');
  const health = await json(await fetch(`${base}/health/z`));
  if (health.checks?.supabase?.environment !== 'development')
    throw new Error('DEVELOPMENT_API_REQUIRED');
  factory = TestDataFactory.fromEnvironment({ namespace });
  const vendor = await factory.create('V4');
  identities.push(vendor);
  // V4 intentionally has no menu. Seed an owned, unpublished item rather than
  // accidentally sending "undefined" UUIDs and counting route validation as
  // upload validation.
  const menu = await factory.prisma.menu.create({
    data: {
      vendorId: vendor.vendorId!,
      name: 'Upload matrix draft',
      isActive: false,
      items: {
        create: {
          vendorId: vendor.vendorId!,
          name: 'Upload matrix draft item',
          category: 'main',
          pricePence: 1000,
          imageUrls: [],
          allergens: [],
          tags: [],
          isAvailable: false,
          moderationStatus: 'held',
        },
      },
    },
    include: { items: true },
  });
  vendor.menuId = menu.id;
  vendor.menuItemId = menu.items[0]!.id;
  otherFactory = TestDataFactory.fromEnvironment({ namespace: `${namespace}-other` });
  const other = await otherFactory.create('V4');
  otherIdentity = other;
  const customer = await factory.create('C3');
  identities.push(customer);
  const vendorToken = await factory.issueAccessToken(vendor);
  if (other.userId === vendor.userId) throw new Error('CROSS_VENDOR_IDENTITY_NOT_DISTINCT');
  const otherToken = await otherFactory.issueAccessToken(other);
  const customerToken = await factory.issueAccessToken(customer);
  const order = await factory.prisma.order.findUniqueOrThrow({ where: { id: customer.orderId! } });
  await factory.prisma.order.update({
    where: { id: order.id },
    data: { vendorId: vendor.vendorId },
  });
  const review = await factory.prisma.review.create({
    data: {
      orderId: order.id,
      vendorId: vendor.vendorId!,
      customerId: customer.userId,
      rating: 5,
      isHidden: true,
    },
  });
  const dispute = await factory.prisma.dispute.create({
    data: {
      orderId: order.id,
      raisedById: customer.userId,
      issueType: 'missing_items',
      severity: 'low',
      description: 'Harmless upload safety fixture',
      vendorRespondBy: new Date(Date.now() + 86400000),
      platformRespondBy: new Date(Date.now() + 86400000),
    },
  });
  // Seed only the draft reference, not POST draft creation (which sends a
  // resume email). Existing shared notification queues must remain untouched.
  const resumeToken = randomUUID();
  const draft = await factory.prisma.vendorApplication.create({
    data: {
      fullName: 'Upload fixture',
      email: `tf-${namespace}-draft@test.feastpot.co.uk`,
      phone: '07123456789',
      postcode: 'SE15 4EE',
      kitchenName: '',
      cuisineType: '',
      kitchenType: '',
      hasFsaRegistration: false,
      foodStory: '',
      isTestData: true,
      submittedAt: null,
      currentStep: 'phase_2_menu',
      resumeTokenHash: createHash('sha256').update(resumeToken).digest('hex'),
      resumeExpiresAt: new Date(Date.now() + 86400000),
    },
  });
  draftId = draft.id;
  await factory.prisma.vendorApplication.update({
    where: { id: draftId },
    data: { isTestData: true },
  });

  const source = readFileSync('packages/ui/src/lib/prepare-upload.ts', 'utf8');
  const module = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const decoder = readFileSync(require.resolve('heic-to/csp'));
  const server = createServer((request, response) => {
    if (request.url === '/prepare.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(module);
    } else if (request.url === '/decoder.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(decoder);
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><script type="importmap">{"imports":{"heic-to/csp":"/decoder.js"}}</script><style>body{margin:16px}img{max-width:100%;height:auto}</style><main id="gallery"></main>',
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  checks.browser = browser.version();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  // A literal module script avoids ts-node rewriting dynamic import inside a
  // Playwright-serialized function into its Node-only __importStar helper.
  await page.addScriptTag({
    type: 'module',
    content: 'import {prepareUpload} from "/prepare.js"; window.prepareUpload = prepareUpload;',
  });
  await page.waitForFunction('typeof window.prepareUpload === "function"');
  const make = () =>
    sharp({ create: { width: 32, height: 24, channels: 3, background: '#128a7c' } });
  const heicResponse = await fetch(
    'https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic',
  );
  if (!heicResponse.ok) throw new Error('HEIC_FIXTURE_UNAVAILABLE');
  const fixtures = [
    {
      format: 'jpg',
      name: 'fixture.jpg',
      type: 'image/jpeg',
      bytes: await make().withMetadata({ orientation: 6 }).jpeg().toBuffer(),
      valid: true,
    },
    {
      format: 'png',
      name: 'fixture.png',
      type: 'image/png',
      bytes: await make().png().toBuffer(),
      valid: true,
    },
    {
      format: 'webp',
      name: 'fixture.webp',
      type: 'image/webp',
      bytes: await make().webp().toBuffer(),
      valid: true,
    },
    {
      format: 'HEIC',
      name: 'fixture.heic',
      type: 'image/heic',
      bytes: Buffer.from(await heicResponse.arrayBuffer()),
      valid: true,
    },
    { format: 'PDF', name: 'fixture.pdf', type: 'application/pdf', bytes: pdf(), valid: true },
    {
      format: 'SVG',
      name: 'fixture.svg',
      type: 'image/svg+xml',
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      valid: false,
    },
    {
      format: 'zero-byte',
      name: 'empty.jpg',
      type: 'image/jpeg',
      bytes: Buffer.alloc(0),
      valid: false,
    },
    {
      format: 'mismatch',
      name: 'renamed.jpg',
      type: 'image/jpeg',
      bytes: Buffer.from('This is a text file, not an image.'),
      valid: false,
    },
    {
      format: '>10MB',
      name: 'large.jpg',
      type: 'image/jpeg',
      bytes: Buffer.alloc(10 * 1024 * 1024 + 1),
      valid: false,
    },
  ];
  const paths = [
    {
      name: 'application photo',
      url: `/vendors/application-drafts/${resumeToken}/menu-photo`,
      field: 'file',
      pdf: false,
      token: undefined,
    },
    {
      name: 'logo/cover',
      url: `/vendors/${vendor.vendorId}/images?kind=logo`,
      field: 'file',
      pdf: false,
      token: vendorToken,
    },
    {
      name: 'menu import',
      url: `/vendors/${vendor.vendorId}/menu-imports`,
      field: 'files',
      pdf: true,
      token: vendorToken,
    },
    {
      name: 'menu item',
      url: `/vendors/${vendor.vendorId}/menus/${vendor.menuId}/items/${vendor.menuItemId}/images`,
      field: 'file',
      pdf: false,
      token: vendorToken,
    },
    {
      name: 'compliance',
      url: `/vendors/${vendor.vendorId}/documents`,
      field: 'file',
      pdf: true,
      token: vendorToken,
    },
    {
      name: 'review',
      url: `/reviews/${review.id}/photos`,
      field: 'photos',
      pdf: false,
      token: customerToken,
    },
    {
      name: 'dispute',
      url: `/disputes/${dispute.id}/evidence`,
      field: 'file',
      pdf: true,
      token: vendorToken,
    },
  ];
  let privateProofDone = false;
  try {
    for (const path of paths)
      for (const fixture of fixtures) {
        let bytes = fixture.bytes,
          name = fixture.name,
          type = fixture.type;
        let prepared: { b64: string; name: string; type: string } | undefined;
        if (fixture.valid && fixture.format !== 'PDF') {
          prepared = await page.evaluate(
            async ({ b64, name, type, allowPdf }) => {
              const { prepareUpload } = window as unknown as {
                prepareUpload: typeof import('../packages/ui/src/lib/prepare-upload').prepareUpload;
              };
              const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, {
                type,
              });
              const normalized = await prepareUpload(file, {
                allowPdf,
                maxBytes: allowPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024,
              });
              const raw = new Uint8Array(await normalized.arrayBuffer());
              let binary = '';
              for (const byte of raw) binary += String.fromCharCode(byte);
              return { b64: btoa(binary), name: normalized.name, type: normalized.type };
            },
            { b64: bytes.toString('base64'), name, type, allowPdf: path.pdf },
          );
          bytes = Buffer.from(prepared.b64, 'base64');
          name = prepared.name;
          type = prepared.type;
        }
        const form = new FormData();
        form.append(path.field, new Blob([bytes], { type }), name);
        if (path.name === 'compliance') form.append('type', 'insurance');
        if (path.name === 'dispute')
          form.append('type', fixture.format === 'PDF' ? 'document' : 'photo');
        const response = await fetch(`${base}${path.url}`, {
          method: 'POST',
          headers: path.token ? { Authorization: `Bearer ${path.token}` } : {},
          body: form,
        });
        const data = await json(response);
        const expected = fixture.valid && (fixture.format !== 'PDF' || path.pdf);
        const url =
          data.publicUrl ??
          data.fileUrl ??
          data.imageUrls?.at(-1) ??
          data.photoUrls?.at(-1) ??
          data.menuSampleImageUrl;
        if (path.name === 'menu import' && response.ok) {
          const row = await factory.prisma.menuImport.findUniqueOrThrow({ where: { id: data.id } });
          const stored = (row.sourceFiles as { path?: string }[])[0]?.path;
          if (stored) objects.push({ bucket: 'feastpot-documents', path: stored });
        }
        if (url && response.ok) remember(url);
        const result: Record<string, unknown> = {
          path: path.name,
          format: fixture.format,
          http: response.status,
          expected: expected ? 'accept' : 'reject',
          pass: expected ? response.ok : response.status >= 400 && response.status < 500,
          code: data.code ?? null,
        };
        if (response.ok && fixture.format !== 'PDF') {
          const meta = await sharp(bytes).metadata();
          result.uprightPixels = [meta.width, meta.height];
          result.exifOrientation = meta.orientation ?? null;
          if (fixture.format === 'jpg')
            result.orientationPass = meta.width === 24 && meta.height === 32 && !meta.orientation;
          for (const width of [1280, 375]) {
            await page.setViewportSize({ width, height: 900 });
            const dimensions = await page.evaluate(
              async ({ b64, type }) => {
                const src = `data:${type};base64,${b64}`;
                const image = document.createElement('img');
                image.src = src;
                document.querySelector('#gallery')!.replaceChildren(image);
                await image.decode();
                const box = image.getBoundingClientRect();
                return {
                  natural: [image.naturalWidth, image.naturalHeight],
                  rendered: [box.width, box.height],
                  correctRatio:
                    Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight) <
                    0.01,
                };
              },
              { b64: bytes.toString('base64'), type },
            );
            result[`viewport${width}`] = dimensions;
          }
        }
        if (path.name === 'compliance' && response.ok && !privateProofDone) {
          checks.privateUrlPattern =
            '/storage/v1/object/public/feastpot-documents/vendors/{vendorId}/{type}/{filename}';
          checks.privateSignedOut = await status(url);
          checks.privateCrossVendorPublic = await status(url, otherToken);
          checks.privateCrossVendorAuthenticated = await status(
            url.replace('/object/public/', '/object/authenticated/'),
            otherToken,
          );
          const download = `${base}/vendors/${vendor.vendorId}/documents/${data.id}/download`;
          checks.documentApiSignedOut = await status(download);
          checks.documentApiCrossVendor = await status(download, otherToken);
          checks.documentApiOwner = await status(download, vendorToken);
          privateProofDone = true;
        }
        if (path.name === 'logo/cover' && response.ok)
          checks.publicLogoSignedOut = await status(url);
        if (path.name === 'menu item' && response.ok)
          checks.publicMenuSignedOut = await status(url);
        if (path.name === 'review' && response.ok)
          await factory.prisma.review.update({ where: { id: review.id }, data: { photoUrls: [] } });
        result.pass =
          result.pass &&
          result.orientationPass !== false &&
          [1280, 375].every(
            (width) =>
              !result[`viewport${width}`] ||
              (result[`viewport${width}`] as { correctRatio: boolean }).correctRatio,
          );
        results.push(result);
        console.log(
          `UPLOAD_MATRIX ${path.name} ${fixture.format}: HTTP ${response.status} ${result.pass ? 'PASS' : 'FAIL'}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main()
  .catch((error) => {
    checks.blocker = (
      String(error.message).match(/(?:Argument|Unknown argument)[^\n]+/)?.[0] ??
      String(error.message).split('\n')[0]!
    )
      .replace(/(?:https?:\/\/|Bearer )\S+/g, '[redacted]')
      .slice(0, 300);
    console.error('UPLOAD_MATRIX_BLOCKER', checks.blocker);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const object of objects)
      await admin.storage
        .from(object.bucket)
        .remove([object.path])
        .catch(() => undefined);
    if (draftId && factory)
      await factory.prisma.vendorApplication.deleteMany({
        where: { id: draftId, isTestData: true },
      });
    for (const identity of identities)
      await factory?.teardown(identity).catch(() => {
        checks.cleanupWarning = true;
      });
    if (otherIdentity)
      await otherFactory.teardown(otherIdentity).catch(() => {
        checks.cleanupWarning = true;
      });
    await otherFactory?.dispose();
    await factory?.dispose();
    mkdirSync('.local', { recursive: true });
    writeFileSync(
      '.local/upload-runtime-results.json',
      JSON.stringify(
        { at: new Date().toISOString(), environment: 'development', results, checks },
        null,
        2,
      ),
    );
    if (results.length !== 63 || results.some((result) => !result.pass)) process.exitCode = 1;
    console.log(
      'UPLOAD_MATRIX_SUMMARY',
      JSON.stringify({
        executed: results.length,
        passed: results.filter((r) => r.pass).length,
        checks,
      }),
    );
  });
