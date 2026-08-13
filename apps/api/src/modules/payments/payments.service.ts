import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, PaymentType, Prisma, UserRole } from '@prisma/client';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { NotificationsService } from '../notifications/notifications.service';

import { CreateRefundDto } from './dto/create-refund.dto';
import { ListChargebacksDto } from './dto/list-chargebacks.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

export const NOTIFICATIONS_QUEUE = 'notifications';
/** Refunds at or above this threshold require role=finance or role=admin. */
export const LARGE_REFUND_THRESHOLD_PENCE = 5000_00;

export interface RefundOrderEconomics {
  subtotalPence: number;
  serviceFeePence: number;
  deliveryFeePence: number;
  discountPence: number;
  commissionPence: number;
}

export interface RefundSplit {
  /** Refund size relative to the food subtotal; 1 for a full refund. */
  refundFraction: number;
  /** Clawed back from the vendor's payout - what they actually EARNED on the refunded portion. */
  vendorClawbackPence: number;
  /** Refund money Feastpot absorbs (its service-fee + commission share); netted against payouts via a credit row. */
  feastpotAbsorbedPence: number;
  /** Commission Feastpot gives back on this refund (audit/breakdown only). */
  commissionRefundedPence: number;
  /** Service fee Feastpot absorbs on this refund (audit/breakdown only). */
  serviceFeeAbsorbedPence: number;
}

