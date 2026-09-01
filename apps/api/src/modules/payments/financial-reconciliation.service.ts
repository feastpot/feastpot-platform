import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { createHash } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

type FindingKind =
  | 'missing_local_capture'
  | 'missing_local_payout'
  | 'missing_stripe_transfer'
  | 'missing_local_refund'
  | 'amount_mismatch';

/**
 * Independently compares Stripe's settled money movements with the local
 * ledger. This deliberately lives in PaymentsModule, not a Bull processor:
 * scheduled reconciliation must remain available if queue registration fails.
 *
 * Findings are pence-only and are deduplicated by a stable hash of their
 * class/source. A resolved and later reintroduced discrepancy retains its
 * original audit record rather than repeatedly paging finance.
 */
@Injectable()
export class FinancialReconciliationService {
  private readonly logger = new Logger(FinancialReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'financial-reconciliation' })
  async reconcileScheduled(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Financial reconciliation failed: ${message}`);
      Sentry.captureException(error, {
        tags: { service: 'financial-reconciliation' },
      });
      throw error;
    }
  }

  async reconcile(): Promise<void> {
    const [captures, payouts, refunds] = await Promise.all([
      this.prisma.payment.findMany({
        where: { type: 'capture', status: 'succeeded' },
        select: { id: true, stripePaymentIntentId: true, amountPence: true },
      }),
      this.prisma.payout.findMany({
        where: { status: 'transferred' },
        select: { id: true, stripeTransferId: true, amountPence: true },
      }),
      this.prisma.payment.findMany({
        where: { type: { in: ['refund', 'partial_refund'] }, status: 'succeeded' },
        select: { id: true, stripeRefundId: true, amountPence: true },
      }),
    ]);

    const localCaptures = new Map(
      captures.filter((p) => p.stripePaymentIntentId).map((p) => [p.stripePaymentIntentId!, p]),
    );
    const localPayouts = new Map(payouts.map((p) => [p.id, p]));
    const localPayoutsByTransfer = new Map(
      payouts.filter((p) => p.stripeTransferId).map((p) => [p.stripeTransferId!, p]),
    );
    const localRefunds = new Map(
      refunds.filter((p) => p.stripeRefundId).map((p) => [p.stripeRefundId!, p]),
    );

    const stripeTransferIds = new Set<string>();
    await this.eachStripePage('paymentIntent', async (paymentIntent) => {
      if (paymentIntent.status !== 'succeeded') return;
      const local = localCaptures.get(paymentIntent.id);
      if (!local) {
        await this.record('missing_local_capture', paymentIntent.id, {
          stripePaymentIntentId: paymentIntent.id,
          stripeAmountPence: paymentIntent.amount,
        });
      } else if (local.amountPence !== paymentIntent.amount) {
        await this.record('amount_mismatch', `capture:${paymentIntent.id}`, {
          movement: 'capture',
          stripePaymentIntentId: paymentIntent.id,
          stripeAmountPence: paymentIntent.amount,
          localPaymentId: local.id,
          localAmountPence: local.amountPence,
        });
      }
    });

    await this.eachStripePage('transfer', async (transfer) => {
      stripeTransferIds.add(transfer.id);
      const payoutId = transfer.metadata.payoutId;
      const local =
        localPayoutsByTransfer.get(transfer.id) ??
        (payoutId ? localPayouts.get(payoutId) : undefined);
      if (!local) {
        await this.record('missing_local_payout', transfer.id, {
          stripeTransferId: transfer.id,
          stripeAmountPence: transfer.amount,
          payoutId: payoutId ?? null,
        });
      } else if (local.amountPence !== transfer.amount) {
        await this.record('amount_mismatch', `transfer:${transfer.id}`, {
          movement: 'transfer',
          stripeTransferId: transfer.id,
          stripeAmountPence: transfer.amount,
          localPayoutId: local.id,
          localAmountPence: local.amountPence,
        });
      }
    });

    for (const payout of payouts) {
      if (!payout.stripeTransferId || !stripeTransferIds.has(payout.stripeTransferId)) {
        await this.record('missing_stripe_transfer', payout.id, {
          localPayoutId: payout.id,
          localStripeTransferId: payout.stripeTransferId,
          localAmountPence: payout.amountPence,
        });
      }
    }

    await this.eachStripePage('refund', async (refund) => {
      // Failed/cancelled refunds did not move money, so are not ledger gaps.
      if (refund.status === 'failed' || refund.status === 'canceled') return;
      const local = localRefunds.get(refund.id);
      if (!local) {
        await this.record('missing_local_refund', refund.id, {
          stripeRefundId: refund.id,
          stripePaymentIntentId:
            typeof refund.payment_intent === 'string' ? refund.payment_intent : null,
          stripeAmountPence: refund.amount,
        });
      } else if (local.amountPence !== refund.amount) {
        await this.record('amount_mismatch', `refund:${refund.id}`, {
          movement: 'refund',
          stripeRefundId: refund.id,
          stripeAmountPence: refund.amount,
          localPaymentId: local.id,
          localAmountPence: local.amountPence,
        });
      }
    });
  }

  private async eachStripePage(
    type: 'paymentIntent' | 'transfer' | 'refund',
    visit: (item: any) => Promise<void>,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const page =
        type === 'paymentIntent'
          ? await this.stripe.listPaymentIntents(cursor)
          : type === 'transfer'
            ? await this.stripe.listTransfers(cursor)
            : await this.stripe.listAllRefunds(cursor);
      for (const item of page.data) await visit(item);
      if (!page.has_more || page.data.length === 0) return;
      cursor = page.data[page.data.length - 1]!.id;
    }
  }

  private async record(
    kind: FindingKind,
    source: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const digest = createHash('sha256').update(`${kind}:${source}`).digest('hex');
    const action = `financial_reconciliation:${kind}:${digest}`;
    const existing = await this.prisma.auditLog.findFirst({
      where: { action, entityType: 'financial_reconciliation' },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.auditLog.create({
      data: {
        action,
        entityType: 'financial_reconciliation',
        metadata: { kind, source, ...metadata },
      },
    });
    const message = `Financial reconciliation ${kind}: ${source}`;
    this.logger.error(message);
    Sentry.captureMessage(message, {
      level: 'error',
      tags: { service: 'financial-reconciliation', finding: kind },
      fingerprint: ['financial-reconciliation', kind, source],
      extra: metadata,
    });
  }
}
