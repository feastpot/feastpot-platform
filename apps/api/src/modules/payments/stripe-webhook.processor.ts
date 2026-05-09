import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, PayoutStatus } from '@prisma/client';
import type { Job } from 'bull';
import type Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  @Process('payment_intent.succeeded')
  async onIntentSucceeded(job: Job<WebhookJob>): Promise<void> {
    const pi = job.data.data as Stripe.PaymentIntent;
    await this.prisma.payment.updateMany({
      where: { stripePaymentIntentId: pi.id },
      data: { status: PaymentStatus.succeeded, processedAt: new Date() },
    });
    // We do NOT auto-advance the order here — order status is driven by the vendor
    // workflow; the capture call inside that flow already records succeeded.
    this.logger.log(`PI ${pi.id} succeeded`);
  }

  @Process('payment_intent.payment_failed')
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
      // Atomic CAS-style: only cancel if still pending — never override a vendor decision.
      await this.prisma.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.pending },
        data: { status: OrderStatus.cancelled, cancelledAt: new Date(), notes: '[CANCELLED] Stripe payment failed' },
      });
    }
    this.logger.warn(`PI ${pi.id} failed`);
  }

  @Process('transfer.created')
  async onTransferCreated(job: Job<WebhookJob>): Promise<void> {
    const transfer = job.data.data as Stripe.Transfer;
    // Match by metadata.payoutId if our service set it; otherwise no-op.
    const payoutId = (transfer.metadata as { payoutId?: string } | null)?.payoutId;
    if (!payoutId) {
      this.logger.debug(`transfer.created ${transfer.id} has no payoutId metadata — ignoring`);
      return;
    }
    await this.prisma.payout.updateMany({
      where: { id: payoutId },
      data: { stripeTransferId: transfer.id, status: PayoutStatus.transferred, transferredAt: new Date() },
    });
  }

  @Process('refund.updated')
  async onRefundUpdated(job: Job<WebhookJob>): Promise<void> {
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

  // Note: legacy Bull does not allow a catch-all `@Process()` alongside named
  // handlers. Unhandled event types are silently dropped after the controller
  // already recorded them in processed_webhook_events for audit.
}
