import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

import { PaymentsService } from './payments.service';

/**
 * Hosted in PaymentsModule (rather than a webhook processor) so it is
 * registered once. Refund operations are intentionally retained after Stripe
 * succeeds until their ledger pair commits; this worker closes that failure
 * window using the operation's deterministic Stripe key.
 */
@Injectable()
export class CateringRefundReconciliationService {
  private readonly logger = new Logger(CateringRefundReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly payments: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'catering-refund-reconciliation' })
  async reconcilePendingCateringRefunds(): Promise<void> {
    const operations = await this.prisma.refundOperation.findMany({
      where: {
        cateringBookingId: { not: null },
        OR: [
          { status: { in: ['pending', 'stripe_succeeded'] } },
          { reversalStatus: 'compensation_pending' },
        ],
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const operation of operations) {
      try {
        if (operation.reversalStatus === 'compensation_pending') {
          await this.payments.recoverCateringRefundCompensation(operation.id);
          continue;
        }
        if (!operation.stripeRefundId) {
          // This is the critical post-Stripe/pre-persist crash window. Replay
          // Stripe with exactly the saved deterministic key: it returns the
          // original refund if Stripe accepted it, rather than charging twice.
          await this.payments.recoverCateringRefundOperation(operation.id);
        }
        const refreshed = await this.prisma.refundOperation.findUnique({ where: { id: operation.id } });
        if (!refreshed?.stripeRefundId) {
          await this.incident(operation.id, 'Refund replay completed without a persisted Stripe refund id');
          continue;
        }
        const stripeRefund = await this.stripe.retrieveRefund(refreshed.stripeRefundId);
        if (stripeRefund.status === 'failed' || stripeRefund.status === 'canceled') {
          await this.payments.compensateFailedRefund(stripeRefund.id);
          continue;
        }
        // Replays the exact Stripe request key. Stripe returns the already
        // created refund, then PaymentsService atomically writes/returns the
        // one common refund+credit ledger pair.
        await this.payments.createCateringRefund({
          bookingId: operation.cateringBookingId!,
          paymentIntentId: operation.paymentIntentId,
          amountPence: operation.amountPence,
          idempotencyKey: operation.idempotencyKey,
          actorId: null,
        });
      } catch (error) {
        await this.incident(operation.id, error instanceof Error ? error.message : String(error));
      }
    }
    // Also sweep successful catering charges for Dashboard/API refunds which
    // have no local operation at all. Stripe's list endpoint is charge-based,
    // hence the capture row's stored charge id.
    let cursor: string | undefined;
    for (;;) {
      const captures = await this.prisma.payment.findMany({
        where: {
          cateringBookingId: { not: null },
          type: 'capture',
          stripeChargeId: { not: null },
        },
        select: { id: true, stripeChargeId: true },
        take: 100,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const capture of captures) {
        if (!capture.stripeChargeId) continue;
        try {
          let refundCursor: string | undefined;
          for (;;) {
            const refunds = await this.stripe.listRefunds(capture.stripeChargeId, refundCursor);
            for (const refund of refunds.data) {
              await this.payments.reconcileExternalCateringRefund(refund);
            }
            if (!refunds.has_more || refunds.data.length === 0) break;
            refundCursor = refunds.data[refunds.data.length - 1]!.id;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Catering Stripe refund sweep ${capture.stripeChargeId}: ${message}`);
          Sentry.captureMessage(`Catering Stripe refund sweep ${capture.stripeChargeId}: ${message}`, 'error');
        }
      }
      if (captures.length < 100) break;
      cursor = captures[captures.length - 1]!.id;
    }
  }

  private async incident(operationId: string, message: string): Promise<void> {
    this.logger.error(`Catering refund reconciliation ${operationId}: ${message}`);
    Sentry.captureMessage(`Catering refund reconciliation ${operationId}: ${message}`, 'error');
    await this.prisma.refundOperation
      .update({ where: { id: operationId }, data: { status: 'failed', failureReason: message } })
      .catch(() => undefined);
  }
}