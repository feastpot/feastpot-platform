/**
 * Acceptance check for reserveCapacity (T5/T6): two parallel reservations
 * against a row with total_slots=1, slots_taken=0 - exactly one must win.
 * Run: CAPACITY_ENFORCEMENT=true npx ts-node apps/api/scripts/capacity-concurrency-test.ts
 */
import { CapacityType, PrismaClient } from '@prisma/client';

import { releaseCapacity, reserveCapacity } from '../src/modules/vendors/vendor-capacity';

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.SUPABASE_DIRECT_URL } },
  });
  const vendor = await prisma.vendor.findFirstOrThrow({ select: { id: true } });
  const serviceDate = new Date(Date.UTC(2026, 8, 15)); // 2026-09-15

  // Clean slate, then a 1-slot row.
  await prisma.vendorCapacity.deleteMany({
    where: { vendorId: vendor.id, serviceDate, capacityType: CapacityType.family_pot },
  });
  await prisma.vendorCapacity.create({
    data: {
      vendorId: vendor.id,
      serviceDate,
      capacityType: CapacityType.family_pot,
      totalSlots: 1,
      slotsTaken: 0,
    },
  });

  console.log('CAPACITY_ENFORCEMENT =', process.env.CAPACITY_ENFORCEMENT);
  const attempt = (label: string) =>
    reserveCapacity(prisma, vendor.id, serviceDate, CapacityType.family_pot, 1)
      .then((r) => ({ label, outcome: 'SUCCESS' as const, remainingSlots: r.remainingSlots }))
      .catch((e: Error & { code?: string }) => ({
        label,
        outcome: 'REJECTED' as const,
        error: e.code ?? e.name,
      }));

  const results = await Promise.all([attempt('A'), attempt('B')]);
  console.log(JSON.stringify(results, null, 2));

  const row = await prisma.vendorCapacity.findFirstOrThrow({
    where: { vendorId: vendor.id, serviceDate, capacityType: CapacityType.family_pot },
    select: { totalSlots: true, slotsTaken: true },
  });
  console.log('final row:', row);

  const successes = results.filter((r) => r.outcome === 'SUCCESS').length;
  console.log(successes === 1 && row.slotsTaken === 1 ? 'PASS: exactly one succeeded' : 'FAIL');

  // releaseCapacity check: back to zero, clamped.
  const rel = await releaseCapacity(prisma, vendor.id, serviceDate, CapacityType.family_pot, 5);
  console.log('after release(5):', rel);

  await prisma.vendorCapacity.deleteMany({
    where: { vendorId: vendor.id, serviceDate, capacityType: CapacityType.family_pot },
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
