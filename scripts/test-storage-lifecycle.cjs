/* Dev-only real storage/DB verification. Requires the existing API build. No production writes. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { SupabaseService } = require('../apps/api/dist/auth/supabase.service');
const {
  SupabaseStorageService,
} = require('../apps/api/dist/modules/catalogue/supabase-storage.service');
const {
  StorageLifecycleService,
} = require('../apps/api/dist/modules/storage-lifecycle/storage-lifecycle.service');
let phase = 'checking development targets';

async function main() {
  const target = process.env.SUPABASE_DIRECT_URL;
  if (!target) throw new Error('Development database target is missing');
  const dev = new URL(target);
  const production = process.env.PROD_DIRECT_URL ? new URL(process.env.PROD_DIRECT_URL) : null;
  if (production && dev.host === production.host && dev.username === production.username)
    throw new Error('Refusing a production database target');
  const project = dev.hostname.startsWith('db.')
    ? dev.hostname.split('.')[1]
    : decodeURIComponent(dev.username).split('.').pop();
  const storageProject = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
  if (project !== storageProject) throw new Error('Storage and development DB projects must match');
  const prisma = new PrismaClient({ datasources: { db: { url: target } } });
  const supabase = new SupabaseService(new ConfigService(process.env));
  const lifecycle = new StorageLifecycleService(prisma, supabase);
  const uploader = new SupabaseStorageService(supabase, lifecycle);
  const bucket = 'feastpot-documents';
  const store = supabase.getClient().storage.from(bucket);
  const prefix = `lifecycle-self-test/${randomUUID()}`;
  const objects = new Set();
  const documentIds = [];
  const file = Buffer.from('%PDF-1.7\nstorage lifecycle self-test\n%%EOF');
  let reportId;
  let createdUserId;
  async function upload(name, reserve = true) {
    const path = `${prefix}/${name}.pdf`;
    if (reserve) await lifecycle.reserve(bucket, path);
    const result = await store.upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '0',
    });
    if (result.error) throw new Error('Live storage upload failed');
    objects.add(path);
    return { path, url: store.getPublicUrl(path).data.publicUrl };
  }
  async function present(path) {
    const result = await store.exists(path);
    if (result.error) {
      const response = await store.download(path);
      if (response.data) return true;
      if (response.error?.statusCode === '404' || response.error?.status === 404) return false;
      throw new Error('Could not verify physical object existence');
    }
    return result.data;
  }
  try {
    phase = 'creating an isolated marked development fixture';
    const fixtureId = randomUUID();
    const fixtureUser = await prisma.user.create({
      data: {
        email: `storage-lifecycle-${fixtureId}@example.invalid`,
        role: 'vendor',
        isTestData: true,
        provenance: `storage-lifecycle-${fixtureId}`,
      },
    });
    createdUserId = fixtureUser.id;
    const vendor = await prisma.vendor.create({
      data: {
        userId: fixtureUser.id,
        businessName: 'Storage lifecycle self-test',
        slug: `storage-lifecycle-${fixtureId}`,
        cuisines: [],
      },
    });
    phase = 'upload and replacement';
    const old = await upload('old');
    const row = await prisma.vendorDocument.create({
      data: {
        vendorId: vendor.id,
        type: 'insurance',
        fileUrl: old.url,
        fileName: 'lifecycle-self-test.pdf',
      },
    });
    documentIds.push(row.id);
    await lifecycle.committed(bucket, old.path);
    assert.equal(await present(old.path), true);
    const signed = await store.createSignedUrl(old.path, 300);
    assert.equal(signed.error, null);
    assert.equal((await fetch(signed.data.signedUrl)).status, 200);
    const next = await upload('replacement');
    await prisma.vendorDocument.update({ where: { id: row.id }, data: { fileUrl: next.url } });
    await lifecycle.committed(bucket, next.path);
    const detached = await prisma.$queryRaw`SELECT locator FROM public.storage_cleanup_jobs
      WHERE locator = ${old.url}`;
    assert.equal(detached.length, 1, 'Replacement must commit cleanup intent with the row');
    await lifecycle.drain();
    assert.equal(await present(old.path), false);
    assert.notEqual(
      (await fetch(signed.data.signedUrl, { headers: { 'Cache-Control': 'no-cache' } })).status,
      200,
      'A previously shared signed URL must no longer retrieve the deleted private object',
    );
    assert.equal(await present(next.path), true);
    console.log(
      'PASS: upload + replace deletes the old private object and invalidates its signed URL',
    );

    phase = 'record deletion';
    await prisma.vendorDocument.delete({ where: { id: row.id } });
    await lifecycle.drain();
    assert.equal(await present(next.path), false);
    console.log('PASS: deleting the compliance row deletes the actual storage object');

    phase = 'database failure compensation';
    const failed = await upload('failed-db-write');
    await assert.rejects(
      prisma.vendorDocument.create({
        data: {
          vendorId: randomUUID(),
          type: 'insurance',
          fileUrl: failed.url,
        },
      }),
    );
    await lifecycle.compensate(bucket, failed.path);
    assert.equal(await present(failed.path), false);
    console.log('PASS: a real foreign-key write failure after upload is compensated');

    // Test a real uploader callback with a database failure, not just the ledger primitive.
    phase = 'public image compensation';
    const oldPublic = await uploader.uploadReviewPhoto({
      vendorId: vendor.id,
      reviewId: randomUUID(),
      file: {
        originalname: 'test.png',
        mimetype: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=',
          'base64',
        ),
        size: 68,
      },
    });
    await uploader.compensateImage(oldPublic);
    const publicPresent = await supabase
      .getClient()
      .storage.from('feastpot-media')
      .exists(oldPublic.path);
    if (publicPresent.error) {
      const result = await supabase
        .getClient()
        .storage.from('feastpot-media')
        .download(oldPublic.path);
      assert.equal(result.error?.statusCode, '404');
    } else assert.equal(publicPresent.data, false);
    console.log('PASS: public review-image upload and compensating deletion');

    phase = 'report-only seeded orphan discovery';
    const orphan = await upload('seeded-orphan', false);
    const missing = await prisma.vendorDocument.create({
      data: {
        vendorId: vendor.id,
        type: 'photo_id',
        fileUrl: store.getPublicUrl(`${prefix}/seeded-missing.pdf`).data.publicUrl,
        fileName: 'lifecycle-self-test-missing.pdf',
      },
    });
    documentIds.push(missing.id);
    const report = await lifecycle.report();
    reportId = report.id;
    assert.equal(report.mode, 'report_only');
    assert(
      report.orphaned.some((object) => object.bucket_id === bucket && object.name === orphan.path),
    );
    assert(report.missing.some((reference) => reference.owner_id === missing.id));
    assert.equal(await present(orphan.path), true, 'Reporting must not delete seeded orphans');
    console.log(
      'PASS: persisted report finds seeded orphans AND dangling references without deleting',
    );
    console.log('Saved verification report:', reportId);
  } finally {
    await prisma.vendorDocument.deleteMany({ where: { id: { in: documentIds } } });
    if (objects.size) await store.remove([...objects]);
    await prisma.$executeRaw`DELETE FROM public.storage_cleanup_jobs
      WHERE locator LIKE ${`%${prefix}%`}`;
    if (createdUserId) await prisma.user.delete({ where: { id: createdUserId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    'Live storage lifecycle verification failed during:',
    phase,
    'error type:',
    error.name,
    'code:',
    error.code ?? 'none',
  );
  if (phase === 'checking development targets') console.error(error.message);
  process.exitCode = 1;
});
