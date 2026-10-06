import { readFileSync, writeFileSync } from 'node:fs';

import { productionUploadFixtures, proofDirectory } from './production-upload-fixtures';

type ObjectRef = { bucket: string; path: string };
async function main() {
  if (!process.argv.includes('--approved-own-upload-cleanup'))
    throw new Error('EXPLICIT_OWN_UPLOAD_DELETION_APPROVAL_REQUIRED');
  const f = await productionUploadFixtures('https://api.feastpot.co.uk');
  const { manifest: m, prisma, auth } = f;
  const proof: Record<string, unknown> = { at: new Date().toISOString(), objects: [] };
  try {
    const input: ObjectRef[] = JSON.parse(
      readFileSync(`${proofDirectory}/stored-object-manifest.json`, 'utf8'),
    );
    const objects = [...new Map(input.map((o) => [`${o.bucket}/${o.path}`, o])).values()];
    for (const o of objects) {
      if (
        !['feastpot-media', 'feastpot-documents'].includes(o.bucket) ||
        !(
          o.path.startsWith(`vendors/${m.vendorId}/`) ||
          o.path.startsWith(`vendor-applications/${m.draftId}/`) ||
          o.path.startsWith(`disputes/${m.disputeId}/`)
        ) ||
        !/fixture\.(jpg|png|webp|pdf)$/.test(o.path)
      )
        throw new Error('UNAPPROVED_OBJECT');
    }
    async function listed(o: ObjectRef) {
      const slash = o.path.lastIndexOf('/');
      const { data, error } = await auth.storage
        .from(o.bucket)
        .list(o.path.slice(0, slash), { limit: 1000 });
      if (error || !data) throw new Error('LISTING_FAILED');
      return {
        names: data.map((item) => item.name),
        exists: data.some((item) => item.name === o.path.slice(slash + 1)),
      };
    }
    const imports = await prisma.menuImport.findMany({
      where: { vendorId: m.vendorId },
      select: { id: true, status: true, sourceFiles: true },
    });
    proof.importStates = imports.map((item) => ({ id: item.id, status: item.status }));
    const inUse = new Set<string>();
    for (const entry of imports) {
      if (
        !['completed', 'failed', 'ready', 'review_required', 'needs_review', 'applied'].includes(
          entry.status,
        )
      ) {
        for (const file of entry.sourceFiles as { path: string }[]) inUse.add(file.path);
      }
    }
    const draftResponse = await fetch(
      `https://api.feastpot.co.uk/v1/vendors/application-drafts/${f.resumeToken}`,
    );
    const draftBody = await draftResponse.json();
    const preview = (draftBody.data ?? draftBody).menuPhotoUrl;
    if (preview) {
      const token = new URL(preview).searchParams.get('token');
      if (token) {
        const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
        proof.applicationSignedLifetimeSeconds = claims.exp - claims.iat;
      }
    }
    const acceptance = await prisma.termsAcceptance.findFirstOrThrow({
      where: { vendorId: m.vendorId },
      orderBy: { acceptedAt: 'desc' },
      include: { termsVersion: true },
    });
    proof.termsHashMatchesCanonical =
      acceptance.contentHash === acceptance.termsVersion.contentHash;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: m.orderId } });
    const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: m.vendorId } });
    if (order.status !== 'cancelled' || order.totalPence !== 0 || vendor.status === 'live')
      throw new Error('FIXTURE_FINANCIAL_OR_PUBLICATION_STATE_CHANGED');
    proof.zeroCancelledOrder = true;
    proof.paymentRows = await prisma.payment.count({ where: { orderId: order.id } });
    proof.stripeAccountCreated = !!vendor.stripeAccountId;
    proof.vendorRemainsUnpublished = true;

    // This pre-existing delete endpoint removes precisely this document's
    // object. Do not invoke the unsafe production replacement/global drainer.
    const doc = await prisma.vendorDocument.findFirst({
      where: { vendorId: m.vendorId, fileName: 'fixture.jpg' },
      orderBy: { createdAt: 'desc' },
    });
    if (doc) {
      const match = new URL(doc.fileUrl).pathname.match(/\/public\/([^/]+)\/(.+)/);
      const object = match ? { bucket: match[1]!, path: decodeURIComponent(match[2]!) } : undefined;
      if (object && objects.some((o) => o.bucket === object.bucket && o.path === object.path)) {
        const before = await listed(object);
        const response = await fetch(
          `https://api.feastpot.co.uk/v1/vendors/${m.vendorId}/documents/${doc.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${f.tokens.primary}` } },
        );
        await response.body?.cancel();
        proof.productComplianceDelete = {
          http: response.status,
          before,
          after: await listed(object),
        };
      }
    }
    // Detach only generated public images from the approved hidden fixtures.
    await prisma.vendor.update({ where: { id: m.vendorId }, data: { logoUrl: null } });
    await prisma.menuItem.update({ where: { id: m.menuItemId }, data: { imageUrls: [] } });
    await prisma.vendorApplication.update({
      where: { id: m.draftId },
      data: { menuPhotoPath: null, menuPhotoUrl: null },
    });
    for (const o of objects) {
      if (inUse.has(o.path)) {
        (proof.objects as unknown[]).push({
          ...o,
          deferred: 'Owned OCR import has not finished; no queue changes permitted.',
        });
        continue;
      }
      const before = await listed(o);
      const { error } = await auth.storage.from(o.bucket).remove([o.path]);
      if (error) throw new Error('OWN_OBJECT_REMOVE_FAILED');
      const after = await listed(o);
      (proof.objects as unknown[]).push({ ...o, before, after, physicallyAbsent: !after.exists });
      writeFileSync(`${proofDirectory}/upload-cleanup.json`, JSON.stringify(proof, null, 2));
    }
    proof.limitation =
      'Direct, explicitly approved fixture cleanup is not proof of seven product delete/replace interfaces. Accounts, orders, queues and real data were not deleted or replayed.';
    writeFileSync(`${proofDirectory}/upload-cleanup.json`, JSON.stringify(proof, null, 2));
    console.log(
      JSON.stringify(
        {
          objects: objects.length,
          physicallyAbsent: (proof.objects as { physicallyAbsent?: boolean }[]).filter(
            (o) => o.physicallyAbsent,
          ).length,
          deferred: inUse.size,
          productComplianceDelete: proof.productComplianceDelete,
          applicationSignedLifetimeSeconds: proof.applicationSignedLifetimeSeconds,
          termsHashMatchesCanonical: proof.termsHashMatchesCanonical,
          paymentRows: proof.paymentRows,
          stripeAccountCreated: proof.stripeAccountCreated,
          imports: proof.importStates,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.log(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'BOUNDED_CLEANUP_FAILED',
  );
  process.exitCode = 1;
});
