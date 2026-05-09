import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, PaymentType, Prisma, UserRole } from '@prisma/client';
import { Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

import { CreateRefundDto } from './dto/create-refund.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

export const NOTIFICATIONS_QUEUE = 'notifications';
/** Refunds at or above this threshold require role=finance or role=admin. */
export const LARGE_REFUND_THRESHOLD_PENCE = 5000_00;

export interface CommissionReversal {
  refundedCommissionPence: number;
  vendorRefundDeductionPence: number;
}

/** Computes how much commission Feastpot must "give back" when refunding a customer. */
export function computeCommissionReversal(refundPence: number, commissionBps: number): CommissionReversal {
  const refundedCommissionPence = Math.round((refundPence * commissionBps) / 10_000);
  return {
    refundedCommissionPence,
    vendorRefundDeductionPence: refundPence - refundedCommissionPence,
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
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
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

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

  async createRefund(dto: CreateRefundDto, authorisedBy: { id: string; role: UserRole }) {
    if (dto.amountPence >= LARGE_REFUND_THRESHOLD_PENCE && authorisedBy.role !== UserRole.finance && authorisedBy.role !== UserRole.admin) {
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
        totalPence: true,
        vendor: { select: { commissionBps: true, userId: true } },
      },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
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
      throw new BadRequestException({ code: 'NO_PAYMENT_INTENT', message: 'No Stripe PI to refund against' });
    }

    // Cumulative-refund guard: total prior refunds + this refund cannot exceed total.
    const priorRefunds = await this.prisma.payment.aggregate({
      where: { orderId: dto.orderId, type: { in: [PaymentType.refund, PaymentType.partial_refund] } },
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
    const stripeRefund = await this.stripe.refund(lastPi.stripePaymentIntentId, dto.amountPence);

    const isPartial = dto.amountPence < order.totalPence;
    const reversal = computeCommissionReversal(dto.amountPence, order.vendor.commissionBps);

    // Negative-amount Payment row represents the cash leaving Feastpot's books.
    // stripeRefundId is the natural key for webhook reconciliation (refund.updated).
    const refundRow = await this.prisma.payment.create({
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

    // Commission-reversal Payment row (positive credit back to Feastpot's commission line).
    // Stored as type=credit so it can be netted against payouts in the next batch.
    await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        userId: authorisedBy.id,
        type: PaymentType.credit,
        status: PaymentStatus.succeeded,
        amountPence: reversal.refundedCommissionPence,
        currency: 'GBP',
        failureReason: `Commission reversal for refund ${refundRow.id}`,
        processedAt: new Date(),
      },
    });

    await Promise.all([
      this.notifications.add('refund_issued_customer', {
        orderId: dto.orderId,
        customerId: order.customerId,
        amountPence: dto.amountPence,
      }),
      this.notifications.add('refund_deducted_vendor', {
        orderId: dto.orderId,
        vendorId: order.vendorId,
        vendorUserId: order.vendor.userId,
        deductionPence: reversal.vendorRefundDeductionPence,
      }),
    ]);

    return { refund: refundRow, reversal };
  }

  // -------------------- helpers --------------------

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
