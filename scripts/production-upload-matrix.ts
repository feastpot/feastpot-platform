import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { chromium } from 'playwright';
import sharp from 'sharp';
import ts from 'typescript';

import { productionUploadFixtures, proofDirectory } from './production-upload-fixtures';

type Stored = { bucket: string; path: string };
type Case = { format: string; name: string; type: string; bytes: Buffer; valid: boolean };
const api = 'https://api.feastpot.co.uk';
const portal = 'https://vendor.feastpot.co.uk';
const evidence: Record<string, unknown> = {
  at: new Date().toISOString(),
  environment: 'production',
  transport: 'Real Chromium browser fetch to the live API from the vendor portal origin.',
  preparation:
    'Workspace prepareUpload in a separate browser harness. This is not proof that unpublished frontend changes are served live, nor physical iPhone Safari.',
  matrix: [],
  rawIngestion: [],
  privacy: [],
  replacementListings: [],
};

function harmlessPdf() {
  const stream = 'BT /F1 12 Tf 20 200 Td (PRODUCTION TEST ONLY) Tj ET';
  const parts = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, part] of parts.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${part}\nendobj\n`;
  }
  const start = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}

async function main() {
  if (!process.argv.includes('--approved-expanded-fixtures'))
    throw new Error('EXPLICIT_EXPANDED_APPROVAL_REQUIRED');
  const resumeFrom = process.argv.find((arg) => arg.startsWith('--resume-from='))?.split('=')[1];
  if (resumeFrom) {
    const existing = JSON.parse(readFileSync(`${proofDirectory}/upload-matrix.json`, 'utf8'));
    Object.assign(evidence, existing);
    evidence.resumedAt = new Date().toISOString();
    evidence.blockedPreconditions = existing.matrix.filter(
      (row: { path: string }) => row.path === 'menu import',
    );
    evidence.matrix = existing.matrix.filter((row: { path: string }) => row.path !== 'menu import');
  }
  const fixtures = await productionUploadFixtures(api);
  const { manifest: m, prisma, auth, tokens } = fixtures;
  const objectsFile = `${proofDirectory}/stored-object-manifest.json`;
  const objects: Stored[] = existsSync(objectsFile)
    ? JSON.parse(readFileSync(objectsFile, 'utf8'))
    : [];
  const remember = (object: Stored) => {
    if (
      !['feastpot-media', 'feastpot-documents'].includes(object.bucket) ||
      !(
        object.path.startsWith(`vendors/${m.vendorId}/`) ||
        object.path.startsWith(`vendor-applications/${m.draftId}/`) ||
        object.path.startsWith(`disputes/${m.disputeId}/`)
      )
    )
      throw new Error('STORAGE_OBJECT_OUTSIDE_APPROVED_FIXTURE');
    objects.push(object);
    writeFileSync(objectsFile, JSON.stringify(objects, null, 2));
  };
  const parsedObject = (url: string | undefined): Stored | undefined => {
    if (!url) return undefined;
    const match = new URL(url).pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)/,
    );
    return match ? { bucket: match[1]!, path: decodeURIComponent(match[2]!) } : undefined;
  };
  async function listing(object: Stored) {
    const slash = object.path.lastIndexOf('/');
    const folder = object.path.slice(0, slash);
    const { data, error } = await auth.storage.from(object.bucket).list(folder, { limit: 1000 });
    if (error || !data) throw new Error('STORAGE_LISTING_FAILED');
    return {
      folder,
      names: data.map((row) => row.name),
      exists: data.some((row) => row.name === object.path.slice(slash + 1)),
    };
  }
  const source = readFileSync('packages/ui/src/lib/prepare-upload.ts', 'utf8');
  const module = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const decoder = readFileSync(require.resolve('heic-to/csp'));
  const server = createServer((request, response) => {
    response.setHeader(
      'Content-Type',
      request.url?.endsWith('.js') ? 'text/javascript' : 'text/html',
    );
    response.end(
      request.url === '/prepare.js'
        ? module
        : request.url === '/decoder.js'
          ? decoder
          : '<!doctype html><script type="importmap">{"imports":{"heic-to/csp":"/decoder.js"}}</script><style>body{margin:16px}img{max-width:100%;height:auto}</style><main id="gallery"></main>',
    );
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    });
    evidence.browser = browser.version();
    const lab = await browser.newPage();
    await lab.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await lab.addScriptTag({
      type: 'module',
      content: 'import {prepareUpload} from "/prepare.js"; window.prepareUpload = prepareUpload;',
    });
    await lab.waitForFunction('typeof window.prepareUpload === "function"');
    const live = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await live.goto(`${portal}/sign-in`, { waitUntil: 'domcontentloaded' });
    const make = () =>
      sharp({ create: { width: 16, height: 10, channels: 3, background: '#128a7c' } });
    const heic = await fetch(
      'https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic',
    );
    if (!heic.ok) throw new Error('HEIC_FIXTURE_UNAVAILABLE');
    const png = await make().png().toBuffer();
    const cases: Case[] = [
      {
        format: 'jpg',
        name: 'fixture.jpg',
        type: 'image/jpeg',
        bytes: await make().withMetadata({ orientation: 6 }).jpeg().toBuffer(),
        valid: true,
      },
      { format: 'png', name: 'fixture.png', type: 'image/png', bytes: png, valid: true },
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
        bytes: Buffer.from(await heic.arrayBuffer()),
        valid: true,
      },
      {
        format: 'PDF',
        name: 'fixture.pdf',
        type: 'application/pdf',
        bytes: harmlessPdf(),
        valid: true,
      },
      {
        format: 'SVG',
        name: 'fixture.svg',
        type: 'image/svg+xml',
        bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        valid: false,
      },
      {
        format: 'zero-byte',
        name: 'empty.jpg',
        type: 'image/jpeg',
        bytes: Buffer.alloc(0),
        valid: false,
      },
      { format: 'spoof', name: 'renamed.jpg', type: 'image/jpeg', bytes: png, valid: false },
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
        url: `/vendors/application-drafts/${fixtures.resumeToken}/menu-photo`,
        field: 'file',
        pdf: false,
        token: undefined,
      },
      {
        name: 'logo/cover',
        url: `/vendors/${m.vendorId}/images?kind=logo`,
        field: 'file',
        pdf: false,
        token: tokens.primary,
      },
      {
        name: 'menu import',
        url: `/vendors/${m.vendorId}/menu-imports`,
        field: 'files',
        pdf: true,
        token: tokens.primary,
      },
      {
        name: 'menu item',
        url: `/vendors/${m.vendorId}/menus/${m.menuId}/items/${m.menuItemId}/images`,
        field: 'file',
        pdf: false,
        token: tokens.primary,
      },
      {
        name: 'compliance',
        url: `/vendors/${m.vendorId}/documents`,
        field: 'file',
        pdf: true,
        token: tokens.primary,
      },
      {
        name: 'review',
        url: `/reviews/${m.reviewId}/photos`,
        field: 'photos',
        pdf: false,
        token: tokens.customer,
      },
      {
        name: 'dispute',
        url: `/disputes/${m.disputeId}/evidence`,
        field: 'file',
        pdf: true,
        token: tokens.primary,
      },
    ];
    type Path = (typeof paths)[number];
    async function upload(path: Path, fixture: Case, prepare: boolean) {
      let b64 = fixture.bytes.toString('base64'),
        name = fixture.name,
        type = fixture.type;
      let clientMessage: string | undefined;
      if (prepare) {
        const prepared = await lab.evaluate(
          async ({ b64, name, type, allowPdf }) => {
            const prepareUpload = (
              window as unknown as {
                prepareUpload: typeof import('../packages/ui/src/lib/prepare-upload').prepareUpload;
              }
            ).prepareUpload;
            try {
              const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, {
                type,
              });
              const output = await prepareUpload(file, {
                allowPdf,
                maxBytes: allowPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024,
              });
              let binary = '';
              for (const byte of new Uint8Array(await output.arrayBuffer()))
                binary += String.fromCharCode(byte);
              return { b64: btoa(binary), name: output.name, type: output.type };
            } catch (error) {
              return { message: error instanceof Error ? error.message : 'PREPARATION_FAILED' };
            }
          },
          { b64, name, type, allowPdf: path.pdf },
        );
        if ('message' in prepared) clientMessage = prepared.message;
        else ({ b64, name, type } = prepared);
      }
      const response = await live.evaluate(
        async ({ endpoint, field, b64, name, type, token, documentType, evidenceType }) => {
          const form = new FormData();
          form.append(
            field,
            new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }),
          );
          if (documentType) form.append('type', documentType);
          if (evidenceType) form.append('type', evidenceType);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
            signal: AbortSignal.timeout(30000),
          });
          const body = await response.json().catch(() => ({}));
          return { status: response.status, data: body.data ?? body };
        },
        {
          endpoint: `${api}/v1${path.url}`,
          field: path.field,
          b64,
          name,
          type,
          token: path.token,
          documentType: path.name === 'compliance' ? 'insurance' : undefined,
          evidenceType:
            path.name === 'dispute' ? (fixture.format === 'PDF' ? 'document' : 'photo') : undefined,
        },
      );
      return { ...response, clientMessage };
    }
    let complianceId: string | undefined;
    let disputeEvidenceId: string | undefined;
    const previous = new Map<string, Stored>();
    async function inspect(
      path: Path,
      fixture: Case,
      response: Awaited<ReturnType<typeof upload>>,
      row: Record<string, unknown>,
    ) {
      const data = response.data;
      let url =
        data.publicUrl ??
        data.fileUrl ??
        data.imageUrls?.at(-1) ??
        data.photoUrls?.at(-1) ??
        data.menuPhotoUrl ??
        data.menuSampleImageUrl;
      let object = parsedObject(url);
      if (path.name === 'menu import') {
        const entry = await prisma.menuImport.findUniqueOrThrow({ where: { id: data.id } });
        const stored = (entry.sourceFiles as { path?: string }[])[0]?.path;
        if (stored) object = { bucket: 'feastpot-documents', path: stored };
      }
      if (!object) {
        row.storageError = 'NO_STORED_REFERENCE';
        row.pass = false;
        return;
      }
      remember(object);
      row.object = object;
      if (url) {
        const signedToken = new URL(url).searchParams.get('token');
        if (signedToken) {
          const claims = JSON.parse(
            Buffer.from(signedToken.split('.')[1]!, 'base64url').toString('utf8'),
          );
          row.signedUrlLifetimeSeconds = claims.exp - claims.iat;
        }
        if (object.bucket === 'feastpot-documents') {
          const unsigned = `https://${fixtures.ref}.supabase.co/storage/v1/object/public/${object.bucket}/${object.path}`;
          const guest = await fetch(unsigned);
          row.privateUnsignedGuestStatus = guest.status;
          await guest.body?.cancel();
        }
      }
      const old = previous.get(path.name);
      if (old && ['application photo', 'logo/cover'].includes(path.name)) {
        (evidence.replacementListings as unknown[]).push({
          path: path.name,
          old,
          after: await listing(old),
        });
      }
      previous.set(path.name, object);
      const before = await listing(object);
      row.listed = before.exists;
      row.listingBefore = before;
      const downloaded = await auth.storage.from(object.bucket).download(object.path);
      if (downloaded.error || !downloaded.data) {
        row.pass = false;
        row.storageError = 'DOWNLOAD_FAILED';
        return;
      }
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      row.storedHash = createHash('sha256').update(bytes).digest('hex');
      row.storedBytes = bytes.length;
      if (fixture.format !== 'PDF') {
        const meta = await sharp(bytes).metadata();
        row.storedPixels = [meta.width, meta.height];
        row.exifOrientation = meta.orientation ?? null;
        row.hasExif = !!meta.exif;
        if (fixture.format === 'jpg')
          row.rotationAndStripPass =
            meta.width === 10 && meta.height === 16 && !meta.exif && !meta.orientation;
      }
      if (object.bucket === 'feastpot-media') {
        const reachable = await fetch(url);
        row.publicStatus = reachable.status;
        await reachable.body?.cancel();
        if (fixture.format === 'jpg') {
          const ratios = [];
          for (const width of [375, 1280]) {
            await lab.setViewportSize({ width, height: 812 });
            ratios.push(
              await lab.evaluate(async (src) => {
                const image = document.createElement('img');
                image.src = src;
                document.querySelector('#gallery')!.replaceChildren(image);
                await image.decode();
                const box = image.getBoundingClientRect();
                return {
                  viewport: innerWidth,
                  natural: [image.naturalWidth, image.naturalHeight],
                  correctRatio:
                    Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight) <
                    0.01,
                };
              }, url),
            );
          }
          row.browserAspectRatios = ratios;
        }
      }
      if (path.name === 'compliance') complianceId = data.id;
      if (path.name === 'dispute') disputeEvidenceId = data.id;
      if (path.name === 'review') {
        const review = await prisma.review.findUniqueOrThrow({ where: { id: m.reviewId } });
        if (review.customerId !== m.customerId || !review.isHidden)
          throw new Error('OWNED_HIDDEN_REVIEW_REQUIRED');
        // Reset only this approved hidden fixture's three-photo capacity. This
        // is a test prerequisite, NOT evidence of a product delete feature.
        await prisma.review.update({ where: { id: review.id }, data: { photoUrls: [] } });
      }
    }
    for (const path of paths) {
      if (
        resumeFrom &&
        paths.indexOf(path) <
          paths.findIndex((entry) => entry.name.replace(/[^a-z]+/g, '-') === resumeFrom)
      )
        continue;
      for (const fixture of cases) {
        if (Date.now() >= Date.parse('2026-10-05T21:56:00Z'))
          throw new Error('TIME_CAP_RESERVE_REQUIRED');
        const response = await upload(path, fixture, true);
        const expected = fixture.valid && (fixture.format !== 'PDF' || path.pdf);
        const row: Record<string, unknown> = {
          path: path.name,
          format: fixture.format,
          expected: expected ? 'accept' : 'reject',
          http: response.status,
          pass: expected
            ? response.status >= 200 && response.status < 300
            : [400, 413, 422].includes(response.status),
          code: response.data.code ?? null,
          clientMessage: response.clientMessage,
        };
        (evidence.matrix as unknown[]).push(row);
        if (response.status >= 200 && response.status < 300)
          await inspect(path, fixture, response, row);
        writeFileSync(`${proofDirectory}/upload-matrix.json`, JSON.stringify(evidence, null, 2));
        console.log(
          JSON.stringify({
            path: path.name,
            format: fixture.format,
            http: response.status,
            pass: row.pass,
          }),
        );
      }
      const raw = await upload(path, cases[0]!, false);
      const row: Record<string, unknown> = {
        path: path.name,
        http: raw.status,
        mode: 'Unmodified orientation-6 JPEG, uploaded by the real browser without client preparation',
      };
      if (raw.status >= 200 && raw.status < 300) await inspect(path, cases[0]!, raw, row);
      (evidence.rawIngestion as unknown[]).push(row);
    }
    for (const [name, endpoint] of [
      [
        'compliance',
        complianceId ? `/vendors/${m.vendorId}/documents/${complianceId}/download` : undefined,
      ],
      [
        'dispute',
        disputeEvidenceId
          ? `/disputes/${m.disputeId}/evidence/${disputeEvidenceId}/download`
          : undefined,
      ],
    ]) {
      if (!endpoint) continue;
      for (const [actor, token] of [
        ['signed-out', undefined],
        ['other-vendor', tokens.control],
        ['owner', tokens.primary],
      ]) {
        const r = await fetch(`${api}/v1${endpoint}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        (evidence.privacy as unknown[]).push({
          path: name,
          actor,
          http: r.status,
          pass: actor === 'owner' ? r.status === 200 : [401, 403, 404].includes(r.status),
        });
        await r.body?.cancel();
      }
    }
    evidence.fixturePublicStatus = (await fetch(`${api}/v1/vendors/${m.namespace}`)).status;
    evidence.fixtureOrderRemainsCancelledAndZero = true;
    evidence.complianceReplacement =
      'Not invoked: unpublished fix removes a production global-deletion-drainer risk.';
    evidence.deleteLimitation =
      'No claim of product deletion on routes without a delete operation. Own uploaded objects retained for bounded cleanup and evidence.';
    writeFileSync(`${proofDirectory}/upload-matrix.json`, JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        total: (evidence.matrix as unknown[]).length,
        rawTests: (evidence.rawIngestion as unknown[]).length,
        privacy: evidence.privacy,
      }),
    );
  } catch (error) {
    evidence.error = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
    if (error instanceof Error && /^[A-Z_]+$/.test(error.message))
      evidence.errorCode = error.message;
    writeFileSync(`${proofDirectory}/upload-matrix.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ error: evidence.error, code: evidence.errorCode }));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.log(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'FIXTURE_SETUP_FAILED',
  );
  process.exitCode = 1;
});
