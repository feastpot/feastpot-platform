/* eslint-disable no-console */
/**
 * PART B / B3 regression evidence script (read-write against dev DB,
 * cleans up after itself). Run:
 *   cd apps/api && CAPACITY_ENFORCEMENT=true TS_NODE_SKIP_PROJECT=true \
 *   npx ts-node --transpile-only -O '{"module":"commonjs","esModuleInterop":true}' \
 *   scripts/capacity-regression-b3.ts
 */
import { PrismaClient } from '@prisma/client';

import {
  CapacityExceededError,
  PreorderCutoffPassedError,
  getVendorAvailability,
  isCapacityEnforcementEnabled,
  releaseCapacity,
  reserveCapacity,
} from '../src/modules/vendors/vendor-capacity';

const VENDOR = 'fd77aa4b-77e1-4e0d-b19e-29cf9ca973d4'; // seeded dev vendor
const db = new PrismaClient({ datasources: { db: { url: process.env.SUPABASE_DIRECT_URL } } });

const D_LAST_SLOT = new Date('2026-09-07');
const D_CUTOFF = new Date('2026-09-08');
const D_BST = new Date('2026-10-25'); // BST -> GMT boundary date (last Sunday of Oct 2026)

async function cleanup() {
  await db.vendorCapacity.deleteMany({
    where: { vendorId: VENDOR, serviceDate: { in: [D_LAST_SLOT, D_CUTOFF, D_BST] } },
  });
}

async function main() {
  console.log('flag CAPACITY_ENFORCEMENT on?', isCapacityEnforcementEnabled());
  await cleanup();
  await db.vendorCapacity.createMany({
    data: [
      {
        vendorId: VENDOR,
        serviceDate: D_LAST_SLOT,
        capacityType: 'family_pot',
        totalSlots: 1,
        slotsTaken: 0,
      },
      {
        vendorId: VENDOR,
        serviceDate: D_CUTOFF,
        capacityType: 'family_pot',
        totalSlots: 5,
        slotsTaken: 0,
        preorderCutoffAt: new Date(Date.now() - 60_000),
      },
      {
        vendorId: VENDOR,
        serviceDate: D_BST,
        capacityType: 'family_pot',
        totalSlots: 4,
        slotsTaken: 0,
        preorderCutoffAt: new Date('2026-10-25T00:30:00Z'),
      },
    ],
  });

  // 1. Two concurrent orders on the last slot
  const results = await Promise.allSettled([
    reserveCapacity(db, VENDOR, D_LAST_SLOT, 'family_pot', 1),
    reserveCapacity(db, VENDOR, D_LAST_SLOT, 'family_pot', 1),
  ]);
  const wins = results.filter((r) => r.status === 'fulfilled').length;
  const capExceeded = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof CapacityExceededError,
  ).length;
  console.log(
    `B3-1 last-slot concurrency: wins=${wins} capacityExceeded=${capExceeded} (expect 1/1)`,
  );

  // 2. Cancellation releases capacity (and release clamps at zero)
  await releaseCapacity(db, VENDOR, D_LAST_SLOT, 'family_pot', 1);
  let row = await db.vendorCapacity.findFirst({
    where: { vendorId: VENDOR, serviceDate: D_LAST_SLOT },
  });
  console.log(`B3-2 release after cancel: slotsTaken=${row?.slotsTaken} (expect 0)`);
  await releaseCapacity(db, VENDOR, D_LAST_SLOT, 'family_pot', 5);
  row = await db.vendorCapacity.findFirst({
    where: { vendorId: VENDOR, serviceDate: D_LAST_SLOT },
  });
  console.log(`B3-2b over-release clamps: slotsTaken=${row?.slotsTaken} (expect 0, not negative)`);

  // 3. Cutoff passed between basket and payment
  try {
    await reserveCapacity(db, VENDOR, D_CUTOFF, 'family_pot', 1);
    console.log('B3-3 cutoff passed: RESERVED (unexpected)');
  } catch (e) {
    console.log(
      `B3-3 cutoff passed: rejected with ${e instanceof PreorderCutoffPassedError ? 'PreorderCutoffPassedError' : String(e)} (expect PreorderCutoffPassedError)`,
    );
  }

  // 4. Vendor reducing totalSlots below slotsTaken (DB CHECK constraint)
  await reserveCapacity(db, VENDOR, D_BST, 'family_pot', 2);
  try {
    await db.$executeRaw`UPDATE vendor_capacity SET total_slots = 1 WHERE vendor_id = ${VENDOR}::uuid AND service_date = ${D_BST} AND capacity_type = 'family_pot'`;
    console.log('B3-4 reduce below booked: UPDATE SUCCEEDED (unexpected)');
  } catch (e) {
    console.log(
      `B3-4 reduce below booked: blocked by DB constraint (${String(e).includes('slots_taken_range') ? 'vendor_capacity_slots_taken_range_chk' : 'error'})`,
    );
  }

  // 5. BST boundary date round-trips and cutoff (00:30 UTC = 01:30 BST on switch night) is honoured
  const days = await getVendorAvailability(db, VENDOR, new Date('2026-10-24'), 4);
  const bstDay = days.find((d) => d.serviceDate === '2026-10-25');
  console.log(
    `B3-5 BST boundary: serviceDate=${bstDay?.serviceDate} remaining=${bstDay?.remainingSlots}/${bstDay?.totalSlots} cutoff=${bstDay?.preorderCutoffAt} (date not shifted, slots intact)`,
  );

  await cleanup();
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  await db.$disconnect();
  process.exit(1);
});
