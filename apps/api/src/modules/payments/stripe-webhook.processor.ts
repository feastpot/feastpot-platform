import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, PaymentType, PayoutStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bull';
import type Stripe from 'stripe';

import { FeastPassService } from '../../feastpass/feastpass.service';
import { PrismaService } from '../../prisma/prisma.service';
import { shouldReportQueueFailure } from '../../queues/queue-failure';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  capacityTypeForItemCategories,
  isCapacityEnforcementEnabled,
  releaseCapacity,
} from '../vendors/vendor-capacity';

import { computeRefundSplit } from './payments.service';
import { STRIPE_WEBHOOK_QUEUE } from './stripe-webhook.controller';
import type { HandledStripeEventType } from './stripe-webhook.events';

// Compile-time link to the shared registry in stripe-webhook.events.ts:
// every @Process name below is checked against HandledStripeEventType via
// the eventName() helper, so adding a handler without registering its event
// type in HANDLED_STRIPE_EVENT_TYPES fails typechecking instead of the
// controller alerting on (and skipping) a type we actually handle.
const eventName = <T extends HandledStripeEventType>(name: T): T => name;

interface WebhookJob {
  id: string;
  type: string;
  data: unknown;
}

/**
 * Processes Stripe webhooks asynchronously after the controller has already
 * acknowledged delivery. Each handler is best-effort: failures cause the BullMQ
 * job to retry per the queue's retry config.
 */
@Processor(STRIPE_WEBHOOK_QUEUE)
export class StripeWebhookProcessor {
  private readonly logger = new Logger(StripeWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    // LoyaltyModule is @Global - no PaymentsModule import change needed.
    // Used to refund any loyalty redemption attached to an order whose
    // payment Stripe ultimately fails (FR-LOY-001 retention requirement).
    private readonly loyalty: LoyaltyService,
    // FeastPassModule is @Global - available without importing it here.
    private readonly feastpass: FeastPassService,
  ) {}

  // Concurrency=5 on each handler: Stripe bursts during busy periods (peak
  // Friday evening), and these handlers are idempotent (updateMany on the
  // PI/refund id) so concurrent processing is safe.
  @Process({ name: eventName('payment_intent.succeeded'), concurrency: 10 })
  async onIntentSucceeded(job: Job<WebhookJob>): Promise<void> {
    const pi = job.data.data as Stripe.PaymentIntent;
    await this.prisma.payment.updateMany({
      where: { stripePaymentIntentId: pi.id },
      data: { status: PaymentStatus.succeeded, processedAt: new Date() },
    });
    // We do NOT auto-advance the order here - order status is driven by the vendor
    // workflow; the capture call inside that flow already records succeeded.
    this.logger.log(`PI ${pi.id} succeeded`);
  }

