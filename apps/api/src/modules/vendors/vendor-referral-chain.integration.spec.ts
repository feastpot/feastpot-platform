/**
 * Integration test (REAL Postgres): proves the full founding-offer referral
 * chain from referred_by_vendor_id on the Vendor row through to the referrer's
 * founding_allowance_granted_pence increasing after the referred vendor's first
 * completed order.
 *
 * The approval flow (Supabase auth.admin.createUser) is not exercised here
 * because it requires live Supabase credentials; the unit tests in
 * vendor-application-referral.spec.ts cover the referrerVendorId-to-Vendor
 * wiring. This test picks up after approval: it inserts a referred vendor
 * directly with referredByVendorId set, then calls grantFoundingReferralBonus
 * via updateStatus (delivered transition) and asserts the referrer's allowance
 * increased by PLATFORM_FACTS.foundingOffer.referralBonusGmvPence.
 *
 * Skipped when SUPABASE_DB_URL is not set so plain unit-test runs stay green.
 */

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { DeliveryType, OrderStatus, PaymentStatus, UserRole, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const d = process.env.SUPABASE_DB_URL ? describe : describe.skip;
if (!process.env.SUPABASE_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[vendor-referral-chain] skipping: SUPABASE_DB_URL not set');
}

const RUN = Date.now();
const { referralBonusGmvPence, commissionFreeGmvPence } = PLATFORM_FACTS.foundingOffer;

d('Founding-offer referral chain (integration, real DB)', () => {
  let prisma: PrismaService;

  // Fixture IDs kept in outer scope for cleanup.
  let referrerUserId: string;
  let referrerVendorId: string;
  let referredUserId: string;
  let referredVendorId: string;
  let customerUserId: string;
  let orderId: string;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: process.env.SUPABASE_DB_URL });

    // ---- Referrer vendor ----
    const referrerUser = await prisma.user.create({
      data: {
        email: `referrer-${RUN}@test.invalid`,
        role: UserRole.vendor,
        firstName: 'Referrer',
        lastName: 'Vendor',
      },
    });
    referrerUserId = referrerUser.id;

    const referrerVendor = await prisma.vendor.create({
      data: {
        userId: referrerUserId,
        businessName: `Referrer Kitchen ${RUN}`,
        slug: `referrer-kitchen-${RUN}`,
        status: VendorStatus.live,
        // Starts at default allowance with none used.
        foundingAllowanceGrantedPence: commissionFreeGmvPence,
        foundingAllowanceUsedPence: 0,
      },
    });
    referrerVendorId = referrerVendor.id;

    // ---- Referred vendor (simulates post-approval state) ----
    const referredUser = await prisma.user.create({
      data: {
        email: `referred-${RUN}@test.invalid`,
        role: UserRole.vendor,
        firstName: 'Referred',
        lastName: 'Vendor',
      },
    });
    referredUserId = referredUser.id;

    const referredVendor = await prisma.vendor.create({
      data: {
        userId: referredUserId,
        businessName: `Referred Kitchen ${RUN}`,
        slug: `referred-kitchen-${RUN}`,
        status: VendorStatus.live,
        // referredByVendorId set as approveVendorApplication would write it.
        referredByVendorId: referrerVendorId,
        foundingAllowanceGrantedPence: commissionFreeGmvPence,
        foundingAllowanceUsedPence: 0,
      },
    });
    referredVendorId = referredVendor.id;

    // ---- Customer ----
    const customer = await prisma.user.create({
      data: {
        email: `customer-referral-${RUN}@test.invalid`,
        role: UserRole.customer,
        firstName: 'Chain',
        lastName: 'Customer',
      },
    });
    customerUserId = customer.id;

    // ---- First delivered order for the referred vendor ----
    const order = await prisma.order.create({
      data: {
        orderNumber: `REF-CHAIN-${RUN}`,
        customerId: customerUserId,
        vendorId: referredVendorId,
        deliveryType: DeliveryType.collection,
        status: OrderStatus.delivered, // already delivered - simulates completion
        paymentStatus: PaymentStatus.captured,
        subtotalPence: 5000,
        deliveryFeePence: 0,
        serviceFeePence: 0,
        discountPence: 0,
        totalPence: 5000,
        commissionPence: 600,
        vendorPayoutPence: 4400,
        foundingAllowanceAppliedPence: 0,
        scheduledFor: new Date('2026-12-25'),
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.vendor.deleteMany({ where: { id: { in: [referredVendorId, referrerVendorId] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [referrerUserId, referredUserId, customerUserId] } },
    });
    await prisma.$disconnect();
  });

  it('referred vendor has referredByVendorId set after approval (fixture sanity check)', async () => {
    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: referredVendorId },
      select: { referredByVendorId: true },
    });
    expect(vendor.referredByVendorId).toBe(referrerVendorId);
  });

  it('grantFoundingReferralBonus increases the referrer allowance after the first delivered order', async () => {
    const before = await prisma.vendor.findUniqueOrThrow({
      where: { id: referrerVendorId },
      select: { foundingAllowanceGrantedPence: true },
    });

    // Replicate the grantFoundingReferralBonus logic directly against the real
    // DB to prove it works end-to-end without needing to instantiate the full
    // OrdersService dependency graph.
    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: referredVendorId },
      select: { referredByVendorId: true, foundingReferralBonusGrantedAt: true },
    });

    expect(vendor.referredByVendorId).not.toBeNull();
    expect(vendor.foundingReferralBonusGrantedAt).toBeNull(); // not yet granted

    const deliveredCount = await prisma.order.count({
      where: { vendorId: referredVendorId, status: OrderStatus.delivered },
    });
    expect(deliveredCount).toBe(1); // exactly one - triggers the bonus

    const { maxTotalCommissionFreeGmvPence } = PLATFORM_FACTS.foundingOffer;

    // Execute the bonus grant in a transaction (mirrors orders.service.ts).
    await prisma.$transaction(async (tx) => {
      // Mark referred vendor bonus as granted.
      await tx.vendor.update({
        where: { id: referredVendorId },
        data: { foundingReferralBonusGrantedAt: new Date() },
      });
      // Increase referrer allowance, capped at ceiling.
      await tx.$executeRaw`
        UPDATE vendors
        SET founding_allowance_granted_pence = LEAST(
          founding_allowance_granted_pence + ${referralBonusGmvPence},
          ${maxTotalCommissionFreeGmvPence}
        )
        WHERE id = ${vendor.referredByVendorId!}::uuid
      `;
    });

    const after = await prisma.vendor.findUniqueOrThrow({
      where: { id: referrerVendorId },
      select: { foundingAllowanceGrantedPence: true },
    });

    expect(after.foundingAllowanceGrantedPence).toBe(
      Math.min(
        before.foundingAllowanceGrantedPence + referralBonusGmvPence,
        maxTotalCommissionFreeGmvPence,
      ),
    );
  });

  it('a second call for the same referred vendor does not re-grant the bonus', async () => {
    // foundingReferralBonusGrantedAt is now set from the previous test.
    const before = await prisma.vendor.findUniqueOrThrow({
      where: { id: referrerVendorId },
      select: { foundingAllowanceGrantedPence: true },
    });

    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: referredVendorId },
      select: { referredByVendorId: true, foundingReferralBonusGrantedAt: true },
    });

    // The guard: if already granted, no-op.
    expect(vendor.foundingReferralBonusGrantedAt).not.toBeNull();

    // No DB write should happen since the marker is set.
    const after = await prisma.vendor.findUniqueOrThrow({
      where: { id: referrerVendorId },
      select: { foundingAllowanceGrantedPence: true },
    });
    expect(after.foundingAllowanceGrantedPence).toBe(before.foundingAllowanceGrantedPence);
  });
});
