import { OrderStatus, PaymentStatus, PaymentType, Prisma } from '@prisma/client';

export interface RefundOrderEconomics {
  subtotalPence: number;
  serviceFeePence: number;
  deliveryFeePence: number;
  discountPence: number;
  commissionPence: number;
}

export interface RefundSplit {
  refundFraction: number;
  vendorClawbackPence: number;
  feastpotAbsorbedPence: number;
  commissionRefundedPence: number;
  serviceFeeAbsorbedPence: number;
}

export function computeRefundSplit(
  refundPence: number,
  econ: RefundOrderEconomics,
  isFull: boolean,
): RefundSplit {
  const vendorEarnedPence =
    econ.subtotalPence + econ.deliveryFeePence - econ.discountPence - econ.commissionPence;
  const refundFraction = isFull
    ? 1
    : econ.subtotalPence > 0
      ? Math.min(refundPence / econ.subtotalPence, 1)
      : 0;
  const vendorClawbackPence = Math.max(
    0,
    Math.min(Math.round(refundFraction * vendorEarnedPence), refundPence),
  );
  return {
    refundFraction,
    vendorClawbackPence,
    feastpotAbsorbedPence: refundPence - vendorClawbackPence,
    commissionRefundedPence: Math.round(refundFraction * econ.commissionPence),
    serviceFeeAbsorbedPence: Math.round(refundFraction * econ.serviceFeePence),
  };
}

export function computeIncrementalRefundSplit(
  alreadyRefundedPence: number,
  refundPence: number,
  econ: RefundOrderEconomics,
  orderTotalPence: number,
): RefundSplit {
  const cumulativePence = alreadyRefundedPence + refundPence;
  const after = computeRefundSplit(cumulativePence, econ, cumulativePence >= orderTotalPence);
  const before =
    alreadyRefundedPence > 0
      ? computeRefundSplit(alreadyRefundedPence, econ, false)
      : {
          refundFraction: 0,
          vendorClawbackPence: 0,
          feastpotAbsorbedPence: 0,
          commissionRefundedPence: 0,
          serviceFeeAbsorbedPence: 0,
        };
  const vendorClawbackPence = Math.max(
    0,
    Math.min(after.vendorClawbackPence - before.vendorClawbackPence, refundPence),
  );
  const feastpotAbsorbedPence = refundPence - vendorClawbackPence;
  return {
    refundFraction: Math.max(0, after.refundFraction - before.refundFraction),
    vendorClawbackPence,
    feastpotAbsorbedPence,
    commissionRefundedPence: Math.max(
      0,
      after.commissionRefundedPence - before.commissionRefundedPence,
    ),
    serviceFeeAbsorbedPence: Math.max(
      0,
      Math.min(
        after.serviceFeeAbsorbedPence - before.serviceFeeAbsorbedPence,
        feastpotAbsorbedPence,
      ),
    ),
  };
}

export interface OrderRefundLedgerInput {
  order: RefundOrderEconomics & {
    id: string;
    customerId: string;
    vendorId: string;
    status: OrderStatus;
    totalPence: number;
    foundingAllowanceAppliedPence: number;
  };
  alreadyRefundedPence: number;
  amountPence: number;
  userId: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeRefundId?: string | null;
  failureReason: string | null;
  auditAction: string;
  auditActorId: string | null;
  auditMetadata?: Prisma.JsonObject;
}

/**
 * The single order-refund ledger writer used by first-party refunds and lost
 * chargebacks. The caller must hold the per-order advisory transaction lock.
 */
export async function writeOrderRefundLedger(
  tx: Prisma.TransactionClient,
  input: OrderRefundLedgerInput,
) {
  const { order } = input;
  const cumulativePence = input.alreadyRefundedPence + input.amountPence;
  const cumulativelyFull = cumulativePence >= order.totalPence;
  const split = computeIncrementalRefundSplit(
    input.alreadyRefundedPence,
    input.amountPence,
    order,
    order.totalPence,
  );
  const refund = await tx.payment.create({
    data: {
      orderId: order.id,
      userId: input.userId,
      type: cumulativelyFull ? PaymentType.refund : PaymentType.partial_refund,
      status: PaymentStatus.succeeded,
      amountPence: -input.amountPence,
      currency: 'GBP',
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      stripeChargeId: input.stripeChargeId ?? null,
      stripeRefundId: input.stripeRefundId ?? null,
      failureReason: input.failureReason,
      processedAt: new Date(),
    },
  });

  const terminal: OrderStatus[] = [
    OrderStatus.delivered,
    OrderStatus.cancelled,
    OrderStatus.rejected,
    OrderStatus.refunded,
    OrderStatus.partially_refunded,
  ];
  const newStatus = cumulativelyFull
    ? OrderStatus.refunded
    : terminal.includes(order.status)
      ? OrderStatus.partially_refunded
      : null;
  if (newStatus && newStatus !== order.status) {
    await tx.order.update({ where: { id: order.id }, data: { status: newStatus } });
  }

  const serviceFeeCreditPence = Math.min(
    split.serviceFeeAbsorbedPence,
    split.feastpotAbsorbedPence,
  );
  const commissionCreditPence = split.feastpotAbsorbedPence - serviceFeeCreditPence;
  if (serviceFeeCreditPence > 0) {
    await tx.payment.create({
      data: {
        orderId: order.id,
        userId: input.userId,
        type: PaymentType.credit,
        status: PaymentStatus.succeeded,
        amountPence: serviceFeeCreditPence,
        currency: 'GBP',
        failureReason: `service_fee_retained: platform service fee absorbed on refund ${refund.id}`,
        processedAt: new Date(),
      },
    });
  }
  if (commissionCreditPence > 0) {
    await tx.payment.create({
      data: {
        orderId: order.id,
        userId: input.userId,
        type: PaymentType.credit,
        status: PaymentStatus.succeeded,
        amountPence: commissionCreditPence,
        currency: 'GBP',
        failureReason: `commission_refunded: Feastpot commission share absorbed on refund ${refund.id}`,
        processedAt: new Date(),
      },
    });
  }

  const allowanceRestoredPence =
    order.foundingAllowanceAppliedPence > 0
      ? Math.round(split.refundFraction * order.foundingAllowanceAppliedPence)
      : 0;
  if (allowanceRestoredPence > 0) {
    await tx.vendor.update({
      where: { id: order.vendorId },
      data: { foundingAllowanceUsedPence: { decrement: allowanceRestoredPence } },
    });
  }

  await tx.auditLog.create({
    data: {
      actorId: input.auditActorId,
      action: input.auditAction,
      entityType: 'orders',
      entityId: order.id,
      metadata: {
        customerRefundPence: input.amountPence,
        vendorClawbackPence: split.vendorClawbackPence,
        feastpotAbsorbedPence: split.feastpotAbsorbedPence,
        serviceFeeRetainedPence: serviceFeeCreditPence,
        serviceFeePenceAbsorbed: split.serviceFeeAbsorbedPence,
        commissionRefundedPence: split.commissionRefundedPence,
        partial: !cumulativelyFull,
        refundPaymentId: refund.id,
        previousOrderStatus: order.status,
        allowanceRestoredPence,
        ...(input.auditMetadata ?? {}),
      } as Prisma.JsonObject,
    },
  });
  return { refund, split, allowanceRestoredPence };
}