  @Process({ name: eventName('payment_intent.payment_failed'), concurrency: 10 })
  async onIntentFailed(job: Job<WebhookJob>): Promise<void> {
    const pi = job.data.data as Stripe.PaymentIntent;
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: pi.id },
      select: { orderId: true },
    });
    await this.prisma.payment.updateMany({
      where: { stripePaymentIntentId: pi.id },
      data: {
        status: PaymentStatus.failed,
        failureReason: pi.last_payment_error?.message ?? 'payment_failed',
        processedAt: new Date(),
      },
    });
    if (payment?.orderId) {
      // Atomic CAS-style: only cancel if still pending - never override a vendor decision.
      const cancelled = await this.prisma.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.pending },
        data: {
          status: OrderStatus.cancelled,
          cancelledAt: new Date(),
          notes: '[CANCELLED] Stripe payment failed',
        },
      });
      // Only refund the loyalty redemption if WE were the one that
      // cancelled the order on this run (`cancelled.count === 1`). The
      // refundRedemption call is itself idempotent, but gating on the
      // CAS result avoids a redundant lock acquisition on an order that
      // was already moved by another worker.
      if (cancelled.count > 0) {
        const order = await this.prisma.order.findUnique({
          where: { id: payment.orderId },
          select: {
            customerId: true,
            vendorId: true,
            scheduledFor: true,
            items: { select: { menuItem: { select: { category: true } } } },
          },
        });
        if (order) {
          try {
            await this.loyalty.refundRedemption(order.customerId, payment.orderId);
          } catch (e) {
            this.logger.error(
              `refundRedemption (webhook) failed for ${payment.orderId}: ${(e as Error).message}`,
            );
          }
          // Hand the capacity slot back - payment failure is a terminal exit
          // for a pending order, same as a cancellation. Gated on the flag
          // (creation didn't increment while off) and only after our CAS won,
          // so a vendor/customer cancellation can't double-release.
          if (isCapacityEnforcementEnabled() && order.scheduledFor) {
            const categories = order.items
              .map((i) => i.menuItem?.category)
              .filter((c): c is NonNullable<typeof c> => c != null);
            try {
              await releaseCapacity(
                this.prisma,
                order.vendorId,
                order.scheduledFor,
                capacityTypeForItemCategories(categories),
                1,
              );
            } catch (e) {
              this.logger.error(
                `releaseCapacity (webhook) failed for ${payment.orderId}: ${(e as Error).message}`,
              );
            }
          }
        }
      }
    }
    this.logger.warn(`PI ${pi.id} failed`);
  }

  @Process({ name: eventName('transfer.created'), concurrency: 10 })
  async onTransferCreated(job: Job<WebhookJob>): Promise<void> {
    const transfer = job.data.data as Stripe.Transfer;
    // Match by metadata.payoutId if our service set it; otherwise no-op.
    const payoutId = (transfer.metadata as { payoutId?: string } | null)?.payoutId;
    if (!payoutId) {
      this.logger.debug(`transfer.created ${transfer.id} has no payoutId metadata - ignoring`);
      return;
    }
    await this.prisma.payout.updateMany({
      where: { id: payoutId },
      data: {
        stripeTransferId: transfer.id,
        status: PayoutStatus.transferred,
        transferredAt: new Date(),
      },
    });
  }

  // Stripe emits the refund-status event under one of two type names depending
  // on the endpoint's API version: modern accounts send `refund.updated`, while
  // older API versions send `charge.refund.updated`. Both carry a Refund object
  // as `data.object`. The controller enqueues jobs keyed by `event.type`, so we
  // register a named handler for BOTH to avoid silently dropping refund events.
  @Process({ name: eventName('refund.updated'), concurrency: 10 })
  async onRefundUpdated(job: Job<WebhookJob>): Promise<void> {
    await this.handleRefundUpdated(job);
  }

  @Process({ name: eventName('charge.refund.updated'), concurrency: 10 })
  async onChargeRefundUpdated(job: Job<WebhookJob>): Promise<void> {
    await this.handleRefundUpdated(job);
  }

  private async handleRefundUpdated(job: Job<WebhookJob>): Promise<void> {
    const refund = job.data.data as Stripe.Refund;
    if (!refund.id) return;
    const status =
      refund.status === 'succeeded'
        ? PaymentStatus.succeeded
        : refund.status === 'failed' || refund.status === 'canceled'
          ? PaymentStatus.failed
          : PaymentStatus.pending;
    // Match by stripeRefundId (unique on Payment) so each refund row is updated
    // independently. Matching by PI alone would smear the latest refund's status
    // onto every prior partial refund on the same PI.
    await this.prisma.payment.updateMany({
      where: { stripeRefundId: refund.id },
      data: { status, processedAt: new Date() },
    });
  }

  // Bank-initiated card chargebacks. Stripe emits `charge.dispute.created` when
  // a cardholder's bank raises a dispute, `charge.dispute.updated` as it moves
  // through Stripe's lifecycle (evidence submitted, under review), and
  // `charge.dispute.closed` once it is won/lost. All three carry a Stripe.Dispute
  // as `data.object`. We upsert a single Chargeback row keyed on the Stripe
  // dispute id so finance sees status + amount without the Stripe Dashboard.
  // This is entirely separate from the internal customer-vs-vendor Dispute flow.
  @Process({ name: eventName('charge.dispute.created'), concurrency: 10 })
  async onDisputeCreated(job: Job<WebhookJob>): Promise<void> {
    await this.handleChargeDispute(job);
  }

  @Process({ name: eventName('charge.dispute.updated'), concurrency: 10 })
  async onDisputeUpdated(job: Job<WebhookJob>): Promise<void> {
    await this.handleChargeDispute(job);
  }

  @Process({ name: eventName('charge.dispute.closed'), concurrency: 10 })
  async onDisputeClosed(job: Job<WebhookJob>): Promise<void> {
    await this.handleChargeDispute(job);
  }

  private async handleChargeDispute(job: Job<WebhookJob>): Promise<void> {
    const dispute = job.data.data as Stripe.Dispute;
    if (!dispute.id) return;

    const chargeId =
      typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge?.id ?? null);
    const piId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : (dispute.payment_intent?.id ?? null);

    // Match by Stripe charge id first (the dispute is always against a charge),
    // falling back to the payment intent id. Either column may be the natural
    // key on our Payment rows depending on whether capture/refund stamped it.
    const matchers: Prisma.PaymentWhereInput[] = [];
    if (chargeId) matchers.push({ stripeChargeId: chargeId });
    if (piId) matchers.push({ stripePaymentIntentId: piId });
    const payment = matchers.length
      ? await this.prisma.payment.findFirst({
          where: { OR: matchers },
          orderBy: { createdAt: 'asc' },
          select: { id: true, orderId: true },
        })
      : null;

    const evidenceDueBy = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000)
      : null;
    const openedAt = dispute.created ? new Date(dispute.created * 1000) : null;
    // `charge.dispute.closed` is the authoritative close signal, but `won`/`lost`
    // can also surface on an `updated` event - treat either as closed.
    const isClosed =
      job.data.type === 'charge.dispute.closed' ||
      dispute.status === 'won' ||
      dispute.status === 'lost';

    // Upsert on the unique stripeDisputeId so created/updated/closed events for
    // the same dispute converge on one row, and out-of-order delivery or BullMQ
    // retries stay idempotent. `?? undefined` on update preserves any link we
    // already established if a later event arrives without (or before) a match.
    await this.prisma.chargeback.upsert({
      where: { stripeDisputeId: dispute.id },
      create: {
        stripeDisputeId: dispute.id,
        orderId: payment?.orderId ?? null,
        paymentId: payment?.id ?? null,
        stripeChargeId: chargeId,
        stripePaymentIntentId: piId,
        amountPence: dispute.amount,
        currency: (dispute.currency ?? 'gbp').toUpperCase(),
        status: dispute.status,
        reason: dispute.reason ?? null,
        evidenceDueBy,
        openedAt,
        closedAt: isClosed ? new Date() : null,
      },
      update: {
        orderId: payment?.orderId ?? undefined,
        paymentId: payment?.id ?? undefined,
        stripeChargeId: chargeId ?? undefined,
        stripePaymentIntentId: piId ?? undefined,
        amountPence: dispute.amount,
        status: dispute.status,
        reason: dispute.reason ?? null,
        evidenceDueBy,
        closedAt: isClosed ? new Date() : undefined,
      },
    });

    const target = payment?.orderId ? `order ${payment.orderId}` : 'no matching order';
    this.logger.warn(
      `Chargeback ${dispute.id} (${dispute.status}, ${dispute.reason ?? 'no reason'}) ` +
        `${(dispute.amount / 100).toFixed(2)} ${(dispute.currency ?? 'gbp').toUpperCase()} - ${target}`,
    );

    // A LOST chargeback means the bank has already pulled the disputed amount
    // from Feastpot's Stripe balance. Reconcile the order's finances so the
    // weekly payout batch claws back the vendor's earned share (never the
    // platform service fee) exactly like an internally-issued refund would.
    if (dispute.status === 'lost') {
      await this.reconcileLostChargeback(dispute.id);
    }
  }

  /**
   * Reconcile order finances after a chargeback is LOST.
   *
   * Mirrors PaymentsService.createRefund's ledger writes: one refund-type
   * Payment row for the full customer-side amount (negative = cash out) plus
   * one credit row for the portion Feastpot absorbs (its service-fee +
   * commission share). The weekly payout batch nets these two rows into the
   * vendor clawback, so the vendor is deducted only what they actually earned
   * on the disputed portion - the platform service fee is never clawed back
   * from them (see computeRefundSplit).
   *
   * Idempotency: a CAS on `Chargeback.reconciledAt IS NULL` inside the same
   * transaction as the ledger writes guarantees exactly-once reconciliation
   * even across BullMQ retries or duplicate `closed`/`updated` lost events.
   */
  private async reconcileLostChargeback(stripeDisputeId: string): Promise<void> {
    const chargeback = await this.prisma.chargeback.findUnique({
      where: { stripeDisputeId },
      select: { id: true, orderId: true, amountPence: true, reconciledAt: true },
    });
    if (!chargeback || chargeback.reconciledAt) return;
    if (!chargeback.orderId) {
      // No local order matched - nothing to reconcile against. Loudly flag it:
      // money left the Stripe balance with no ledger counterpart.
      this.logger.error(
        `Chargeback ${stripeDisputeId} LOST but has no matching order - manual reconciliation required`,
      );
      Sentry.captureMessage(`Chargeback lost with no matching order: ${stripeDisputeId}`, 'error');
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: chargeback.orderId },
      select: {
        id: true,
        customerId: true,
        totalPence: true,
        subtotalPence: true,
        serviceFeePence: true,
        deliveryFeePence: true,
        discountPence: true,
        commissionPence: true,
      },
    });
    if (!order) {
      this.logger.error(
        `Chargeback ${stripeDisputeId} LOST but order ${chargeback.orderId} not found`,
      );
      return;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Per-order advisory lock: serialises this reconciliation against any
      // concurrent manual refund on the same order (createRefund takes the
      // same lock), so the cumulative-refund ceiling below cannot be raced
      // past by two writers that each passed a stale pre-check.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;

      // CAS inside the transaction: only the first winner writes ledger rows.
      const cas = await tx.chargeback.updateMany({
        where: { id: chargeback.id, reconciledAt: null },
        data: { reconciledAt: new Date() },
      });
      if (cas.count !== 1) return { outcome: 'already_reconciled' as const };

      // Cap at what is still refundable - computed INSIDE the lock scope so
      // prior refunds/chargebacks can never push the cumulative amount past
      // the order total, even under concurrency.
      const prior = await tx.payment.aggregate({
        where: {
          orderId: order.id,
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
        },
        _sum: { amountPence: true },
      });
      const alreadyRefundedPence = -(prior._sum.amountPence ?? 0);
      const amountPence = Math.min(
        chargeback.amountPence,
        Math.max(0, order.totalPence - alreadyRefundedPence),
      );
      if (amountPence <= 0) {
        // Fully refunded already (e.g. we refunded, customer also disputed).
        // reconciledAt stays set (CAS above) so we never retry.
        return { outcome: 'fully_refunded' as const };
      }

      const isFull = amountPence >= order.totalPence;
      const split = computeRefundSplit(
        amountPence,
        {
          subtotalPence: order.subtotalPence,
          serviceFeePence: order.serviceFeePence,
          deliveryFeePence: order.deliveryFeePence,
          discountPence: order.discountPence,
          commissionPence: order.commissionPence,
        },
        isFull,
      );

      // Refund row (negative = cash out of Feastpot's books). userId is the
      // customer - the chargeback is customer-initiated via their bank; there
      // is no internal actor.
      const refundRow = await tx.payment.create({
        data: {
          orderId: order.id,
          userId: order.customerId,
          type: isFull ? PaymentType.refund : PaymentType.partial_refund,
          status: PaymentStatus.succeeded,
          amountPence: -amountPence,
          currency: 'GBP',
          failureReason: `Chargeback lost (Stripe dispute ${stripeDisputeId})`,
          processedAt: new Date(),
        },
      });
      // Credit row: the share Feastpot absorbs (service fee + commission) so
      // the batch nets the vendor clawback correctly. MUST be atomic with the
      // refund row (see service-fee/payout invariant).
      await tx.payment.create({
        data: {
          orderId: order.id,
          userId: order.customerId,
          type: PaymentType.credit,
          status: PaymentStatus.succeeded,
          amountPence: split.feastpotAbsorbedPence,
          currency: 'GBP',
          failureReason: `Feastpot-absorbed portion of chargeback ${stripeDisputeId} (refund ${refundRow.id})`,
          processedAt: new Date(),
        },
      });
      // Permanent audit record, atomic with the money rows.
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'chargeback_lost_reconciled',
          entityType: 'orders',
          entityId: order.id,
          metadata: {
            stripeDisputeId,
            chargebackId: chargeback.id,
            disputedAmountPence: chargeback.amountPence,
            reconciledAmountPence: amountPence,
            vendorClawbackPence: split.vendorClawbackPence,
            feastpotAbsorbedPence: split.feastpotAbsorbedPence,
            serviceFeeAbsorbedPence: split.serviceFeeAbsorbedPence,
            commissionRefundedPence: split.commissionRefundedPence,
          } as Prisma.JsonObject,
        },
      });
      return { outcome: 'reconciled' as const, amountPence, split };
    });

    if (result.outcome === 'fully_refunded') {
      this.logger.warn(
        `Chargeback ${stripeDisputeId} lost but order ${order.id} already fully refunded - no ledger rows written`,
      );
      Sentry.captureMessage(
        `Chargeback lost on already-refunded order ${order.id} (dispute ${stripeDisputeId}) - possible double loss`,
        'warning',
      );
    } else if (result.outcome === 'reconciled') {
      this.logger.warn(
        `Chargeback ${stripeDisputeId} LOST - reconciled order ${order.id}: ` +
          `${result.amountPence}p total, vendor clawback ${result.split.vendorClawbackPence}p, ` +
          `Feastpot absorbed ${result.split.feastpotAbsorbedPence}p`,
      );
    }
  }

  // Note: legacy Bull does not allow a catch-all `@Process()` alongside named
  // handlers. Unhandled event types are detected in the controller (via
  // HANDLED_STRIPE_EVENT_TYPES) and alerted through Sentry + warn log instead
  // of being enqueued; they are still recorded in processed_webhook_events.

  // ── FeastPass subscription lifecycle ───────────────────────────────────────

  @Process({ name: eventName('customer.subscription.created'), concurrency: 5 })
  async onSubscriptionCreated(job: Job<WebhookJob>): Promise<void> {
    const sub = job.data.data as Stripe.Subscription;
    await this.feastpass.handleSubscriptionUpsert(sub);
  }

  @Process({ name: eventName('customer.subscription.updated'), concurrency: 5 })
  async onSubscriptionUpdated(job: Job<WebhookJob>): Promise<void> {
    const sub = job.data.data as Stripe.Subscription;
    await this.feastpass.handleSubscriptionUpsert(sub);
  }

  @Process({ name: eventName('customer.subscription.deleted'), concurrency: 5 })
  async onSubscriptionDeleted(job: Job<WebhookJob>): Promise<void> {
    const sub = job.data.data as Stripe.Subscription;
    await this.feastpass.handleSubscriptionDeleted(sub);
  }

  @Process({ name: eventName('invoice.payment_failed'), concurrency: 5 })
  async onInvoicePaymentFailed(job: Job<WebhookJob>): Promise<void> {
    const invoice = job.data.data as Stripe.Invoice;
    await this.feastpass.handleInvoicePaymentFailed(invoice);
  }

  @Process({ name: eventName('invoice.payment_succeeded'), concurrency: 5 })
  async onInvoicePaymentSucceeded(job: Job<WebhookJob>): Promise<void> {
    const invoice = job.data.data as Stripe.Invoice;
    await this.feastpass.handleInvoicePaymentSucceeded(invoice);
  }

  @OnQueueFailed()
  onFailed(job: Job<WebhookJob> | undefined, err: Error): void {
    if (shouldReportQueueFailure(job, err)) {
      Sentry.captureException(err, {
        tags: { queue: STRIPE_WEBHOOK_QUEUE, jobName: job?.name ?? 'unknown' },
        extra: { jobId: job?.id, attemptsMade: job?.attemptsMade, eventId: job?.data?.id },
      });
    }
    this.logger.error(
      `[${STRIPE_WEBHOOK_QUEUE}] job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
    );
  }
}
