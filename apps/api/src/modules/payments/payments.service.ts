import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CateringBookingStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  PayoutStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';

import { AdminRefundDto, RefundReason } from './dto/admin-refund.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ListChargebacksDto } from './dto/list-chargebacks.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { computeIncrementalRefundSplit, writeOrderRefundLedger } from './order-refund-ledger';

export const NOTIFICATIONS_QUEUE = 'notifications';
/** Refunds at or above this threshold require role=finance or role=admin. */
export const LARGE_REFUND_THRESHOLD_PENCE = 5000_00;

export { computeIncrementalRefundSplit, computeRefundSplit } from './order-refund-ledger';

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
    /** Structured reason/note detail recorded in the audit trail (admin endpoint). */
    opts?: { reasonCode?: RefundReason; note?: string },
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
        status: true,
        subtotalPence: true,
        serviceFeePence: true,
        deliveryFeePence: true,
        discountPence: true,
        commissionPence: true,
        totalPence: true,
        foundingAllowanceAppliedPence: true,
        // deliveredAt: locates the vendor-period batch payout covering this
        // order (batch payouts have orderId=null and span a delivery window).
        deliveredAt: true,
        // stripeAccountId: needed to compensate the vendor if a transfer
        // reversal succeeds but the subsequent refund/DB step fails.
        vendor: { select: { userId: true, stripeAccountId: true } },
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

    // Retry resolution BEFORE the cumulative guard: a successful earlier
    // attempt with the same deterministic key must return its committed row
    // as a duplicate - otherwise the guard sees the earlier refund and
    // rejects the retry, breaking the idempotent-retry guarantee.
    if (idempotencyKey) {
      const priorAudit = await this.prisma.auditLog.findFirst({
        where: {
          action: 'refund_issued',
          entityType: 'orders',
          entityId: dto.orderId,
          metadata: { path: ['idempotencyKey'], equals: idempotencyKey },
        },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      });
      const priorMeta = (priorAudit?.metadata ?? null) as {
        refundPaymentId?: string;
        vendorClawbackPence?: number;
        feastpotAbsorbedPence?: number;
        commissionRefundedPence?: number;
        serviceFeePenceAbsorbed?: number;
      } | null;
      if (priorMeta?.refundPaymentId) {
        const priorRow = await this.prisma.payment.findUnique({
          where: { id: priorMeta.refundPaymentId },
        });
        if (priorRow && priorRow.status !== PaymentStatus.failed) {
          return {
            refund: priorRow,
            split: {
              refundFraction: 0,
              vendorClawbackPence: priorMeta.vendorClawbackPence ?? 0,
              feastpotAbsorbedPence: priorMeta.feastpotAbsorbedPence ?? 0,
              commissionRefundedPence: priorMeta.commissionRefundedPence ?? 0,
              serviceFeeAbsorbedPence: priorMeta.serviceFeePenceAbsorbed ?? 0,
            },
            duplicate: true as const,
          };
        }
        if (priorRow?.status === PaymentStatus.failed) {
          // Reusing the key would make Stripe replay the FAILED refund object;
          // a reissue must be a genuinely new business attempt.
          throw new BadRequestException({
            code: 'REFUND_PREVIOUSLY_FAILED',
            message: `A previous refund attempt with this requestId failed at Stripe; reissue with a NEW requestId`,
          });
        }
      }
    }

    // Cumulative-refund guard: total prior refunds + this refund cannot exceed
    // total. FAILED rows are excluded - a failed refund never moved customer
    // money and has been ledger-compensated, so it must not block a reissue.
    // (Payout netting stays status-agnostic; that is a separate concern.)
    const priorRefunds = await this.prisma.payment.aggregate({
      where: {
        orderId: dto.orderId,
        type: { in: [PaymentType.refund, PaymentType.partial_refund] },
        status: { not: PaymentStatus.failed },
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

    // Full vs partial is CUMULATIVE: a final partial that brings total refunds
    // to the order total is, for every side effect (payment type, audit
    // metadata, referral cleanup, order status), a full refund. The in-tx
    // equality guard below aborts if prior refunds change concurrently, so
    // this pre-tx determination stays consistent with what commits.
    const isPartial = alreadyRefundedPence + dto.amountPence < order.totalPence;
    // Vendor clawback excludes the platform service fee (Feastpot revenue the
    // vendor never received). Feastpot absorbs that share of the customer
    // refund. Incremental against prior refunds so a SEQUENCE of partials can
    // never claw back more than the vendor's total earnings.
    const split = computeIncrementalRefundSplit(
      alreadyRefundedPence,
      dto.amountPence,
      {
        subtotalPence: order.subtotalPence,
        serviceFeePence: order.serviceFeePence,
        deliveryFeePence: order.deliveryFeePence,
        discountPence: order.discountPence,
        commissionPence: order.commissionPence,
      },
      order.totalPence,
    );

    // If the vendor has ALREADY been paid out for this specific order, the
    // weekly-batch clawback can't recover their share - the money left our
    // balance. Reverse the Stripe transfer for the clawback amount FIRST, so
    // that if the connected account cannot cover it (balance_insufficient) we
    // fail BEFORE issuing the customer refund and never end up with a split
    // ledger. Vendor-period batch payouts (orderId=null) are unaffected: the
    // ledger rows written below are netted by the NEXT batch automatically.
    // Find the payout that covers this order's earnings. Weekly batch payouts
    // are created with orderId=null spanning a delivery-date window, so match
    // EITHER a per-order payout OR the vendor-period payout whose window
    // contains deliveredAt. Failed payouts don't hold the money; drafts/held/
    // approved haven't moved it yet and can be adjusted in the DB instead.
    let reversal: {
      payoutId: string;
      keyBase: string | null;
      attempt: number;
      clawbackPence: number;
    } | null = null;
    let payoutToAdjust: string | null = null;
    if (split.vendorClawbackPence > 0) {
      const periodMatch: Prisma.PayoutWhereInput[] = [{ orderId: dto.orderId }];
      if (order.deliveredAt) {
        periodMatch.push({
          vendorId: order.vendorId,
          orderId: null,
          periodStart: { lte: order.deliveredAt },
          periodEnd: { gt: order.deliveredAt },
        });
      }
      const covering = await this.prisma.payout.findFirst({
        where: {
          status: {
            in: [
              PayoutStatus.draft,
              PayoutStatus.held,
              PayoutStatus.approved,
              PayoutStatus.transferred,
            ],
          },
          OR: periodMatch,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, stripeTransferId: true, amountPence: true },
      });
      if (covering?.status === PayoutStatus.transferred) {
        if (!covering.stripeTransferId) {
          throw new ConflictException({
            code: 'TRANSFER_REVERSAL_FAILED',
            message: `Payout ${covering.id} is transferred but has no Stripe transfer id - manual repair required before refunding.`,
          });
        }
        // The money already left our balance: claw it back via a Stripe
        // transfer reversal BEFORE issuing the customer refund.
        //
        // Attempt counter: if a previous attempt with this requestId was
        // reversed and then COMPENSATED (refund failed afterwards), reusing
        // the same idempotency key would return the original reversal without
        // pulling funds again - the vendor would keep the compensation AND the
        // customer would be refunded. Each compensation bumps the attempt so
        // the retry creates a genuinely new reversal.
        const keyBase = idempotencyKey ? `reversal:${idempotencyKey}` : null;
        const attempt = keyBase
          ? await this.prisma.auditLog.count({
              where: {
                action: 'transfer_reversal_compensated',
                metadata: { path: ['reversalKeyBase'], equals: keyBase },
              },
            })
          : 0;
        const reversalKey = keyBase
          ? attempt === 0
            ? keyBase
            : `${keyBase}:${attempt}`
          : undefined;
        let stripeReversalId: string;
        try {
          const rev = await this.stripe.createTransferReversal({
            transferId: covering.stripeTransferId,
            amountPence: split.vendorClawbackPence,
            idempotencyKey: reversalKey,
          });
          stripeReversalId = rev.id;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new ConflictException({
            code: 'TRANSFER_REVERSAL_FAILED',
            message:
              `The vendor was already paid out for this order and the Stripe transfer reversal ` +
              `of ${split.vendorClawbackPence}p failed: ${msg}. No refund was issued. ` +
              `Ask the vendor to top up their Stripe balance, or reverse the transfer manually ` +
              `in the Stripe Dashboard, then retry.`,
          });
        }
        reversal = {
          payoutId: covering.id,
          keyBase,
          attempt,
          clawbackPence: split.vendorClawbackPence,
        };
        // Persist the reversal IMMEDIATELY so a crash before the ledger commit
        // still leaves a recoverable trace, and so the async failed-refund
        // path knows a reversal exists to pay back. If this persistence write
        // itself fails, the vendor has been debited with no refund coming -
        // pay the reversal back before surfacing the failure. (A process
        // crash instead of a thrown error is covered by the same-key retry:
        // Stripe replays the original reversal, no second debit.)
        try {
          await this.prisma.auditLog.create({
            data: {
              actorId: authorisedBy.id,
              action: 'transfer_reversal_created',
              entityType: 'orders',
              entityId: dto.orderId,
              metadata: {
                payoutId: covering.id,
                stripeTransferId: covering.stripeTransferId,
                stripeReversalId,
                clawbackPence: split.vendorClawbackPence,
                reversalKeyBase: keyBase,
                attempt,
              } as Prisma.JsonObject,
            },
          });
        } catch (e) {
          await this.compensateReversalIfNeeded(
            reversal,
            order.vendor.stripeAccountId,
            dto.orderId,
          );
          throw e;
        }
      } else if (covering) {
        // Payout exists but hasn't been transferred: deduct the clawback from
        // its amount atomically inside the ledger transaction below (the batch
        // computed its amount BEFORE these refund rows existed, and future
        // batches never revisit this order's window).
        payoutToAdjust = covering.id;
      }
      // No covering payout at all → the order's window hasn't been batched
      // yet; the refund/credit rows written below are netted by that batch.
    }

    // Pass `amount` so Stripe refunds the requested amount, not the full PI.
    // Idempotency key (when provided) makes the Stripe call safe to retry.
    let stripeRefund: Stripe.Refund;
    try {
      stripeRefund = await this.stripe.refund(
        lastPi.stripePaymentIntentId,
        dto.amountPence,
        idempotencyKey,
      );
    } catch (e) {
      // Post-reversal failure path: the vendor's funds were already pulled but
      // the customer refund could not be created. Pay the clawback back to the
      // vendor (idempotent) so we never end up with a one-sided reversal, then
      // surface the original error.
      await this.compensateReversalIfNeeded(reversal, order.vendor.stripeAccountId, dto.orderId);
      throw e;
    }

    // Stripe is now the source of truth. If the DB writes below fail and the
    // caller retries with the same `idempotencyKey`, Stripe will return this
    // same refund (no double-debit) and the DB writes will succeed on retry.
    // If the caller retries WITHOUT a key - e.g. another endpoint - the
    // cumulative-refund guard above stops a duplicate refund being created.

    // Duplicate-request short-circuit: with an idempotency key, Stripe returns
    // the SAME refund object for a repeated call. If our ledger row for that
    // refund already exists (the first request completed), return it instead
    // of hitting the unique(stripeRefundId) constraint - two rapid identical
    // requests thus produce exactly one Stripe refund and one DB row.
    const existingRow = await this.prisma.payment.findUnique({
      where: { stripeRefundId: stripeRefund.id },
    });
    if (existingRow) {
      return { refund: existingRow, split, duplicate: true as const };
    }

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
    const runLedgerTx = () =>
      this.prisma.$transaction(async (tx) => {
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
            status: { not: PaymentStatus.failed },
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
        // The incremental split above was derived from the PRE-transaction
        // prior-refunds total; if another refund/chargeback landed in between,
        // that split (and any reversal already taken from it) is stale.
        if (refundedInTxPence !== alreadyRefundedPence) {
          throw new ConflictException({
            code: 'CONCURRENT_REFUND_CONFLICT',
            message: `Refund ledger changed concurrently (${alreadyRefundedPence}p -> ${refundedInTxPence}p already refunded); retry the request`,
          });
        }
        // Not-yet-transferred covering payout: deduct the clawback from its
        // amount atomically with the ledger rows. The batch computed the
        // payout amount BEFORE this refund existed and no future batch
        // revisits this order's window, so without this the vendor would be
        // paid their pre-refund share. The status guard makes this a CAS: if
        // the payout was transferred between our pre-check and here, count=0
        // and we abort - a retry then takes the transfer-reversal path.
        if (payoutToAdjust && split.vendorClawbackPence > 0) {
          const adj = await tx.payout.updateMany({
            where: {
              id: payoutToAdjust,
              status: { in: [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved] },
              amountPence: { gte: split.vendorClawbackPence },
            },
            data: {
              amountPence: { decrement: split.vendorClawbackPence },
              refundsPence: { increment: split.vendorClawbackPence },
            },
          });
          if (adj.count !== 1) {
            throw new ConflictException({
              code: 'PAYOUT_ADJUSTMENT_FAILED',
              message:
                `Pending payout ${payoutToAdjust} could not absorb the ${split.vendorClawbackPence}p ` +
                `clawback (transferred concurrently, or amount too small). No ledger rows were ` +
                `written; the Stripe refund is idempotent - retry with the same requestId.`,
            });
          }
        }
        const written = await writeOrderRefundLedger(tx, {
          order,
          alreadyRefundedPence: refundedInTxPence,
          amountPence: dto.amountPence,
          userId: authorisedBy.id,
          stripePaymentIntentId: lastPi.stripePaymentIntentId,
          stripeChargeId: typeof stripeRefund.charge === 'string' ? stripeRefund.charge : null,
          stripeRefundId: stripeRefund.id,
          failureReason:
            [opts?.reasonCode, dto.reason ?? opts?.note].filter(Boolean).join(': ') || null,
          auditAction: 'refund_issued',
          auditActorId: authorisedBy.id,
          auditMetadata: {
            reasonCode: opts?.reasonCode ?? null,
            note: opts?.note ?? null,
            idempotencyKey: idempotencyKey ?? null,
            reversalPence: reversal?.clawbackPence ?? 0,
            reversalKeyBase: reversal?.keyBase ?? null,
            reversalAttempt: reversal?.attempt ?? 0,
            reversalPayoutId: reversal?.payoutId ?? null,
            adjustedPayoutId: payoutToAdjust,
          } as Prisma.JsonObject,
        });
        return written.refund;
      });
    let refundRow: Awaited<ReturnType<typeof runLedgerTx>>;
    try {
      refundRow = await runLedgerTx();
    } catch (e) {
      // Concurrent same-requestId race: two callers share one Stripe reversal
      // and one Stripe refund (idempotency keys); both pass the pre-commit
      // duplicate check, one commits, the loser lands here on the in-tx
      // cumulative ceiling. If OUR refund's ledger row now exists, the request
      // as a whole SUCCEEDED - compensating the shared reversal would undo the
      // committed clawback and leave the vendor whole while the customer is
      // refunded. Return the committed row as a duplicate instead.
      const committed = await this.prisma.payment.findUnique({
        where: { stripeRefundId: stripeRefund.id },
      });
      if (committed) {
        return { refund: committed, split, duplicate: true as const };
      }
      // The Stripe refund exists but the ledger writes genuinely failed (e.g.
      // lost a race with a concurrent chargeback write). If a transfer
      // reversal happened, pay it back so the vendor is whole; a retry with
      // the same requestId re-attempts the whole operation.
      await this.compensateReversalIfNeeded(reversal, order.vendor.stripeAccountId, dto.orderId);
      throw e;
    }

    // Durable enqueue: NotificationsService never throws AND never drops -
    // if the queue is down the events are persisted to notification_outbox
    // and retried by the outbox drainer until they reach the queue. Money
    // moved above; both parties WILL be told, eventually.
    await Promise.all([
      this.notifications.enqueue(NotificationEvent.refund_issued_customer, {
        orderId: dto.orderId,
        customerId: order.customerId,
        amountPence: dto.amountPence,
      }),
      this.notifications.enqueue(NotificationEvent.refund_deducted_vendor, {
        orderId: dto.orderId,
        vendorId: order.vendorId,
        vendorUserId: order.vendor.userId,
        deductionPence: split.vendorClawbackPence,
      }),
    ]);

    // Founding-allowance restoration is now inside runLedgerTx() (D-002 fix).
    // It commits atomically with the refund row, credit rows, and audit log.

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
   * Admin-facing wrapper: resolves an omitted amount to the full remaining
   * refundable amount, builds a deterministic idempotency key from the
   * client-supplied requestId, and enforces the note-required-for-other rule.
   */
  async createAdminRefund(
    orderId: string,
    dto: AdminRefundDto,
    authorisedBy: { id: string; role: UserRole },
  ) {
    if (dto.reason === RefundReason.other && !dto.note?.trim()) {
      throw new BadRequestException({
        code: 'NOTE_REQUIRED',
        message: 'A note is required when reason is "other"',
      });
    }
    let amountPence = dto.amountPence;
    if (amountPence === undefined) {
      const info = await this.getOrderRefundInfo(orderId);
      amountPence = info.refundablePence;
      if (amountPence <= 0) {
        throw new BadRequestException({
          code: 'NOTHING_TO_REFUND',
          message: 'Order has already been fully refunded',
        });
      }
    }
    const idempotencyKey = dto.requestId ? `admin-refund:${orderId}:${dto.requestId}` : undefined;
    return this.createRefund(
      { orderId, amountPence, reason: dto.note?.trim() || undefined },
      authorisedBy,
      idempotencyKey,
      { reasonCode: dto.reason, note: dto.note?.trim() || undefined },
    );
  }

  /**
   * Refund state + history for the admin order view: prior refund/credit rows
   * (with actor), the remaining refundable amount, and the order economics the
   * dialog needs to preview the vendor clawback before confirming.
   */
  async getOrderRefundInfo(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        totalPence: true,
        subtotalPence: true,
        serviceFeePence: true,
        deliveryFeePence: true,
        discountPence: true,
        commissionPence: true,
      },
    });
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    const payments = await this.prisma.payment.findMany({
      where: {
        orderId,
        type: { in: [PaymentType.refund, PaymentType.partial_refund] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      },
    });
    const refundedPence = payments
      .filter((p) => p.status !== PaymentStatus.failed)
      .reduce((sum, p) => sum + -p.amountPence, 0);
    return {
      order,
      payments,
      refundedPence,
      refundablePence: Math.max(0, order.totalPence - refundedPence),
    };
  }

  /**
   * Reconcile a refund that was created OUTSIDE Feastpot (Stripe Dashboard).
   * The money has already moved, so this writes ONLY the ledger side - the
   * same refund/credit/audit rows and order-status change as createRefund,
   * with the customer as the Payment userId and a null audit actor (system).
   * Idempotent on the unique stripeRefundId.
   */
  async reconcileExternalRefund(refund: Stripe.Refund): Promise<void> {
    if (!refund.id) return;
    // A failed/cancelled external refund moved no money - never write ledger
    // rows for it (the failed-refund compensation path only handles refunds
    // that were pending/succeeded first, so a directly-failed row would leave
    // an uncompensated deduction in the payout aggregation).
    if (refund.status === 'failed' || refund.status === 'canceled') return;
    const existing = await this.prisma.payment.findUnique({
      where: { stripeRefundId: refund.id },
      select: { id: true },
    });
    if (existing) return; // ours (or already reconciled)

    const piId =
      typeof refund.payment_intent === 'string'
        ? refund.payment_intent
        : (refund.payment_intent?.id ?? null);
    const chargeId =
      typeof refund.charge === 'string' ? refund.charge : (refund.charge?.id ?? null);
    const matchers: Prisma.PaymentWhereInput[] = [];
    if (piId) matchers.push({ stripePaymentIntentId: piId });
    if (chargeId) matchers.push({ stripeChargeId: chargeId });
    const anchor = matchers.length
      ? await this.prisma.payment.findFirst({
          where: { OR: matchers },
          orderBy: { createdAt: 'asc' },
          select: { orderId: true },
        })
      : null;
    if (!anchor?.orderId) {
      this.logger.error(
        `External Stripe refund ${refund.id} has no matching order - manual reconciliation required`,
      );
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: anchor.orderId },
      select: {
        id: true,
        customerId: true,
        vendorId: true,
        status: true,
        totalPence: true,
        subtotalPence: true,
        serviceFeePence: true,
        deliveryFeePence: true,
        discountPence: true,
        commissionPence: true,
        foundingAllowanceAppliedPence: true,
        deliveredAt: true,
        vendor: { select: { userId: true } },
      },
    });
    if (!order) return;

    // Locate the payout covering this order's earnings (same model as
    // createRefund): batch payouts are vendor-period rows with orderId=null.
    // If one exists, the ledger rows written below will never be netted by a
    // future batch, so the clawback must be settled against the payout itself.
    const periodMatch: Prisma.PayoutWhereInput[] = [{ orderId: order.id }];
    if (order.deliveredAt) {
      periodMatch.push({
        vendorId: order.vendorId,
        orderId: null,
        periodStart: { lte: order.deliveredAt },
        periodEnd: { gt: order.deliveredAt },
      });
    }
    const coveringPayout = await this.prisma.payout.findFirst({
      where: {
        status: {
          in: [
            PayoutStatus.draft,
            PayoutStatus.held,
            PayoutStatus.approved,
            PayoutStatus.transferred,
          ],
        },
        OR: periodMatch,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, stripeTransferId: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;
      // Idempotency inside the lock: a concurrent worker may have written it.
      const dupe = await tx.payment.findUnique({
        where: { stripeRefundId: refund.id },
        select: { id: true },
      });
      if (dupe) return null;

      // Cap at what is still refundable, mirroring the chargeback path.
      const prior = await tx.payment.aggregate({
        where: {
          orderId: order.id,
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
          status: { not: PaymentStatus.failed },
        },
        _sum: { amountPence: true },
      });
      const alreadyRefundedPence = -(prior._sum.amountPence ?? 0);
      const amountPence = Math.min(
        refund.amount,
        Math.max(0, order.totalPence - alreadyRefundedPence),
      );
      if (amountPence <= 0) return null;

      // Cumulative, matching the admin path: a Dashboard refund that brings
      // total refunds to the order total is a full refund for all side effects.
      const isPartial = alreadyRefundedPence + amountPence < order.totalPence;
      // Incremental against prior refunds - same over-clawback guard as the
      // admin path: a sequence of partials can never claw more than earnings.
      const split = computeIncrementalRefundSplit(
        alreadyRefundedPence,
        amountPence,
        {
          subtotalPence: order.subtotalPence,
          serviceFeePence: order.serviceFeePence,
          deliveryFeePence: order.deliveryFeePence,
          discountPence: order.discountPence,
          commissionPence: order.commissionPence,
        },
        order.totalPence,
      );

      const row = await tx.payment.create({
        data: {
          orderId: order.id,
          userId: order.customerId,
          type: isPartial ? PaymentType.partial_refund : PaymentType.refund,
          status:
            refund.status === 'failed' || refund.status === 'canceled'
              ? PaymentStatus.failed
              : refund.status === 'succeeded'
                ? PaymentStatus.succeeded
                : PaymentStatus.pending,
          amountPence: -amountPence,
          currency: 'GBP',
          stripePaymentIntentId: piId,
          stripeChargeId: chargeId,
          stripeRefundId: refund.id,
          failureReason: 'external: refund issued directly in the Stripe Dashboard',
          processedAt: new Date(),
        },
      });
      if (split.feastpotAbsorbedPence > 0) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            userId: order.customerId,
            type: PaymentType.credit,
            status: PaymentStatus.succeeded,
            amountPence: split.feastpotAbsorbedPence,
            currency: 'GBP',
            failureReason: `external_refund_absorbed: Feastpot service-fee + commission share on refund ${row.id}`,
            processedAt: new Date(),
          },
        });
      }
      const TERMINAL: OrderStatus[] = [
        OrderStatus.delivered,
        OrderStatus.cancelled,
        OrderStatus.rejected,
        OrderStatus.refunded,
        OrderStatus.partially_refunded,
      ];
      // Cumulative: partials summing to the total leave the order refunded.
      const cumulativelyFull = alreadyRefundedPence + amountPence >= order.totalPence;
      const newStatus = cumulativelyFull
        ? OrderStatus.refunded
        : TERMINAL.includes(order.status)
          ? OrderStatus.partially_refunded
          : null;
      if (newStatus && newStatus !== order.status) {
        await tx.order.update({ where: { id: order.id }, data: { status: newStatus } });
      }
      // Settle the clawback against a NOT-yet-transferred covering payout
      // atomically with the ledger rows. CAS on status: if the payout was
      // transferred concurrently, fall through to the debt path below rather
      // than aborting (the customer's money already left via the Dashboard).
      let settlement: 'adjusted' | 'reverse' | 'debt' | null = null;
      if (coveringPayout && split.vendorClawbackPence > 0) {
        if (coveringPayout.status === PayoutStatus.transferred) {
          settlement = coveringPayout.stripeTransferId ? 'reverse' : 'debt';
        } else {
          const adj = await tx.payout.updateMany({
            where: {
              id: coveringPayout.id,
              status: { in: [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved] },
              amountPence: { gte: split.vendorClawbackPence },
            },
            data: {
              amountPence: { decrement: split.vendorClawbackPence },
              refundsPence: { increment: split.vendorClawbackPence },
            },
          });
          settlement = adj.count === 1 ? 'adjusted' : 'debt';
        }
      }
      const auditMetadata = {
        stripeRefundId: refund.id,
        customerRefundPence: amountPence,
        vendorClawbackPence: split.vendorClawbackPence,
        feastpotAbsorbedPence: split.feastpotAbsorbedPence,
        commissionRefundedPence: split.commissionRefundedPence,
        partial: isPartial,
        refundPaymentId: row.id,
        previousOrderStatus: order.status,
        allowanceRestoredPence: 0,
        settlement,
        settlementPayoutId: coveringPayout?.id ?? null,
        adjustedPayoutId: settlement === 'adjusted' ? (coveringPayout?.id ?? null) : null,
        // Filled post-tx if the reversal succeeds (compensateFailedRefund
        // reads these to pay a reversal back on async failure).
        reversalPence: 0,
        reversalKeyBase: null,
        reversalAttempt: 0,
        reversalPayoutId: null,
      } as Prisma.JsonObject;
      const auditRow = await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'refund_reconciled_external',
          entityType: 'orders',
          entityId: order.id,
          metadata: auditMetadata,
        },
      });
      return { amountPence, split, isPartial, settlement, auditLogId: auditRow.id, auditMetadata };
    });

    if (!result) return;
    this.logger.warn(
      `External Stripe refund ${refund.id} reconciled: order ${order.id}, ` +
        `${result.amountPence}p, vendor clawback ${result.split.vendorClawbackPence}p`,
    );

    // Post-commit settlement against an already-transferred payout: claw the
    // vendor share back via a Stripe transfer reversal. The customer's money
    // already left via the Dashboard, so a failed reversal must NOT undo the
    // reconciliation - it becomes explicit operational debt instead.
    if (result.settlement === 'reverse' && coveringPayout?.stripeTransferId) {
      const keyBase = `reversal:ext:${refund.id}`;
      try {
        const rev = await this.stripe.createTransferReversal({
          transferId: coveringPayout.stripeTransferId,
          amountPence: result.split.vendorClawbackPence,
          idempotencyKey: keyBase,
        });
        await Promise.all([
          this.prisma.auditLog.create({
            data: {
              actorId: null,
              action: 'transfer_reversal_created',
              entityType: 'orders',
              entityId: order.id,
              metadata: {
                payoutId: coveringPayout.id,
                stripeTransferId: coveringPayout.stripeTransferId,
                stripeReversalId: rev.id,
                clawbackPence: result.split.vendorClawbackPence,
                reversalKeyBase: keyBase,
                attempt: 0,
              } as Prisma.JsonObject,
            },
          }),
          // Backfill the reconciliation audit metadata so the async
          // failed-refund path can pay this reversal back if needed.
          this.prisma.auditLog
            .update({
              where: { id: result.auditLogId },
              data: {
                metadata: {
                  ...result.auditMetadata,
                  reversalPence: result.split.vendorClawbackPence,
                  reversalKeyBase: keyBase,
                  reversalAttempt: 0,
                  reversalPayoutId: coveringPayout.id,
                } as Prisma.JsonObject,
              },
            })
            .catch(() => undefined),
        ]);
      } catch (e) {
        await this.recordClawbackDebt(
          order.id,
          coveringPayout.id,
          result.split.vendorClawbackPence,
          refund.id,
          `transfer reversal failed: ${String(e)}`,
        );
      }
    } else if (result.settlement === 'debt') {
      await this.recordClawbackDebt(
        order.id,
        coveringPayout?.id ?? null,
        result.split.vendorClawbackPence,
        refund.id,
        'covering payout could not absorb the clawback',
      );
    }
    await Promise.all([
      this.notifications.enqueue(NotificationEvent.refund_issued_customer, {
        orderId: order.id,
        customerId: order.customerId,
        amountPence: result.amountPence,
      }),
      this.notifications.enqueue(NotificationEvent.refund_deducted_vendor, {
        orderId: order.id,
        vendorId: order.vendorId,
        vendorUserId: order.vendor.userId,
        deductionPence: result.split.vendorClawbackPence,
      }),
    ]);
  }

  /**
   * Undo a refund's ledger side effects after Stripe reports it FAILED
   * (`refund.updated` with status=failed): the customer's money never moved,
   * so the vendor must not stay clawed back and Feastpot must not keep the
   * commission reversed. Writes one compensating credit row so the refund
   * group nets to zero in the payout batch's status-agnostic aggregation,
   * restores the pre-refund order status, and re-burns any founding allowance
   * that was restored. Idempotent via a CAS on the Payment row's status.
   *
   * Returns compensation detail for the caller to alert on, or null when the
   * refund was already compensated / is not ours.
   */
  async compensateFailedRefund(stripeRefundId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripeRefundId },
      select: {
        id: true,
        orderId: true,
        cateringBookingId: true,
        amountPence: true,
        userId: true,
        stripeRefundId: true,
      },
    });
    if (!payment) return null;
    if (payment.cateringBookingId) {
      return this.compensateFailedCateringRefund({
        ...payment,
        cateringBookingId: payment.cateringBookingId,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.orderId}))`;
      // CAS: only the first worker to move the row to failed compensates.
      const cas = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.failed } },
        data: { status: PaymentStatus.failed, processedAt: new Date() },
      });
      if (cas.count !== 1) return null;

      // The payout batch aggregates refund + credit rows regardless of
      // PaymentStatus, so simply marking the refund row failed is not enough -
      // its -X would still be deducted from the vendor. Write ONE compensating
      // credit of +vendorClawback (= refund amount − Feastpot-absorbed credits)
      // so the whole group nets to exactly zero:
      //   refund(-X) + absorbed credits(+A) + compensation(+(X−A)) = 0.
      const credits = await tx.payment.findMany({
        where: {
          orderId: payment.orderId,
          type: PaymentType.credit,
          amountPence: { gt: 0 },
          failureReason: { contains: `refund ${payment.id}` },
        },
        select: { id: true, amountPence: true, userId: true },
      });
      const absorbedPence = credits.reduce((s, c) => s + c.amountPence, 0);
      const compensationPence = -payment.amountPence - absorbedPence; // vendor clawback share
      if (compensationPence > 0) {
        await tx.payment.create({
          data: {
            orderId: payment.orderId,
            userId: credits[0]?.userId ?? payment.userId,
            type: PaymentType.credit,
            status: PaymentStatus.succeeded,
            amountPence: compensationPence,
            currency: 'GBP',
            failureReason: `refund_failed_reversal: compensates vendor clawback for failed refund ${payment.id}`,
            processedAt: new Date(),
          },
        });
      }

      // Recover the refund-time context from the audit row.
      const audit = await tx.auditLog.findFirst({
        where: {
          entityType: 'orders',
          entityId: payment.orderId,
          action: { in: ['refund_issued', 'refund_reconciled_external'] },
          metadata: { path: ['refundPaymentId'], equals: payment.id },
        },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      });
      const meta = (audit?.metadata ?? {}) as {
        previousOrderStatus?: string;
        allowanceRestoredPence?: number;
        reversalPence?: number;
        reversalKeyBase?: string | null;
        reversalAttempt?: number;
        reversalPayoutId?: string | null;
        adjustedPayoutId?: string | null;
      };

      // If the refund deducted its clawback from a not-yet-transferred payout,
      // put the amount back (CAS on status: never touch a transferred payout).
      if (meta.adjustedPayoutId && compensationPence > 0) {
        await tx.payout.updateMany({
          where: {
            id: meta.adjustedPayoutId,
            status: { in: [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved] },
          },
          data: {
            amountPence: { increment: compensationPence },
            refundsPence: { decrement: compensationPence },
          },
        });
      }

      // Restore the pre-refund order status - CAS so we only undo OUR change.
      const prev = meta.previousOrderStatus as OrderStatus | undefined;
      if (prev) {
        await tx.order.updateMany({
          where: {
            id: payment.orderId!,
            status: { in: [OrderStatus.refunded, OrderStatus.partially_refunded] },
          },
          data: { status: prev },
        });
      }

      // Re-burn the founding allowance that was restored on refund issue.
      const allowancePence = meta.allowanceRestoredPence ?? 0;
      if (allowancePence > 0) {
        const order = await tx.order.findUnique({
          where: { id: payment.orderId! },
          select: { vendorId: true },
        });
        if (order) {
          await tx.vendor.update({
            where: { id: order.vendorId },
            data: { foundingAllowanceUsedPence: { increment: allowancePence } },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'refund_failed_compensated',
          entityType: 'orders',
          entityId: payment.orderId,
          metadata: {
            stripeRefundId,
            refundPaymentId: payment.id,
            refundAmountPence: -payment.amountPence,
            absorbedCreditsPence: absorbedPence,
            compensationCreditPence: Math.max(0, compensationPence),
            orderStatusRestoredTo: prev ?? null,
            allowanceReburnedPence: allowancePence,
          } as Prisma.JsonObject,
        },
      });

      return {
        orderId: payment.orderId,
        refundAmountPence: -payment.amountPence,
        compensationCreditPence: Math.max(0, compensationPence),
        reversalPence: meta.reversalPence ?? 0,
        reversalKeyBase: meta.reversalKeyBase ?? null,
        reversalAttempt: meta.reversalAttempt ?? 0,
        reversalPayoutId: meta.reversalPayoutId ?? null,
      };
    });

    // Post-tx: if the refund had clawed the vendor via a Stripe transfer
    // reversal, that money must go back to the connected account - the ledger
    // credit above only fixes Feastpot's books, not the vendor's balance.
    // Idempotent per (keyBase, attempt); recording the compensation also bumps
    // the attempt counter so a NEW refund retry pulls funds again.
    if (result) {
      let reversal =
        result.reversalPence > 0
          ? {
              payoutId: result.reversalPayoutId ?? 'unknown',
              keyBase: result.reversalKeyBase,
              attempt: result.reversalAttempt,
              clawbackPence: result.reversalPence,
            }
          : null;
      // Fallback: the reconciliation metadata backfill for external refunds is
      // best-effort, so recover reversal context from the standalone
      // `transfer_reversal_created` record (written at reversal time under a
      // deterministic key derived from the Stripe refund id).
      if (!reversal) {
        const extKeyBase = `reversal:ext:${stripeRefundId}`;
        const created = await this.prisma.auditLog.findFirst({
          where: {
            action: 'transfer_reversal_created',
            metadata: { path: ['reversalKeyBase'], equals: extKeyBase },
          },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        });
        const m = (created?.metadata ?? null) as {
          payoutId?: string;
          clawbackPence?: number;
          attempt?: number;
        } | null;
        if (m?.clawbackPence && m.clawbackPence > 0) {
          reversal = {
            payoutId: m.payoutId ?? 'unknown',
            keyBase: extKeyBase,
            attempt: m.attempt ?? 0,
            clawbackPence: m.clawbackPence,
          };
        }
      }
      if (reversal) {
        const order = await this.prisma.order.findUnique({
          where: { id: result.orderId! },
          select: { vendor: { select: { stripeAccountId: true } } },
        });
        await this.compensateReversalIfNeeded(
          reversal,
          order?.vendor.stripeAccountId ?? null,
          result.orderId!,
        );
      }
    }
    return result;
  }

  private async compensateFailedCateringRefund(payment: {
    id: string;
    cateringBookingId: string;
    amountPence: number;
    userId: string | null;
    stripeRefundId: string | null;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catering:${payment.cateringBookingId}`}))`;
      const cas = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.failed } },
        data: { status: PaymentStatus.failed, processedAt: new Date() },
      });
      if (cas.count !== 1) {
        const pendingOperation = payment.stripeRefundId
          ? await tx.refundOperation.findUnique({
              where: { stripeRefundId: payment.stripeRefundId },
            })
          : null;
        return pendingOperation?.reversalStatus === 'compensation_pending'
          ? { operation: pendingOperation, compensationPence: 0, retryOnly: true }
          : null;
      }
      const credits = await tx.payment.findMany({
        where: {
          cateringBookingId: payment.cateringBookingId,
          type: PaymentType.credit,
          failureReason: { contains: `refund ${payment.id}` },
        },
      });
      const compensationPence =
        -payment.amountPence - credits.reduce((sum, credit) => sum + credit.amountPence, 0);
      if (compensationPence > 0) {
        await tx.payment.create({
          data: {
            cateringBookingId: payment.cateringBookingId,
            userId: payment.userId,
            type: PaymentType.credit,
            status: PaymentStatus.succeeded,
            amountPence: compensationPence,
            currency: 'GBP',
            failureReason: `refund_failed_reversal: compensates vendor clawback for failed refund ${payment.id}`,
            processedAt: new Date(),
          },
        });
      }
      const operation = payment.stripeRefundId
        ? await tx.refundOperation.findUnique({ where: { stripeRefundId: payment.stripeRefundId } })
        : null;
      const matchedOperation =
        operation ??
        (await tx.refundOperation.findFirst({
          where: { cateringBookingId: payment.cateringBookingId, stripeRefundId: { not: null } },
          orderBy: { createdAt: 'desc' },
        }));
      if (
        matchedOperation?.reversalStatus === 'payout_adjusted' &&
        matchedOperation.reversalPayoutId
      ) {
        await tx.payout.updateMany({
          where: {
            id: matchedOperation.reversalPayoutId,
            status: { in: [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved] },
          },
          data: {
            amountPence: { increment: matchedOperation.reversalAmountPence ?? compensationPence },
            refundsPence: { decrement: matchedOperation.reversalAmountPence ?? compensationPence },
          },
        });
      }
      if (matchedOperation) {
        if (matchedOperation.cancelBooking) {
          const booking = await tx.cateringBooking.findUnique({
            where: { id: payment.cateringBookingId },
            select: { depositPaidAt: true, balancePaidAt: true },
          });
          if (booking) {
            await tx.cateringBooking.update({
              where: { id: payment.cateringBookingId },
              data: {
                status: booking.balancePaidAt
                  ? CateringBookingStatus.BALANCE_PAID
                  : booking.depositPaidAt
                    ? CateringBookingStatus.CONFIRMED
                    : CateringBookingStatus.QUOTED,
                cancelledAt: null,
                cancellationReason: null,
              },
            });
          }
        }
        const needsTransferCompensation =
          matchedOperation.reversalStatus === 'succeeded' &&
          (matchedOperation.reversalAmountPence ?? 0) > 0;
        await tx.refundOperation.update({
          where: { id: matchedOperation.id },
          data: {
            status: needsTransferCompensation ? 'compensation_pending' : 'pending',
            failureReason: 'Stripe refund failed asynchronously',
            reversalStatus: needsTransferCompensation ? 'compensation_pending' : null,
            ...(needsTransferCompensation
              ? {}
              : {
                  stripeRefundId: null,
                  attempt: { increment: 1 },
                  reversalPayoutId: null,
                  reversalTransferId: null,
                  reversalAmountPence: null,
                  reversalIdempotencyKey: null,
                }),
          },
        });
      }
      return { operation: matchedOperation, compensationPence, retryOnly: false };
    });
    if (!result) return null;
    if (result.operation?.reversalStatus === 'succeeded' && result.operation.reversalAmountPence) {
      const booking = await this.prisma.cateringBooking.findUnique({
        where: { id: payment.cateringBookingId },
        select: { vendor: { select: { stripeAccountId: true } } },
      });
      if (booking?.vendor.stripeAccountId) {
        await this.stripe.createTransfer({
          amountPence: result.operation.reversalAmountPence,
          destinationAccountId: booking.vendor.stripeAccountId,
          payoutId: result.operation.reversalPayoutId ?? result.operation.id,
          idempotencyKey: `catering-reversal-comp:${result.operation.idempotencyKey}:attempt:${result.operation.attempt}`,
        });
        await this.resetFailedCateringOperation(result.operation.id);
      }
    }
    return {
      orderId: payment.cateringBookingId,
      refundAmountPence: -payment.amountPence,
      compensationCreditPence: result.compensationPence,
    };
  }

  private async resetFailedCateringOperation(operationId: string): Promise<void> {
    await this.prisma.refundOperation.update({
      where: { id: operationId },
      data: {
        status: 'pending',
        failureReason: null,
        stripeRefundId: null,
        attempt: { increment: 1 },
        reversalPayoutId: null,
        reversalTransferId: null,
        reversalAmountPence: null,
        reversalIdempotencyKey: null,
        reversalStatus: null,
        completedAt: null,
      },
    });
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

  /**
   * Undo a transfer reversal after a post-reversal failure: the vendor's funds
   * were pulled back but the customer refund could not be completed, so the
   * clawback must be returned. Idempotent (deterministic key derived from the
   * refund attempt's key) and best-effort: if the compensating transfer itself
   * fails, log + Sentry loudly - the original error still propagates and a
   * retry with the same requestId re-runs the whole operation safely.
   */
  /**
   * Explicit operational-debt trail for a vendor clawback that could not be
   * collected automatically (transfer reversal failed, or a covering payout
   * could not absorb it). The reconciliation itself stands - the customer's
   * money already moved - so finance must recover this amount manually.
   */
  private async recordClawbackDebt(
    orderId: string,
    payoutId: string | null,
    clawbackPence: number,
    stripeRefundId: string,
    reason: string,
  ): Promise<void> {
    this.logger.error(
      `VENDOR CLAWBACK DEBT: ${clawbackPence}p owed on order ${orderId} ` +
        `(payout ${payoutId ?? 'unknown'}, refund ${stripeRefundId}) - ${reason}. ` +
        `Manual recovery required.`,
    );
    await this.prisma.auditLog
      .create({
        data: {
          actorId: null,
          action: 'vendor_clawback_debt',
          entityType: 'orders',
          entityId: orderId,
          metadata: {
            payoutId,
            clawbackPence,
            stripeRefundId,
            reason,
          } as Prisma.JsonObject,
        },
      })
      .catch((e: unknown) =>
        this.logger.error(`failed to write vendor_clawback_debt audit row: ${String(e)}`),
      );
  }

  private async compensateReversalIfNeeded(
    reversal: {
      payoutId: string;
      keyBase: string | null;
      attempt: number;
      clawbackPence: number;
    } | null,
    vendorStripeAccountId: string | null,
    orderId: string,
  ): Promise<void> {
    if (!reversal || reversal.clawbackPence <= 0) return;
    // Exactly-once per (keyBase, attempt): a compensated audit row already
    // written for this attempt means the payback happened (e.g. the sync path
    // ran before an async webhook retried the same failure).
    if (reversal.keyBase) {
      const already = await this.prisma.auditLog.findFirst({
        where: {
          action: 'transfer_reversal_compensated',
          metadata: { path: ['reversalKeyBase'], equals: reversal.keyBase },
          AND: [{ metadata: { path: ['attempt'], equals: reversal.attempt } }],
        },
        select: { id: true },
      });
      if (already) return;
    }
    if (!vendorStripeAccountId) {
      this.logger.error(
        `Reversal compensation needed for order ${orderId} but vendor has no Stripe account id - manual repair required (payout ${reversal.payoutId}, ${reversal.clawbackPence}p)`,
      );
      return;
    }
    try {
      await this.stripe.createTransfer({
        amountPence: reversal.clawbackPence,
        destinationAccountId: vendorStripeAccountId,
        payoutId: reversal.payoutId,
        // Attempt-scoped: a NEW attempt's compensation must not be swallowed
        // by Stripe idempotency from a previous attempt's payback.
        idempotencyKey: reversal.keyBase
          ? `comp:${reversal.keyBase}:${reversal.attempt}`
          : undefined,
      });
      // Recording the compensation bumps the attempt counter, so a retry of
      // the refund creates a genuinely new reversal instead of Stripe
      // replaying the original one (which would leave the vendor whole while
      // the customer gets refunded).
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'transfer_reversal_compensated',
          entityType: 'orders',
          entityId: orderId,
          metadata: {
            payoutId: reversal.payoutId,
            clawbackPence: reversal.clawbackPence,
            reversalKeyBase: reversal.keyBase,
            attempt: reversal.attempt,
          } as Prisma.JsonObject,
        },
      });
      this.logger.warn(
        `Compensated ${reversal.clawbackPence}p transfer reversal for order ${orderId} after refund failure`,
      );
    } catch (e) {
      this.logger.error(
        `FAILED to compensate ${reversal.clawbackPence}p transfer reversal for order ${orderId} (payout ${reversal.payoutId}): ${String(e)} - vendor is owed this amount, manual repair required`,
      );
    }
  }

  // -------------------- catering shared ledger --------------------

  /**
   * Records a succeeded catering collection in the same Payment ledger as
   * order captures. It is deliberately idempotent because both the return URL
   * and Stripe webhook may observe the same PaymentIntent.
   */
  async recordCateringCapture(args: {
    bookingId: string;
    paymentIntentId: string;
    amountPence: number;
    customerId: string | null;
    kind: 'deposit' | 'balance';
  }) {
    const pi = await this.stripe.retrieve(args.paymentIntentId);
    if (pi.status !== 'succeeded' || pi.amount !== args.amountPence) {
      throw new BadRequestException('Catering payment intent is not the expected succeeded amount');
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catering:${args.bookingId}`}))`;
      const booking = await tx.cateringBooking.findUnique({
        where: { id: args.bookingId },
        select: { status: true, cancellationReason: true },
      });
      if (!booking) throw new NotFoundException('Catering booking not found');
      const existing = await tx.payment.findFirst({
        where: {
          cateringBookingId: args.bookingId,
          stripePaymentIntentId: args.paymentIntentId,
          type: PaymentType.capture,
        },
      });
      const now = new Date();
      // The booking transition and capture row commit together. A webhook and
      // return URL race on the same lock and converge on this single result.
      if (existing) return { payment: existing, refundCancelledCapture: false };
      const cancelledBeforeCapture = booking.status === CateringBookingStatus.CANCELLED;
      if (!cancelledBeforeCapture) {
        const transition = await tx.cateringBooking.updateMany({
          where: {
            id: args.bookingId,
            ...(args.kind === 'deposit'
              ? {
                  status: {
                    in: [CateringBookingStatus.QUOTED, CateringBookingStatus.DEPOSIT_PAID],
                  },
                }
              : { status: CateringBookingStatus.CONFIRMED }),
          },
          data:
            args.kind === 'deposit'
              ? { status: CateringBookingStatus.CONFIRMED, depositPaidAt: now }
              : { status: CateringBookingStatus.BALANCE_PAID, balancePaidAt: now },
        });
        if (transition.count !== 1) {
          throw new ConflictException(
            'Catering booking changed before the succeeded payment could be recorded',
          );
        }
      }
      const payment = await tx.payment.create({
        data: {
          cateringBookingId: args.bookingId,
          userId: args.customerId,
          type: PaymentType.capture,
          status: PaymentStatus.succeeded,
          amountPence: args.amountPence,
          currency: 'GBP',
          stripePaymentIntentId: pi.id,
          stripeChargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
          processedAt: now,
        },
      });
      return {
        payment,
        refundCancelledCapture: cancelledBeforeCapture,
        cancellationReason: booking.cancellationReason,
      };
    });
    if (outcome.refundCancelledCapture) {
      await this.createCateringRefund({
        bookingId: args.bookingId,
        paymentIntentId: args.paymentIntentId,
        amountPence: args.amountPence,
        idempotencyKey: `catering_cancelled_capture_refund:${args.paymentIntentId}`,
        actorId: null,
        cancelBooking: true,
        cancellationReason: outcome.cancellationReason ?? null,
      });
    }
    return outcome.payment;
  }

  async cancelUnpaidCateringBooking(args: {
    bookingId: string;
    cancellationReason: string | null;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catering:${args.bookingId}`}))`;
      const booking = await tx.cateringBooking.findUnique({
        where: { id: args.bookingId },
        select: { status: true, depositPaidAt: true },
      });
      if (!booking || booking.depositPaidAt) return false;
      const cancelled = await tx.cateringBooking.updateMany({
        where: {
          id: args.bookingId,
          status: booking.status,
          depositPaidAt: null,
        },
        data: {
          status: CateringBookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: args.cancellationReason,
        },
      });
      return cancelled.count === 1;
    });
  }

  /**
   * Refund one catering PaymentIntent through the common payment ledger. The
   * operation row is the durable intent-before-Stripe boundary. A retry with
   * its deterministic key reuses Stripe's refund and only completes the
   * missing local transaction.
   */
  async createCateringRefund(args: {
    bookingId: string;
    paymentIntentId: string;
    amountPence: number;
    idempotencyKey: string;
    actorId: string | null;
    cancelBooking?: boolean;
    cancellationReason?: string | null;
    /** Stripe webhook/reconciliation supplies an already-created refund. */
    stripeRefund?: Stripe.Refund;
  }) {
    if (!Number.isInteger(args.amountPence) || args.amountPence <= 0) {
      throw new BadRequestException('Refund amount must be a positive integer number of pence');
    }
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: args.bookingId },
      select: {
        id: true,
        customerId: true,
        totalPence: true,
        commissionPence: true,
        completedAt: true,
        vendorId: true,
        vendor: { select: { stripeAccountId: true } },
      },
    });
    if (!booking) throw new NotFoundException('Catering booking not found');

    let operation = await this.prisma.refundOperation.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (operation && operation.cateringBookingId !== args.bookingId) {
      throw new ConflictException('Refund idempotency key belongs to another payment subject');
    }
    if (!operation) {
      try {
        operation = await this.prisma.refundOperation.create({
          data: {
            cateringBookingId: args.bookingId,
            paymentIntentId: args.paymentIntentId,
            amountPence: args.amountPence,
            idempotencyKey: args.idempotencyKey,
            cancelBooking: args.cancelBooking ?? false,
            cancellationReason: args.cancellationReason ?? null,
          },
        });
      } catch {
        operation = await this.prisma.refundOperation.findUnique({
          where: { idempotencyKey: args.idempotencyKey },
        });
      }
    }
    if (!operation) throw new ConflictException('Could not establish durable refund operation');
    if (
      operation.paymentIntentId !== args.paymentIntentId ||
      operation.amountPence !== args.amountPence
    ) {
      throw new ConflictException('Refund idempotency key was reused with different details');
    }
    const cancelBooking = args.cancelBooking ?? operation.cancelBooking;
    const cancellationReason = args.cancellationReason ?? operation.cancellationReason;
    if (operation.status === 'completed' && operation.stripeRefundId) {
      const refund = await this.prisma.payment.findUnique({
        where: { stripeRefundId: operation.stripeRefundId },
      });
      if (refund) return { refund, duplicate: true as const };
    }

    // A completed catering booking may already be in a weekly payout. Mirror
    // ordinary-order settlement: adjust an untransferred batch in the ledger,
    // or pull the vendor share back before refunding the customer.
    const settlement = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catering:${args.bookingId}`}))`;
      if (booking.completedAt) {
        const periodEnd = new Date(booking.completedAt);
        const daysToMonday = (8 - periodEnd.getUTCDay()) % 7 || 7;
        periodEnd.setUTCDate(periodEnd.getUTCDate() + daysToMonday);
        periodEnd.setUTCHours(0, 0, 0, 0);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${booking.vendorId}:${periodEnd.toISOString()}`}))`;
      }
      const prior = await tx.payment.aggregate({
        where: {
          cateringBookingId: args.bookingId,
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
          status: { not: PaymentStatus.failed },
        },
        _sum: { amountPence: true },
      });
      const split = computeIncrementalRefundSplit(
        -(prior._sum.amountPence ?? 0),
        args.amountPence,
        {
          subtotalPence: booking.totalPence,
          serviceFeePence: 0,
          deliveryFeePence: 0,
          discountPence: 0,
          commissionPence: booking.commissionPence,
        },
        booking.totalPence,
      );
      const covering = booking.completedAt
        ? await tx.payout.findFirst({
            where: {
              vendorId: booking.vendorId,
              orderId: null,
              periodStart: { lte: booking.completedAt },
              periodEnd: { gt: booking.completedAt },
              status: {
                in: [
                  PayoutStatus.draft,
                  PayoutStatus.held,
                  PayoutStatus.approved,
                  PayoutStatus.processing,
                  PayoutStatus.transferred,
                ],
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;
      if (covering?.status === PayoutStatus.transferred) {
        if (!covering.stripeTransferId) {
          throw new ConflictException('Transferred catering payout has no Stripe transfer id');
        }
        const key = `catering-reversal:${args.idempotencyKey}:attempt:${operation.attempt}`;
        const reversalAlreadySucceeded =
          operation.reversalStatus === 'succeeded' && operation.reversalIdempotencyKey === key;
        await tx.refundOperation.update({
          where: { id: operation.id },
          data: {
            reversalPayoutId: covering.id,
            reversalTransferId: covering.stripeTransferId,
            reversalAmountPence: split.vendorClawbackPence,
            reversalIdempotencyKey: key,
            reversalStatus: reversalAlreadySucceeded ? 'succeeded' : 'pending',
          },
        });
        return {
          payoutToAdjust: null,
          reversal: {
            payoutId: covering.id,
            transferId: covering.stripeTransferId,
            amountPence: split.vendorClawbackPence,
            key,
            alreadySucceeded: reversalAlreadySucceeded,
          },
        };
      }
      if (covering?.status === PayoutStatus.processing) {
        throw new ConflictException(
          'Vendor payout transfer is in progress; retry the refund with the same request key',
        );
      }
      if (covering) {
        await tx.refundOperation.update({
          where: { id: operation.id },
          data: {
            reversalPayoutId: covering.id,
            reversalAmountPence: split.vendorClawbackPence,
            reversalStatus: 'payout_adjustment_pending',
          },
        });
      }
      return { payoutToAdjust: covering?.id ?? null, reversal: null };
    });
    let payoutToAdjust = settlement.payoutToAdjust;
    const reversal = settlement.reversal;
    if (reversal && reversal.amountPence > 0 && !reversal.alreadySucceeded) {
      await this.stripe.createTransferReversal({
        transferId: reversal.transferId,
        amountPence: reversal.amountPence,
        idempotencyKey: reversal.key,
      });
      await this.prisma.refundOperation.update({
        where: { id: operation.id },
        data: { reversalStatus: 'succeeded' },
      });
    }
    let stripeRefund: Stripe.Refund;
    try {
      stripeRefund =
        args.stripeRefund ??
        (await this.stripe.refund(
          args.paymentIntentId,
          args.amountPence,
          `${args.idempotencyKey}:attempt:${operation.attempt}`,
        ));
    } catch (error) {
      if (reversal && booking.vendor.stripeAccountId) {
        await this.prisma.refundOperation.update({
          where: { id: operation.id },
          data: { reversalStatus: 'compensation_pending' },
        });
        try {
          await this.stripe.createTransfer({
            amountPence: reversal.amountPence,
            destinationAccountId: booking.vendor.stripeAccountId,
            payoutId: reversal.payoutId,
            idempotencyKey: `catering-reversal-comp:${args.idempotencyKey}:attempt:${operation.attempt}`,
          });
          await this.resetFailedCateringOperation(operation.id);
        } catch (compensationError) {
          this.logger.error(
            `Catering reversal compensation pending for operation ${operation.id}: ${String(compensationError)}`,
          );
        }
      }
      throw error;
    }
    // Persist this immediately, before the multi-row ledger transaction. If
    // that transaction fails after Stripe success, the pending operation is a
    // visible/reconcilable repair item rather than a silent discrepancy.
    await this.prisma.refundOperation.update({
      where: { id: operation.id },
      data: { stripeRefundId: stripeRefund.id, status: 'stripe_succeeded' },
    });

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catering:${args.bookingId}`}))`;
      if (booking.completedAt) {
        const periodEnd = new Date(booking.completedAt);
        const daysToMonday = (8 - periodEnd.getUTCDay()) % 7 || 7;
        periodEnd.setUTCDate(periodEnd.getUTCDate() + daysToMonday);
        periodEnd.setUTCHours(0, 0, 0, 0);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${booking.vendorId}:${periodEnd.toISOString()}`}))`;
        if (!payoutToAdjust && !reversal) {
          const latePayout = await tx.payout.findFirst({
            where: {
              vendorId: booking.vendorId,
              orderId: null,
              periodStart: { lte: booking.completedAt },
              periodEnd: { gt: booking.completedAt },
              status: { in: [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved] },
            },
            select: { id: true },
          });
          payoutToAdjust = latePayout?.id ?? null;
        }
      }
      const already = await tx.payment.aggregate({
        where: {
          cateringBookingId: args.bookingId,
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
          status: { not: PaymentStatus.failed },
        },
        _sum: { amountPence: true },
      });
      const alreadyRefundedPence = -(already._sum.amountPence ?? 0);
      if (alreadyRefundedPence + args.amountPence > booking.totalPence) {
        throw new BadRequestException('CUMULATIVE_REFUND_EXCEEDS_TOTAL');
      }
      const existing = await tx.payment.findUnique({ where: { stripeRefundId: stripeRefund.id } });
      if (existing) return { refund: existing, duplicate: true as const };
      const split = computeIncrementalRefundSplit(
        alreadyRefundedPence,
        args.amountPence,
        {
          subtotalPence: booking.totalPence,
          serviceFeePence: 0,
          deliveryFeePence: 0,
          discountPence: 0,
          commissionPence: booking.commissionPence,
        },
        booking.totalPence,
      );
      const full = alreadyRefundedPence + args.amountPence === booking.totalPence;
      const refund = await tx.payment.create({
        data: {
          cateringBookingId: args.bookingId,
          userId: booking.customerId,
          type: full ? PaymentType.refund : PaymentType.partial_refund,
          status:
            stripeRefund.status === 'succeeded' ? PaymentStatus.succeeded : PaymentStatus.pending,
          amountPence: -args.amountPence,
          currency: 'GBP',
          stripePaymentIntentId: args.paymentIntentId,
          stripeRefundId: stripeRefund.id,
          processedAt: new Date(),
        },
      });
      await tx.payment.create({
        data: {
          cateringBookingId: args.bookingId,
          userId: booking.customerId,
          type: PaymentType.credit,
          status: PaymentStatus.succeeded,
          amountPence: split.feastpotAbsorbedPence,
          currency: 'GBP',
          failureReason: `Feastpot-absorbed catering refund portion (refund ${refund.id})`,
          processedAt: new Date(),
        },
      });
      if (payoutToAdjust && split.vendorClawbackPence > 0) {
        const adjusted = await tx.payout.updateMany({
          where: {
            id: payoutToAdjust,
            status: { in: [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved] },
            amountPence: { gte: split.vendorClawbackPence },
          },
          data: {
            amountPence: { decrement: split.vendorClawbackPence },
            refundsPence: { increment: split.vendorClawbackPence },
          },
        });
        if (adjusted.count !== 1) {
          throw new ConflictException({
            code: 'PAYOUT_ADJUSTMENT_FAILED',
            message: `Pending payout ${payoutToAdjust} changed concurrently or cannot absorb the catering refund; retry with the same request key`,
          });
        }
        await tx.refundOperation.update({
          where: { id: operation.id },
          data: { reversalStatus: 'payout_adjusted' },
        });
      }
      if (cancelBooking) {
        await tx.cateringBooking.update({
          where: { id: args.bookingId },
          data: {
            status: CateringBookingStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason,
          },
        });
      }
      await tx.refundOperation.update({
        where: { id: operation.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: args.actorId,
          action: 'catering_refund_issued',
          entityType: 'catering_bookings',
          entityId: args.bookingId,
          metadata: { refundPaymentId: refund.id, idempotencyKey: args.idempotencyKey, ...split },
        },
      });
      return { refund, duplicate: false as const };
    });
    return outcome;
  }

  /**
   * Imports a dashboard-created catering refund. It deliberately enters the
   * same durable-operation and ledger completion path as a first-party refund;
   * the supplied Stripe object prevents a second Stripe refund call.
   */
  async reconcileExternalCateringRefund(refund: Stripe.Refund): Promise<void> {
    const paymentIntentId =
      typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
    if (!paymentIntentId || !refund.id || refund.amount <= 0) return;
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId, cateringBookingId: { not: null } },
      select: { cateringBookingId: true },
    });
    if (!payment?.cateringBookingId) return;
    const existing = await this.prisma.payment.findUnique({ where: { stripeRefundId: refund.id } });
    if (existing) return;
    await this.createCateringRefund({
      bookingId: payment.cateringBookingId,
      paymentIntentId,
      amountPence: refund.amount,
      idempotencyKey: `stripe_external_catering_refund:${refund.id}`,
      actorId: null,
      stripeRefund: refund,
    });
  }

  /** Replays the saved Stripe idempotency key for the post-Stripe DB crash window. */
  async recoverCateringRefundOperation(operationId: string): Promise<void> {
    const operation = await this.prisma.refundOperation.findUnique({ where: { id: operationId } });
    if (!operation?.cateringBookingId) {
      throw new NotFoundException('Catering refund operation not found');
    }
    await this.createCateringRefund({
      bookingId: operation.cateringBookingId,
      paymentIntentId: operation.paymentIntentId,
      amountPence: operation.amountPence,
      idempotencyKey: operation.idempotencyKey,
      actorId: null,
    });
  }

  async recoverCateringRefundCompensation(operationId: string): Promise<void> {
    const operation = await this.prisma.refundOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation?.cateringBookingId || operation.reversalStatus !== 'compensation_pending') {
      return;
    }
    if (!operation.reversalAmountPence || operation.reversalAmountPence <= 0) {
      await this.resetFailedCateringOperation(operation.id);
      return;
    }
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: operation.cateringBookingId },
      select: { vendor: { select: { stripeAccountId: true } } },
    });
    if (!booking?.vendor.stripeAccountId) {
      throw new ConflictException('Cannot compensate catering reversal without a Stripe account');
    }
    await this.stripe.createTransfer({
      amountPence: operation.reversalAmountPence,
      destinationAccountId: booking.vendor.stripeAccountId,
      payoutId: operation.reversalPayoutId ?? operation.id,
      idempotencyKey: `catering-reversal-comp:${operation.idempotencyKey}:attempt:${operation.attempt}`,
    });
    await this.resetFailedCateringOperation(operation.id);
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
