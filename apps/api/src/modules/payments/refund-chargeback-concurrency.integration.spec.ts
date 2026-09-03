import {
  DeliveryType,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  UserRole,
  VendorStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminService } from '../admin/admin.service';
import { buildPayoutStatement } from '../payouts/payout-statement';

import { PaymentsService, computeRefundSplit } from './payments.service';
import { StripeWebhookProcessor } from './stripe-webhook.processor';

/**
 * Integration test (REAL Postgres, mocked Stripe): proves the per-order
 * pg_advisory_xact_lock + in-transaction ceiling re-check in both
 * PaymentsService.createRefund and StripeWebhookProcessor.reconcileLostChargeback
 * hold under true concurrency - a simultaneous manual refund and lost-chargeback
 * reconciliation on the same order can never over-refund the order total.
 *
 * Both writers pass their OUT-of-transaction pre-checks (each reads a stale
 * "nothing refunded yet" total), then race into their write transactions. The
 * advisory lock serialises them; the loser must either throw
 * CUMULATIVE_REFUND_EXCEEDS_TOTAL (manual refund path) or cap/skip its write
 * (chargeback path). Either way, SUM(refund rows) never exceeds totalPence.
 *
 * Also asserts the zero-floored ledger reconcile in AdminService
 * (reconcilePayoutLedger) matches the canonical payout statement on the resulting
 * high-refund period (net payout floored at 0, never negative).
 *
 * Skip behaviour mirrors the e2e smoke: skipped entirely when SUPABASE_DB_URL
 * is not set, so plain unit-test runs stay green without a database.
 */
const d = process.env.SUPABASE_DB_URL ? describe : describe.skip;
if (!process.env.SUPABASE_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[refund-chargeback-concurrency] skipping: SUPABASE_DB_URL not set');
}

// Historical pre-cutover order economics: total 10000p. Commission 12% of subtotal (1080p).
// vendorPayout = subtotal + delivery − discount − commission = 8420p.
const SUBTOTAL = 9000;
const SERVICE_FEE = 500;
const DELIVERY_FEE = 500;
const DISCOUNT = 0;
const COMMISSION = 1080;
const TOTAL = SUBTOTAL + SERVICE_FEE + DELIVERY_FEE - DISCOUNT;
const VENDOR_PAYOUT = SUBTOTAL + DELIVERY_FEE - DISCOUNT - COMMISSION;

const RUN = Date.now();

