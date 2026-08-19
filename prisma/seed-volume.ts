/**
 * seed-volume.ts
 *
 * Volume fixtures for Phase 6 performance testing. Only runs when the seed is
 * invoked with SEED_VOLUME=1:
 *
 *   SEED_VOLUME=1 npx ts-node --project tsconfig.seed.json prisma/seed.ts
 *
 * IDEMPOTENCY:
 *   Volume rows are tagged with a source field / note containing "[volume]".
 *   A re-run with SEED_VOLUME=1 first deletes all "[volume]"-tagged rows then
 *   re-inserts, so 5,000 orders never stack on top of 5,000.
 *
 * WHAT IS CREATED:
 *   - 500 vendor applications (includes 101+ in pending/awaiting_documents state)
 *   - 5,000 orders spread across seeded vendors (delivered/accepted/pending mix)
 *   - 2,000 audit-log rows (status-override, refund_issued, vendor_status_changed)
 *
 * NOTE: This seed does NOT create 500 live vendors. The performance targets for
 * vendor list and order list are measured against the 5,000-order / 101-application
 * dataset with the 20 seeded live vendors. Adding 500 new vendors would require
 * Supabase auth users; that is impractical in CI. Adjust if load-test infra lands.
 */

import { PrismaClient, VendorApplicationStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ── Production guard ────────────────────────────────────────────────────────
// Refuse to run against the production Supabase project.
const PROD_SUPABASE_REF = 'yeklvhoqanxnogjnhkui';
if ((process.env.DATABASE_URL ?? '').includes(PROD_SUPABASE_REF)) {
  console.error(
    '\n❌  SEED REFUSED: DATABASE_URL points to the production Supabase project ' +
      `(${PROD_SUPABASE_REF}).\n` +
      '   Running seed-volume on production would destroy real customer data.\n' +
      '   Point DATABASE_URL at the development database and try again.\n',
  );
  process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const VOLUME_TAG = '[volume]';

export async function seedVolume(): Promise<void> {
  console.info('[seed-volume] cleaning up prior volume rows...');

  // Delete in reverse FK order.
  await prisma.auditLog.deleteMany({
    where: { metadata: { path: ['source'], equals: VOLUME_TAG } },
  });
  await prisma.order.deleteMany({
    where: { notes: { contains: VOLUME_TAG } },
  });
  await prisma.vendorApplication.deleteMany({
    where: { businessDescription: { contains: VOLUME_TAG } },
  });

  console.info('[seed-volume] deleted prior volume rows');

  // ── 500 vendor applications ──────────────────────────────────────────────────
  console.info('[seed-volume] inserting 500 vendor applications...');

  // Use the seeded vendor users as applicant pool (cycle if needed).
  const vendorUsers = await prisma.user.findMany({
    where: { role: 'vendor' },
    select: { id: true, email: true },
    take: 50,
  });
  if (vendorUsers.length === 0) throw new Error('No vendor users found - run main seed first');

  const applicationStatuses: VendorApplicationStatus[] = [
    VendorApplicationStatus.pending,
    VendorApplicationStatus.pending,
    VendorApplicationStatus.awaiting_documents,
    VendorApplicationStatus.approved,
    VendorApplicationStatus.rejected,
  ];

  const BATCH = 50;
  for (let i = 0; i < 500; i += BATCH) {
    const rows = Array.from({ length: Math.min(BATCH, 500 - i) }, (_, j) => {
      const idx = i + j;
      const user = vendorUsers[idx % vendorUsers.length];
      const status = applicationStatuses[idx % applicationStatuses.length];
      return {
        userId: user.id,
        businessName: `Volume Vendor ${idx + 1}`,
        businessDescription: `Volume test applicant ${idx + 1} ${VOLUME_TAG}`,
        cuisines: ['British'],
        postcode: 'SE1 7PB',
        status,
        submittedAt: new Date(Date.now() - idx * 3_600_000),
        reviewedAt: status !== VendorApplicationStatus.pending ? new Date() : null,
      };
    });
    await prisma.vendorApplication.createMany({ data: rows });
    if (i % 200 === 0) console.info(`[seed-volume]   applications: ${i + BATCH}/500`);
  }
  console.info('[seed-volume] 500 applications created');

  // ── 5,000 orders ─────────────────────────────────────────────────────────────
  console.info('[seed-volume] inserting 5,000 orders...');

  const vendors = await prisma.vendor.findMany({
    where: { status: 'live' },
    select: { id: true, userId: true },
    take: 20,
  });
  const customers = await prisma.user.findMany({
    where: { role: 'customer' },
    select: { id: true },
    take: 6,
  });
  if (vendors.length === 0 || customers.length === 0) {
    throw new Error('No live vendors or customers found - run main seed first');
  }

  const ORDER_STATUSES = ['delivered', 'delivered', 'delivered', 'accepted', 'pending'] as const;

  for (let i = 0; i < 5000; i += BATCH) {
    const chunk = Math.min(BATCH, 5000 - i);
    const rows = Array.from({ length: chunk }, (_, j) => {
      const idx = i + j;
      const vendor = vendors[idx % vendors.length];
      const customer = customers[idx % customers.length];
      const status = ORDER_STATUSES[idx % ORDER_STATUSES.length];
      const subtotalPence = 800 + ((idx * 137) % 4200);
      const deliveryFeePence = 200 + ((idx * 31) % 300);
      const commissionPence = Math.round(subtotalPence * 0.12);
      const vendorPayoutPence = subtotalPence + deliveryFeePence - commissionPence;
      const createdAt = new Date(Date.now() - idx * 1_800_000);
      return {
        orderNumber: `FP-V${String(idx + 1).padStart(5, '0')}`,
        customerId: customer.id,
        vendorId: vendor.id,
        deliveryType: 'local' as const,
        status,
        subtotalPence,
        deliveryFeePence,
        serviceFeePence: 99,
        discountPence: 0,
        totalPence: subtotalPence + deliveryFeePence + 99,
        commissionPence,
        vendorPayoutPence,
        foundingAllowanceAppliedPence: 0,
        allergenConfirmed: true,
        notes: `Volume order ${idx + 1} ${VOLUME_TAG}`,
        createdAt,
        deliveredAt: status === 'delivered' ? createdAt : null,
        acceptedAt:
          status === 'accepted' || status === 'delivered' ? new Date(createdAt.getTime() + 300_000) : null,
      };
    });
    await prisma.order.createMany({ data: rows });
    if (i % 1000 === 0) console.info(`[seed-volume]   orders: ${i + chunk}/5000`);
  }
  console.info('[seed-volume] 5,000 orders created');

  // ── 2,000 audit-log rows ─────────────────────────────────────────────────────
  console.info('[seed-volume] inserting 2,000 audit-log rows...');

  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
  if (!adminUser) throw new Error('No admin user found - run main seed first');

  const AUDIT_ACTIONS = [
    'status_override',
    'refund_issued',
    'vendor_status_changed',
    'order_accepted',
    'payout_approved',
  ] as const;

  for (let i = 0; i < 2000; i += BATCH) {
    const chunk = Math.min(BATCH, 2000 - i);
    const rows = Array.from({ length: chunk }, (_, j) => {
      const idx = i + j;
      const action = AUDIT_ACTIONS[idx % AUDIT_ACTIONS.length];
      return {
        actorId: adminUser.id,
        action,
        entityType: 'orders',
        entityId: adminUser.id, // placeholder entity id
        metadata: { source: VOLUME_TAG, index: idx } as object,
        createdAt: new Date(Date.now() - idx * 900_000),
      };
    });
    await prisma.auditLog.createMany({ data: rows });
    if (i % 500 === 0) console.info(`[seed-volume]   audit logs: ${i + chunk}/2000`);
  }
  console.info('[seed-volume] 2,000 audit-log rows created');

  console.info('[seed-volume] done.');
}

// Allow running standalone.
if (require.main === module) {
  seedVolume()
    .catch((e) => {
      console.error('[seed-volume] failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
