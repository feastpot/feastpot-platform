import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, PayoutStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bull';
import type Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { shouldReportQueueFailure } from '../../queues/queue-failure';
import { LoyaltyService } from '../loyalty/loyalty.service';

import { STRIPE_WEBHOOK_QUEUE } from './stripe-webhook.controller';

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
  ) {}

  // Concurrency=5 on each handler: Stripe bursts during busy periods (peak
  // Friday evening), and these handlers are idempotent (updateMany on the
  // PI/refund id) so concurrent processing is safe.
  @Process({ name: 'payment_intent.succeeded', concurrency: 10 })
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

  @Process({ name: 'payment_intent.payment_failed', concurrency: 10 })
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
          select: { customerId: true },
        });
        if (order) {
          try {
            await this.loyalty.refundRedemption(order.customerId, payment.orderId);
          } catch (e) {
            this.logger.error(
              `refundRedemption (webhook) failed for ${payment.orderId}: ${(e as Error).message}`,
            );
          }
        }
      }
    }
    this.logger.warn(`PI ${pi.id} failed`);
  }

  @Process({ name: 'transfer.created', concurrency: 10 })
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
  @Process({ name: 'refund.updated', concurrency: 10 })
  async onRefundUpdated(job: Job<WebhookJob>): Promise<void> {
    await this.handleRefundUpdated(job);
  }

  @Process({ name: 'charge.refund.updated', concurrency: 10 })
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
  @Process({ name: 'charge.dispute.created', concurrency: 10 })
  async onDisputeCreated(job: Job<WebhookJob>): Promise<void> {
    await this.handleChargeDispute(job);
  }

  @Process({ name: 'charge.dispute.updated', concurrency: 10 })
  async onDisputeUpdated(job: Job<WebhookJob>): Promise<void> {
    await this.handleChargeDispute(job);
  }

  @Process({ name: 'charge.dispute.closed', concurrency: 10 })
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
  }

  // Note: legacy Bull does not allow a catch-all `@Process()` alongside named
  // handlers. Unhandled event types are silently dropped after the controller
  // already recorded them in processed_webhook_events for audit.

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