d('Concurrent refund + lost-chargeback reconciliation (integration, real DB)', () => {
  let prisma: PrismaService;
  let payments: PaymentsService;
  let processor: StripeWebhookProcessor;
  let admin: AdminService;

  let customerId: string;
  let vendorUserId: string;
  let staffId: string;
  let vendorId: string;
  let orderId: string;
  const disputeId = `dp_test_concurrency_${RUN}`;

  // Stripe mock: refunds "succeed" instantly and return a unique refund id.
  let refundSeq = 0;
  const stripeMock = {
    refund: jest.fn(async (_pi: string, amountPence?: number) => ({
      id: `re_test_concurrency_${RUN}_${++refundSeq}`,
      amount: amountPence,
      charge: `ch_test_concurrency_${RUN}`,
    })),
  };
  // Notifications queue mock: enqueue is best-effort in createRefund.
  const queueMock = { add: jest.fn(async () => undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Services wired directly against the real DB; Stripe/queue/loyalty mocked.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments = new PaymentsService(prisma, stripeMock as any, queueMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor = new StripeWebhookProcessor(prisma, {} as any);
    // reconcilePayoutLedger only touches prisma; other AdminService deps unused.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin = new AdminService(prisma, {} as any, {} as any, {} as any, {} as any);

    // ---- seed: customer, staff (refund actor), vendor user, vendor, order ----
    const [customer, staff, vendorUser] = await Promise.all([
      prisma.user.create({
        data: { email: `conc-cust-${RUN}@test.feastpot.co.uk`, role: UserRole.customer },
      }),
      prisma.user.create({
        data: { email: `conc-staff-${RUN}@test.feastpot.co.uk`, role: UserRole.admin },
      }),
      prisma.user.create({
        data: { email: `conc-vendor-${RUN}@test.feastpot.co.uk`, role: UserRole.vendor },
      }),
    ]);
    customerId = customer.id;
    staffId = staff.id;
    vendorUserId = vendorUser.id;

    const vendor = await prisma.vendor.create({
      data: {
        userId: vendorUserId,
        businessName: `Concurrency Test Kitchen ${RUN}`,
        slug: `concurrency-test-kitchen-${RUN}`,
        status: VendorStatus.live,
        commissionBps: 1200,
      },
    });
    vendorId = vendor.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `CONC-${RUN}`,
        customerId,
        vendorId,
        deliveryType: DeliveryType.local,
        status: OrderStatus.delivered,
        deliveredAt: new Date('2026-07-15T12:00:00Z'),
        subtotalPence: SUBTOTAL,
        serviceFeePence: SERVICE_FEE,
        deliveryFeePence: DELIVERY_FEE,
        discountPence: DISCOUNT,
        commissionPence: COMMISSION,
        vendorPayoutPence: VENDOR_PAYOUT,
        totalPence: TOTAL,
      },
    });
    orderId = order.id;

    // Original capture payment - createRefund resolves the Stripe PI from it.
    await prisma.payment.create({
      data: {
        orderId,
        userId: customerId,
        type: PaymentType.capture,
        status: PaymentStatus.succeeded,
        amountPence: TOTAL,
        currency: 'GBP',
        stripePaymentIntentId: `pi_test_concurrency_${RUN}`,
        processedAt: new Date(),
      },
    });

    // LOST chargeback for the full order amount, not yet reconciled.
    await prisma.chargeback.create({
      data: {
        orderId,
        stripeDisputeId: disputeId,
        amountPence: TOTAL,
        currency: 'GBP',
        status: 'lost',
        closedAt: new Date(),
      },
    });
  }, 60_000);

  afterAll(async () => {
    // Best-effort cleanup; payments cascade with the order.
    try {
      await prisma.chargeback.deleteMany({ where: { stripeDisputeId: disputeId } });
      if (orderId) await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
      if (vendorId) await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { id: { in: [customerId, staffId, vendorUserId].filter(Boolean) } } })
        .catch(() => undefined);
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  it('a simultaneous full manual refund and lost-chargeback reconciliation never over-refund the order', async () => {
    // Fire both concurrently. Each passes its own out-of-tx pre-check on a
    // stale (empty) refund total; only the advisory lock + in-tx re-check
    // stand between them and a double full refund.
    const [refundResult, reconcileResult] = await Promise.allSettled([
      payments.createRefund(
        { orderId, amountPence: TOTAL, reason: 'integration concurrency test' },
        { id: staffId, role: UserRole.admin },
        `conc-refund-${RUN}`,
      ),
      // reconcileLostChargeback is private by design (only reachable via the
      // dispute-closed webhook path); invoked directly to stage the race.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (processor as any).reconcileLostChargeback(disputeId) as Promise<void>,
    ]);

    // The chargeback path never throws on the ceiling - it caps to the
    // remaining refundable amount (possibly 0) inside the lock.
    expect(reconcileResult.status).toBe('fulfilled');

    // THE invariant: refund rows can never exceed the order total.
    const refunds = await prisma.payment.aggregate({
      where: { orderId, type: { in: [PaymentType.refund, PaymentType.partial_refund] } },
      _sum: { amountPence: true },
      _count: true,
    });
    const totalRefundedPence = -(refunds._sum.amountPence ?? 0);
    expect(totalRefundedPence).toBeLessThanOrEqual(TOTAL);

    // Exactly ONE full refund landed - whichever writer won the lock.
    expect(totalRefundedPence).toBe(TOTAL);
    expect(refunds._count).toBe(1);

    if (refundResult.status === 'rejected') {
      // Chargeback won the race: the manual refund must have failed loudly on
      // the in-transaction ceiling re-check, not silently written a row.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = (refundResult.reason as any)?.getResponse?.() ?? refundResult.reason;
      expect(JSON.stringify(resp)).toContain('CUMULATIVE_REFUND_EXCEEDS_TOTAL');
    } else {
      // Manual refund won: the chargeback reconciliation must have written
      // nothing (fully_refunded outcome) - verified by the single-row count
      // above - while still marking the chargeback reconciled below.
      expect(refundResult.value.refund.amountPence).toBe(-TOTAL);
    }

    // The chargeback is reconciled exactly once either way (CAS on reconciledAt).
    const cb = await prisma.chargeback.findUnique({ where: { stripeDisputeId: disputeId } });
    expect(cb?.reconciledAt).not.toBeNull();

    // A replay of the lost event is a no-op: still exactly one refund row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (processor as any).reconcileLostChargeback(disputeId);
    const after = await prisma.payment.aggregate({
      where: { orderId, type: { in: [PaymentType.refund, PaymentType.partial_refund] } },
      _sum: { amountPence: true },
    });
    expect(-(after._sum.amountPence ?? 0)).toBe(TOTAL);
  }, 60_000);

  it('zero-floored ledger reconcile matches the canonical payout statement on the high-refund period', async () => {
    // The full refund above makes this a high-refund period: the net vendor
    // clawback equals the whole vendorPayout, so netPence floors at 0.
    const [refundRows, creditRows] = await Promise.all([
      prisma.payment.aggregate({
        where: { orderId, type: { in: [PaymentType.refund, PaymentType.partial_refund] } },
        _sum: { amountPence: true },
      }),
      prisma.payment.aggregate({
        where: { orderId, type: PaymentType.credit },
        _sum: { amountPence: true },
      }),
    ]);
    const refundDeductionsPence = Math.max(
      0,
      -(refundRows._sum.amountPence ?? 0) - (creditRows._sum.amountPence ?? 0),
    );

    // Sanity: the credit rows equal the Feastpot-absorbed share of a full
    // refund, so the net clawback is exactly the vendor's payout.
    const split = computeRefundSplit(
      TOTAL,
      {
        subtotalPence: SUBTOTAL,
        serviceFeePence: SERVICE_FEE,
        deliveryFeePence: DELIVERY_FEE,
        discountPence: DISCOUNT,
        commissionPence: COMMISSION,
      },
      true,
    );
    expect(refundDeductionsPence).toBe(split.vendorClawbackPence);
    expect(refundDeductionsPence).toBe(VENDOR_PAYOUT);

    const statement = buildPayoutStatement({
      vendorId,
      vendorBusinessName: 'Concurrency Vendor',
      periodStart: new Date('2026-07-13T00:00:00Z'),
      periodEnd: new Date('2026-07-20T00:00:00Z'),
      hasOpenDispute: false,
      entries: [
        {
          id: orderId,
          kind: 'order',
          reference: 'Concurrency order',
          occurredAt: null,
          source: 'marketplace',
          effectiveCommissionRatePercent: '12.00',
          grossPence: TOTAL,
          foodSubtotalPence: SUBTOTAL,
          commissionPence: COMMISSION,
          serviceFeesPence: SERVICE_FEE,
          refundsPence: refundDeductionsPence,
          chargebacksPence: 0,
          vendorPayoutBeforeDeductionsPence: VENDOR_PAYOUT,
        },
      ],
    });
    // Zero floor: refunds consume the whole payout but never go negative.
    expect(statement.summary.netPayoutPence).toBe(0);
    expect(statement.summary.refundsPence).toBe(VENDOR_PAYOUT);

    // reconcilePayoutLedger recomputes from the same DB rows and must agree
    // with the batch on every component - including the zero-floored net.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (admin as any).reconcilePayoutLedger({
      vendorId,
      periodStart: new Date('2026-07-13T00:00:00Z'),
      periodEnd: new Date('2026-07-20T00:00:00Z'),
      grossPence: statement.summary.grossSalesPence,
      commissionPence: statement.summary.commissionPence,
      refundsPence: statement.summary.refundsPence,
      amountPence: statement.summary.netPayoutPence,
      orderCount: statement.summary.entryCount,
    });
    expect(result.status).toBe('match');
    expect(result.expected).toEqual({
      grossPence: statement.summary.grossSalesPence,
      commissionPence: statement.summary.commissionPence,
      refundsPence: statement.summary.refundsPence,
      netPence: 0,
      orderCount: 1,
    });
  }, 60_000);
});
