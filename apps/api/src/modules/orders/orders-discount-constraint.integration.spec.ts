/**
 * Integration test (REAL Postgres): proves the orders_discount_funded_by_required
 * CHECK constraint rejects a direct INSERT that bypasses OrdersService.
 *
 * The application layer guards first (DISCOUNT_FUNDED_BY_REQUIRED BadRequestException).
 * This test proves the database-level backstop is in place so future code paths
 * that do not go through the service cannot silently produce orders with an
 * indeterminate vendor payout.
 *
 * Skipped when SUPABASE_DB_URL is not set, so plain unit-test runs stay green
 * without a database connection.
 */

import { DeliveryType, OrderStatus, PaymentStatus, UserRole, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const d = process.env.SUPABASE_DB_URL ? describe : describe.skip;
if (!process.env.SUPABASE_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[orders-discount-constraint] skipping: SUPABASE_DB_URL not set');
}

const RUN = Date.now();

d('orders_discount_funded_by_required CHECK constraint (integration, real DB)', () => {
  let prisma: PrismaService;
  let customerId: string;
  let vendorUserId: string;
  let vendorId: string;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: process.env.SUPABASE_DB_URL });

    // Create minimal fixture rows so the FK constraints are satisfied and only
    // the CHECK constraint is under test.
    const customer = await prisma.user.create({
      data: {
        email: `chk-customer-${RUN}@test.invalid`,
        role: UserRole.customer,
        firstName: 'Check',
        lastName: 'Test',
      },
    });
    customerId = customer.id;

    const vendorUser = await prisma.user.create({
      data: {
        email: `chk-vendor-${RUN}@test.invalid`,
        role: UserRole.vendor,
        firstName: 'Check',
        lastName: 'Vendor',
      },
    });
    vendorUserId = vendorUser.id;

    const vendor = await prisma.vendor.create({
      data: {
        userId: vendorUserId,
        businessName: `Check Constraint Vendor ${RUN}`,
        slug: `chk-vendor-${RUN}`,
        status: VendorStatus.active,
      },
    });
    vendorId = vendor.id;
  });

  afterAll(async () => {
    // Clean up all fixtures in dependency order.
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.vendor.deleteMany({ where: { id: vendorId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, vendorUserId] } } });
    await prisma.$disconnect();
  });

  it('constraint exists in pg_constraint with the correct expression', async () => {
    const rows = await prisma.$queryRaw<{ conname: string; definition: string }[]>`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'orders_discount_funded_by_required'
        AND conrelid = 'orders'::regclass
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toMatch(/discount_pence\s*=\s*0/);
    expect(rows[0].definition).toMatch(/discount_funded_by IS NOT NULL/);
  });

  it('rejects a direct order create with discount_pence > 0 and null discount_funded_by', async () => {
    // This bypasses OrdersService entirely and writes directly via Prisma.
    // The CHECK constraint must catch it before the row is committed.
    await expect(
      prisma.order.create({
        data: {
          orderNumber: `CHK-CONSTRAINT-${RUN}`,
          customerId,
          vendorId,
          deliveryType: DeliveryType.collection,
          status: OrderStatus.pending,
          paymentStatus: PaymentStatus.unpaid,
          subtotalPence: 1000,
          deliveryFeePence: 0,
          serviceFeePence: 0,
          discountPence: 100,
          discountFundedBy: null, // violates orders_discount_funded_by_required
          totalPence: 900,
          commissionPence: 0,
          vendorPayoutPence: 900,
          foundingAllowanceAppliedPence: 0,
          scheduledFor: new Date('2026-12-25'),
        },
      }),
    ).rejects.toThrow(/orders_discount_funded_by_required/);
  });

  it('accepts a direct create with discount_pence > 0 when discount_funded_by is set', async () => {
    // Positive control: same row but with a valid funded-by value must succeed.
    const order = await prisma.order.create({
      data: {
        orderNumber: `CHK-VALID-${RUN}`,
        customerId,
        vendorId,
        deliveryType: DeliveryType.collection,
        status: OrderStatus.pending,
        paymentStatus: PaymentStatus.unpaid,
        subtotalPence: 1000,
        deliveryFeePence: 0,
        serviceFeePence: 0,
        discountPence: 100,
        discountFundedBy: 'PLATFORM',
        totalPence: 900,
        commissionPence: 0,
        vendorPayoutPence: 900,
        foundingAllowanceAppliedPence: 0,
        scheduledFor: new Date('2026-12-25'),
      },
      select: { id: true, discountFundedBy: true },
    });
    expect(order.discountFundedBy).toBe('PLATFORM');
    // Clean up this valid row immediately.
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('accepts a direct create with discount_pence = 0 and null discount_funded_by', async () => {
    // Zero discount with null funded-by must succeed (no discount, no funding needed).
    const order = await prisma.order.create({
      data: {
        orderNumber: `CHK-NODISCOUNT-${RUN}`,
        customerId,
        vendorId,
        deliveryType: DeliveryType.collection,
        status: OrderStatus.pending,
        paymentStatus: PaymentStatus.unpaid,
        subtotalPence: 1000,
        deliveryFeePence: 0,
        serviceFeePence: 0,
        discountPence: 0,
        discountFundedBy: null,
        totalPence: 1000,
        commissionPence: 0,
        vendorPayoutPence: 1000,
        foundingAllowanceAppliedPence: 0,
        scheduledFor: new Date('2026-12-25'),
      },
      select: { id: true, discountFundedBy: true },
    });
    expect(order.discountFundedBy).toBeNull();
    await prisma.order.delete({ where: { id: order.id } });
  });
});
