import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentStatus, PaymentType, PayoutStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

export type FinancialFindingKind =
  | 'stripe_capture_missing_local'
  | 'stripe_transfer_missing_local'
  | 'local_payout_missing_stripe_transfer'
  | 'stripe_refund_missing_local'
  | 'amount_mismatch'
  | 'zero_fee_missing_provenance'
  | 'local_financial_integrity';

interface Finding {
  kind: FinancialFindingKind;
  fingerprint: string;
  stripeObjectId?: string;
  localEntityId?: string;
  stripeAmountPence?: number;
  localAmountPence?: number;
  detail?: Prisma.JsonObject;
}

@Injectable()
export class StripeFinancialReconciliationService {
  private readonly logger = new Logger(StripeFinancialReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  @Cron('17 * * * *')
  async reconcileRecentFinancialActivity(now: Date = new Date()): Promise<{ findings: number }> {
    const createdGte = Math.floor((now.getTime() - 48 * 60 * 60 * 1000) / 1000);
    const [intents, transfers, refunds] = await Promise.all([
      this.stripe.listRecentPaymentIntents(createdGte),
      this.stripe.listRecentTransfers(createdGte),
      this.stripe.listRecentRefunds(createdGte),
    ]);

    const findings: Finding[] = [];
    await this.reconcileCaptures(intents.data, findings);
    await this.reconcileTransfers(transfers.data, createdGte, findings);
    await this.reconcileRefunds(refunds.data, findings);
    await this.reconcileLocalOrderIntegrity(findings);

    for (const finding of findings) await this.recordFinding(finding, now);
    if (findings.length > 0) {
      this.logger.error(`Stripe financial reconciliation found ${findings.length} mismatch(es)`);
      Sentry.captureMessage(
        `Stripe financial reconciliation found ${findings.length} mismatch(es)`,
        'error',
      );
    }
    return { findings: findings.length };
  }

  private async reconcileCaptures(intents: Stripe.PaymentIntent[], findings: Finding[]) {
    for (const intent of intents) {
      if (intent.status !== 'succeeded' || intent.amount_received <= 0) continue;
      const local = await this.prisma.payment.findFirst({
        where: {
          stripePaymentIntentId: intent.id,
          type: PaymentType.capture,
          status: PaymentStatus.succeeded,
        },
        select: { id: true, amountPence: true },
      });
      if (!local) {
        findings.push({
          kind: 'stripe_capture_missing_local',
          fingerprint: `capture-missing:${intent.id}`,
          stripeObjectId: intent.id,
          stripeAmountPence: intent.amount_received,
          detail: { orderId: intent.metadata.orderId ?? null },
        });
      } else if (local.amountPence !== intent.amount_received) {
        findings.push(
          this.amountMismatch(
            'capture',
            intent.id,
            local.id,
            intent.amount_received,
            local.amountPence,
          ),
        );
      }
    }
  }

  private async reconcileTransfers(
    transfers: Stripe.Transfer[],
    createdGte: number,
    findings: Finding[],
  ) {
    for (const transfer of transfers) {
      const payoutId = transfer.metadata.payoutId;
      const local = await this.prisma.payout.findFirst({
        where: {
          OR: [{ stripeTransferId: transfer.id }, ...(payoutId ? [{ id: payoutId }] : [])],
        },
        select: { id: true, amountPence: true },
      });
      if (!local) {
        findings.push({
          kind: 'stripe_transfer_missing_local',
          fingerprint: `transfer-missing:${transfer.id}`,
          stripeObjectId: transfer.id,
          stripeAmountPence: transfer.amount,
        });
      } else if (local.amountPence !== transfer.amount) {
        findings.push(
          this.amountMismatch(
            'transfer',
            transfer.id,
            local.id,
            transfer.amount,
            local.amountPence,
          ),
        );
      }
    }

    const recentLocal = await this.prisma.payout.findMany({
      where: {
        status: PayoutStatus.transferred,
        transferredAt: { gte: new Date(createdGte * 1000) },
      },
      select: { id: true, stripeTransferId: true, amountPence: true },
      take: 100,
    });
    const stripeIds = new Set(transfers.map((transfer) => transfer.id));
    for (const payout of recentLocal) {
      if (!payout.stripeTransferId || !stripeIds.has(payout.stripeTransferId)) {
        findings.push({
          kind: 'local_payout_missing_stripe_transfer',
          fingerprint: `local-payout-missing:${payout.id}:${payout.stripeTransferId ?? 'none'}`,
          stripeObjectId: payout.stripeTransferId ?? undefined,
          localEntityId: payout.id,
          localAmountPence: payout.amountPence,
        });
      }
    }
  }

  private async reconcileRefunds(refunds: Stripe.Refund[], findings: Finding[]) {
    for (const refund of refunds) {
      if (refund.status === 'failed' || refund.amount <= 0) continue;
      const local = await this.prisma.payment.findUnique({
        where: { stripeRefundId: refund.id },
        select: { id: true, amountPence: true },
      });
      if (!local) {
        findings.push({
          kind: 'stripe_refund_missing_local',
          fingerprint: `refund-missing:${refund.id}`,
          stripeObjectId: refund.id,
          stripeAmountPence: refund.amount,
          detail: {
            paymentIntentId:
              typeof refund.payment_intent === 'string'
                ? refund.payment_intent
                : (refund.payment_intent?.id ?? null),
          },
        });
      } else if (Math.abs(local.amountPence) !== refund.amount) {
        findings.push(
          this.amountMismatch(
            'refund',
            refund.id,
            local.id,
            refund.amount,
            Math.abs(local.amountPence),
          ),
        );
      }
    }
  }

  private amountMismatch(
    objectType: string,
    stripeObjectId: string,
    localEntityId: string,
    stripeAmountPence: number,
    localAmountPence: number,
  ): Finding {
    return {
      kind: 'amount_mismatch',
      fingerprint: `amount:${objectType}:${stripeObjectId}:${stripeAmountPence}:${localAmountPence}`,
      stripeObjectId,
      localEntityId,
      stripeAmountPence,
      localAmountPence,
      detail: { objectType },
    };
  }

  private async reconcileLocalOrderIntegrity(findings: Finding[]) {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        subtotalPence: true,
        deliveryFeePence: true,
        serviceFeePence: true,
        discountPence: true,
        commissionPence: true,
        totalPence: true,
        vendorPayoutPence: true,
        foundingAllowanceAppliedPence: true,
        feastPassSaving: { select: { id: true } },
        attribution: { select: { resolvedSource: true } },
        orderCommission: { select: { ratePercent: true } },
      },
    });
    for (const order of orders) {
      const components = [
        order.subtotalPence,
        order.deliveryFeePence,
        order.serviceFeePence,
        order.discountPence,
        order.commissionPence,
        order.totalPence,
        order.vendorPayoutPence,
      ];
      if (components.some((amount) => amount < 0) || order.vendorPayoutPence > order.totalPence) {
        findings.push({
          kind: 'local_financial_integrity',
          fingerprint: `order-integrity:${order.id}:${components.join(':')}`,
          localEntityId: order.id,
          detail: {
            reason:
              order.vendorPayoutPence > order.totalPence
                ? 'vendor_payout_exceeds_total'
                : 'negative_financial_component',
          },
        });
      }

      const serviceFeeUnexplained =
        order.subtotalPence > 0 && order.serviceFeePence === 0 && !order.feastPassSaving;
      const commissionRate = order.orderCommission
        ? Number(order.orderCommission.ratePercent)
        : null;
      const commissionUnexplained =
        order.subtotalPence > 0 &&
        order.commissionPence === 0 &&
        order.attribution?.resolvedSource !== 'VENDOR_REFERRED' &&
        order.foundingAllowanceAppliedPence < order.subtotalPence &&
        commissionRate !== 0;
      if (serviceFeeUnexplained || commissionUnexplained) {
        findings.push({
          kind: 'zero_fee_missing_provenance',
          fingerprint: `zero-fee:${order.id}:${serviceFeeUnexplained ? 'service' : ''}:${commissionUnexplained ? 'commission' : ''}`,
          localEntityId: order.id,
          detail: { serviceFeeUnexplained, commissionUnexplained },
        });
      }
    }
  }

  private async recordFinding(finding: Finding, now: Date) {
    await this.prisma.financialReconciliationFinding.upsert({
      where: { fingerprint: finding.fingerprint },
      create: {
        ...finding,
        detail: finding.detail ?? Prisma.JsonNull,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        lastSeenAt: now,
        resolvedAt: null,
        stripeAmountPence: finding.stripeAmountPence,
        localAmountPence: finding.localAmountPence,
        detail: finding.detail ?? Prisma.JsonNull,
      },
    });
  }
}
