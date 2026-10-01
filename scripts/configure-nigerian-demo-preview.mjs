// An explicitly authorised, read-only public demo, never a live trading vendor.
// Preview by default. Writes require --apply --confirm-production.
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
if (apply && !process.argv.includes('--confirm-production')) {
  throw new Error('Production writes require --apply --confirm-production.');
}
if (!process.env.PROD_DIRECT_URL) throw new Error('PROD_DIRECT_URL is required.');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.PROD_DIRECT_URL } },
  log: [],
});
let stage = 'checking the demo';
try {
  const vendor = await prisma.vendor.findUnique({
    where: { slug: 'demo-lagos-table' },
    include: { user: true, deliveryConfig: true },
  });
  if (
    !vendor ||
    vendor.isSeedData ||
    !vendor.user.isTestData ||
    vendor.user.provenance !== 'nigerian-demo-vendor' ||
    vendor.status !== 'pending' ||
    vendor.stripeAccountId ||
    vendor.payoutsEnabled ||
    vendor.stripeChargesEnabled ||
    vendor.stripePayoutsEnabled ||
    !vendor.deliveryConfig
  ) {
    throw new Error('Not the expected non-trading demo; refusing to change it.');
  }
  if (!apply) {
    console.log(JSON.stringify({ preview: true, slug: vendor.slug, coverage: ['ME3'] }));
  } else {
    stage = 'configuring view-only ME3 coverage';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nigerian-demo-vendor'))`;
      const changed = await tx.vendor.updateMany({
        where: {
          id: vendor.id,
          status: 'pending',
          isSeedData: false,
          stripeAccountId: null,
          payoutsEnabled: false,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          user: { isTestData: true, provenance: 'nigerian-demo-vendor' },
        },
        data: {
          publicDemo: true,
          description:
            'DEMO ONLY: a fictional Nigerian kitchen showing jollof rice, egusi and plantain for customers browsing ME3. View-only; no orders or catering. Photos are AI-generated illustrations.',
          vendorStory:
            'This fictional Lagos-inspired kitchen demonstrates Nigerian catering menus for customers browsing ME3. Names, recipes, prices, schedules and address details are illustrative sample data, not a real business or delivery service. No food registration, insurance, tax profile or payment account has been verified. Customers cannot order or request catering from this demo.',
        },
      });
      if (changed.count !== 1) throw new Error('The demo changed; configuration was rolled back.');
      await tx.deliveryConfig.update({
        where: { vendorId: vendor.id },
        data: {
          postcodes: ['ME3'],
          localRadiusMiles: 0,
          kitchenPostcode: 'ME3 9AA',
          collectionAddress: 'DEMO ONLY - no collection point or delivery service, ME3',
          collectionLine1: 'DEMO kitchen - not a real collection point',
          collectionLine2: 'Illustrative ME3 coverage only',
          collectionTown: 'Medway',
          collectionPostcode: 'ME3 9AA',
          latitude: null,
          longitude: null,
          nationwideEnabled: false,
        },
      });
      const previouslyAudited = await tx.auditLog.findFirst({
        where: { entityId: vendor.id, action: 'demo_public_preview_configured' },
      });
      if (!previouslyAudited) {
        await tx.auditLog.create({
          data: {
            action: 'demo_public_preview_configured',
            entityType: 'Vendor',
            entityId: vendor.id,
            isTestData: true,
            provenance: 'nigerian-demo-vendor',
            metadata: { publicDemo: true, coverage: ['ME3'], ordersEnabled: false },
          },
        });
      }
    });
    console.log(
      JSON.stringify({ configured: true, slug: vendor.slug, coverage: ['ME3'], canOrder: false }),
    );
  }
} catch (error) {
  const code = /^P\d{4}$/.test(error?.code ?? '') ? ` (${error.code})` : '';
  console.error(
    `Demo preview configuration failed while ${stage}${code}; no partial changes committed.`,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