/**
 * Split a customer refund into the vendor clawback vs. the portion Feastpot absorbs.
 *
 * REFUND CLAWBACK FORMULA - DO NOT CHANGE WITHOUT FINANCE SIGN-OFF
 *   vendorClawback = (subtotal + delivery − discount − commission) × refundFraction
 *
 * The base is what the vendor was PAID (== Order.vendorPayoutPence for a full
 * refund). It deliberately EXCLUDES serviceFee - that is Feastpot platform
 * revenue the vendor never received, so clawing it back would over-deduct them.
 * Feastpot absorbs the remainder of the customer refund (its service-fee +
 * commission share) so the customer is always made whole.
 *
 * Full refund → refundFraction = 1. Partial → min(refundPence / subtotal, 1).
 */
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
  // Clamp: never claw back more than the customer was refunded, never negative.
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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------- list --------------------

  async list(dto: ListPaymentsDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.PaymentWhereInput = {};
    if (dto.type) where.type = dto.type;
    if (dto.status) where.status = dto.status;
    if (dto.orderId) where.orderId = dto.orderId;

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.PaymentWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    const rows = await this.prisma.payment.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    const nextCursor = rows.length === limit ? this.encodeCursor(rows[rows.length - 1]!) : null;
    return { data: rows, nextCursor };
  }

  // -------------------- chargebacks (finance visibility) --------------------

  /**
   * Lists bank-initiated card chargebacks recorded from Stripe `charge.dispute.*`
   * webhooks. Gives finance status + amount visibility without the Stripe
   * Dashboard. Cursor-paginated like `list`, newest first.
   */
  async listChargebacks(dto: ListChargebacksDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.ChargebackWhereInput = {};
    if (dto.status) where.status = dto.status;
    if (dto.orderId) where.orderId = dto.orderId;

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.ChargebackWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    const rows = await this.prisma.chargeback.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        order: { select: { id: true, orderNumber: true, totalPence: true } },
      },
    });
    const nextCursor = rows.length === limit ? this.encodeCursor(rows[rows.length - 1]!) : null;
    return { data: rows, nextCursor };
  }

  /** Finance KPI tiles for the admin chargebacks screen. */
  async chargebackStats() {
    const now = new Date();
    const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const OPEN_STATUSES = [
      'needs_response',
      'warning_needs_response',
      'warning_under_review',
      'under_review',
    ];
    const [open, dueSoon, lostUnreconciled, openAmount] = await this.prisma.$transaction([
      this.prisma.chargeback.count({ where: { status: { in: OPEN_STATUSES } } }),
      this.prisma.chargeback.count({
        where: {
          status: { in: ['needs_response', 'warning_needs_response'] },
          evidenceDueBy: { gte: now, lte: in72h },
        },
      }),
      this.prisma.chargeback.count({ where: { status: 'lost', reconciledAt: null } }),
      this.prisma.chargeback.aggregate({
        where: { status: { in: OPEN_STATUSES } },
        _sum: { amountPence: true },
      }),
    ]);
    return {
      open,
      evidenceDueWithin72h: dueSoon,
      lostUnreconciled,
      openAmountPence: openAmount._sum.amountPence ?? 0,
    };
  }

  // -------------------- capture --------------------

  /**
   * Captures the latest authorised Stripe PaymentIntent for an order and stamps
   * a Payment(type=capture, status=succeeded) row. Idempotent: if the most recent
   * capture row is already succeeded, returns it unchanged.
   */
  async capturePayment(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, totalPence: true },
    });
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    const existing = await this.prisma.payment.findFirst({
      where: { orderId, stripePaymentIntentId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (!existing?.stripePaymentIntentId) {
      throw new BadRequestException({
        code: 'NO_PAYMENT_INTENT',
        message: 'Order has no Stripe payment intent on record',
      });
    }
    if (existing.type === PaymentType.capture && existing.status === PaymentStatus.succeeded) {
      return existing;
    }

    const intent = await this.stripe.capture(existing.stripePaymentIntentId);

    return this.prisma.payment.create({
      data: {
        orderId,
        userId: order.customerId,
        type: PaymentType.capture,
        status: PaymentStatus.succeeded,
        amountPence: order.totalPence,
        currency: 'GBP',
        stripePaymentIntentId: existing.stripePaymentIntentId,
        stripeChargeId: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
        processedAt: new Date(),
      },
    });
  }

  // -------------------- refund --------------------

  async createRefund(
    dto: CreateRefundDto,
    authorisedBy: { id: string; role: UserRole },
    /**
     * Deterministic idempotency key. When supplied, Stripe returns the SAME
     * refund object for repeated calls with the same key, so retries (network
     * blip, BullMQ retry, dispute-close re-attempt after DB write failure)
     * cannot double-refund the customer.
     */
    idempotencyKey?: string,
  ) {
    if (
      dto.amountPence >= LARGE_REFUND_THRESHOLD_PENCE &&
      authorisedBy.role !== UserRole.finance &&
      authorisedBy.role !== UserRole.admin
    ) {
      throw new ForbiddenException({
        code: 'LARGE_REFUND_REQUIRES_FINANCE',
        message: `Refunds ≥ £${LARGE_REFUND_THRESHOLD_PENCE / 100} require role=finance or admin`,
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        customerId: true,
        vendorId: true,
        subtotalPence: true,
        serviceFeePence: true,
        deliveryFeePence: true,
        discountPence: true,
        commissionPence: true,
        totalPence: true,
        foundingAllowanceAppliedPence: true,
        vendor: { select: { userId: true } },
      },
    });
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (dto.amountPence > order.totalPence) {
      throw new BadRequestException({
        code: 'REFUND_EXCEEDS_TOTAL',
        message: `Refund (${dto.amountPence}p) exceeds order total (${order.totalPence}p)`,
      });
    }

    const lastPi = await this.prisma.payment.findFirst({
      where: { orderId: dto.orderId, stripePaymentIntentId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { stripePaymentIntentId: true },
    });
    if (!lastPi?.stripePaymentIntentId) {
      throw new BadRequestException({
        code: 'NO_PAYMENT_INTENT',
        message: 'No Stripe PI to refund against',
      });
    }

    // Cumulative-refund guard: total prior refunds + this refund cannot exceed total.
    const priorRefunds = await this.prisma.payment.aggregate({
      where: {
        orderId: dto.orderId,
        type: { in: [PaymentType.refund, PaymentType.partial_refund] },
      },
      _sum: { amountPence: true },
    });
    const alreadyRefundedPence = -(priorRefunds._sum.amountPence ?? 0);
    if (alreadyRefundedPence + dto.amountPence > order.totalPence) {
      throw new BadRequestException({
        code: 'CUMULATIVE_REFUND_EXCEEDS_TOTAL',
        message: `Refunds total (${alreadyRefundedPence + dto.amountPence}p) exceeds order total (${order.totalPence}p)`,
      });
    }

    // Pass `amount` so Stripe refunds the requested amount, not the full PI.
    // Idempotency key (when provided) makes the Stripe call safe to retry.
    const stripeRefund = await this.stripe.refund(
      lastPi.stripePaymentIntentId,
      dto.amountPence,
      idempotencyKey,
    );

    // Stripe is now the source of truth. If the DB writes below fail and the
    // caller retries with the same `idempotencyKey`, Stripe will return this
    // same refund (no double-debit) and the DB writes will succeed on retry.
    // If the caller retries WITHOUT a key - e.g. another endpoint - the
    // cumulative-refund guard above stops a duplicate refund being created.

    const isPartial = dto.amountPence < order.totalPence;
    // Vendor clawback excludes the platform service fee (Feastpot revenue the
    // vendor never received). Feastpot absorbs that share of the customer refund.
    const split = computeRefundSplit(
      dto.amountPence,
      {
        subtotalPence: order.subtotalPence,
        serviceFeePence: order.serviceFeePence,
        deliveryFeePence: order.deliveryFeePence,
        discountPence: order.discountPence,
        commissionPence: order.commissionPence,
      },
      !isPartial,
    );

    // The refund row and its companion credit row MUST be written atomically.
    // The weekly payout batch derives the vendor clawback by netting credit rows
    // against refund rows; if the refund row committed but the credit row did
    // not, the batch would claw back the FULL customer refund (service fee +
    // commission included) from the vendor - the exact over-deduction this fix
    // removes. A retry can't repair it either: stripeRefundId is unique and the
    // cumulative-refund guard would block re-entry. So commit both or neither.
    //
    // - Refund row: negative amount = cash leaving Feastpot's books;
    //   stripeRefundId is the natural key for webhook reconciliation.
    // - Credit row: the part of the refund the vendor is NOT liable for (its
    //   service-fee share plus the commission Feastpot gives back).
    const refundRow = await this.prisma.$transaction(async (tx) => {
      // Per-order advisory lock: serialises against a concurrent lost-chargeback
      // reconciliation (which takes the same lock) so the cumulative-refund
      // ceiling cannot be raced past by two writers whose pre-checks both read
      // stale totals.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.orderId}))`;
      // Re-check the ceiling INSIDE the lock scope. The pre-check above ran
      // before the Stripe call; a chargeback ledger write may have landed in
      // between. Throwing here rolls back cleanly - the Stripe refund already
      // exists, but the deterministic idempotencyKey means a retry returns the
      // SAME Stripe refund, and the thrown error surfaces the conflict to the
      // caller instead of silently over-refunding the ledger.
      const priorInTx = await tx.payment.aggregate({
        where: {
          orderId: dto.orderId,
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
        },
        _sum: { amountPence: true },
      });
      const refundedInTxPence = -(priorInTx._sum.amountPence ?? 0);
      if (refundedInTxPence + dto.amountPence > order.totalPence) {
        throw new BadRequestException({
          code: 'CUMULATIVE_REFUND_EXCEEDS_TOTAL',
          message: `Refunds total (${refundedInTxPence + dto.amountPence}p) exceeds order total (${order.totalPence}p); a concurrent refund/chargeback landed first`,
        });
      }
      const row = await tx.payment.create({
        data: {
          orderId: dto.orderId,
          userId: authorisedBy.id,
          type: isPartial ? PaymentType.partial_refund : PaymentType.refund,
          status: PaymentStatus.succeeded,
          amountPence: -dto.amountPence,
          currency: 'GBP',
          stripePaymentIntentId: lastPi.stripePaymentIntentId,
          stripeChargeId: typeof stripeRefund.charge === 'string' ? stripeRefund.charge : null,
          stripeRefundId: stripeRefund.id,
          failureReason: dto.reason ?? null,
          processedAt: new Date(),
        },
      });
      // The Feastpot-absorbed portion is written as TWO explicit credit rows so
      // the ledger itself records that the platform RETAINED the service fee
      // (previously only visible in a best-effort audit-log blob):
      //   1. service-fee share - platform revenue Feastpot keeps but absorbs
      //      against this refund (the vendor never received it),
      //   2. commission share - commission Feastpot gives back on the refund.
      // The weekly payout batch nets ALL credit rows against refund rows, so
      // splitting one credit into two with the same sum leaves the vendor
      // clawback arithmetic unchanged. Clamp so the rows always sum EXACTLY to
      // feastpotAbsorbedPence even under rounding on partial refunds.
      const serviceFeeCreditPence = Math.min(
        split.serviceFeeAbsorbedPence,
        split.feastpotAbsorbedPence,
      );
      const commissionCreditPence = split.feastpotAbsorbedPence - serviceFeeCreditPence;
      if (serviceFeeCreditPence > 0) {
        await tx.payment.create({
          data: {
            orderId: dto.orderId,
            userId: authorisedBy.id,
            type: PaymentType.credit,
            status: PaymentStatus.succeeded,
            amountPence: serviceFeeCreditPence,
            currency: 'GBP',
            failureReason: `service_fee_retained: platform service fee absorbed on refund ${row.id}`,
            processedAt: new Date(),
          },
        });
      }
      if (commissionCreditPence > 0) {
        await tx.payment.create({
          data: {
            orderId: dto.orderId,
            userId: authorisedBy.id,
            type: PaymentType.credit,
            status: PaymentStatus.succeeded,
            amountPence: commissionCreditPence,
            currency: 'GBP',
            failureReason: `commission_refunded: Feastpot commission share absorbed on refund ${row.id}`,
            processedAt: new Date(),
          },
        });
      }
      // Audit record is atomic with the money rows: a refund can no longer
      // commit without its permanent reconciliation trail.
      await tx.auditLog.create({
        data: {
          actorId: authorisedBy.id,
          action: 'refund_issued',
          entityType: 'orders',
          entityId: order.id,
          metadata: {
            customerRefundPence: dto.amountPence,
            vendorClawbackPence: split.vendorClawbackPence,
            feastpotAbsorbedPence: split.feastpotAbsorbedPence,
            serviceFeeRetainedPence: serviceFeeCreditPence,
            serviceFeePenceAbsorbed: split.serviceFeeAbsorbedPence,
            commissionRefundedPence: split.commissionRefundedPence,
            partial: isPartial,
          } as Prisma.JsonObject,
        },
      });
      return row;
    });

    // Durable enqueue: NotificationsService never throws AND never drops -
    // if the queue is down the events are persisted to notification_outbox
    // and retried by the outbox drainer until they reach the queue. Money
    // moved above; both parties WILL be told, eventually.
    await Promise.all([
      this.notifications.enqueue('refund_issued_customer', {
        orderId: dto.orderId,
        customerId: order.customerId,
        amountPence: dto.amountPence,
      }),
      this.notifications.enqueue('refund_deducted_vendor', {
        orderId: dto.orderId,
        vendorId: order.vendorId,
        vendorUserId: order.vendor.userId,
        deductionPence: split.vendorClawbackPence,
      }),
    ]);

    // Restore founding allowance proportionally. The order consumed
    // foundingAllowanceAppliedPence when it was created; returning those pence
    // lets the vendor re-use the allowance on a future order rather than
    // permanently burning it on an order that never completed.
    if (order.foundingAllowanceAppliedPence > 0) {
      const restorePence = Math.round(
        split.refundFraction * order.foundingAllowanceAppliedPence,
      );
      if (restorePence > 0) {
        await this.prisma.vendor
          .update({
            where: { id: order.vendorId },
            data: { foundingAllowanceUsedPence: { decrement: restorePence } },
          })
          .catch((e: unknown) => {
            this.logger.error(
              `founding allowance restore failed for vendor=${order.vendorId} orderId=${dto.orderId}: ${String(e)}`,
            );
          });
      }
    }

    // If this was a full refund that leaves the vendor with zero completed
    // orders, reverse any referral top-up that was granted when the order
    // was first delivered, so the referrer is not rewarded for a vendor who
    // ultimately never traded.
    if (!isPartial) {
      await this.reverseFoundingReferralBonusIfNeeded(order.vendorId).catch((e: unknown) => {
        this.logger.error(
          `reverseFoundingReferralBonus failed for vendor=${order.vendorId}: ${String(e)}`,
        );
      });
    }

    return { refund: refundRow, split };
  }

  /**
   * Called after a full refund. If the vendor was referred and had a referral
   * top-up granted, and now has no remaining completed orders, the top-up is
   * reversed so the referrer does not keep a reward for a vendor who never
   * traded. The reversal is gated at the initial allowance floor (never below
   * commissionFreeGmvPence) so we never claw back the base grant.
   *
   * Suspension does NOT reverse the bonus: the referrer brought the vendor in,
   * even if Feastpot later removes them. Only a zero-completed-orders state
   * after a full refund triggers reversal.
   */
  private async reverseFoundingReferralBonusIfNeeded(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { referredByVendorId: true, foundingReferralBonusGrantedAt: true },
    });
    if (!vendor?.referredByVendorId || !vendor.foundingReferralBonusGrantedAt) return;

    const deliveredCount = await this.prisma.order.count({
      where: { vendorId, status: OrderStatus.delivered },
    });
    if (deliveredCount > 0) return;

    const { referredByVendorId } = vendor;
    const { referralBonusGmvPence, commissionFreeGmvPence } = PLATFORM_FACTS.foundingOffer;

    await this.prisma.$transaction(async (tx) => {
      // Lock both rows to prevent races with concurrent refunds or deliveries.
      const lockKeyReferred = `vendor:${vendorId}`;
      const lockKeyReferrer = `vendor:${referredByVendorId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKeyReferred}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKeyReferrer}, 0))`;

      // Re-check inside the lock.
      const still = await tx.vendor.findUniqueOrThrow({
        where: { id: vendorId },
        select: { foundingReferralBonusGrantedAt: true },
      });
      if (!still.foundingReferralBonusGrantedAt) return; // already reversed

      const count = await tx.order.count({ where: { vendorId, status: OrderStatus.delivered } });
      if (count > 0) return; // a delivery completed concurrently

      // Clear the marker so a future first delivery can trigger again.
      await tx.vendor.update({
        where: { id: vendorId },
        data: { foundingReferralBonusGrantedAt: null },
      });

      // Deduct the bonus from the referrer, never below the base grant.
      await tx.$executeRaw`
        UPDATE vendors
        SET founding_allowance_granted_pence =
          GREATEST(
            founding_allowance_granted_pence - ${referralBonusGmvPence},
            ${commissionFreeGmvPence}
          )
        WHERE id = ${referredByVendorId}::uuid
      `;
    });
  }

  // -------------------- helpers --------------------

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }),
      'utf8',
    ).toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as {
        c: string;
        id: string;
      };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
