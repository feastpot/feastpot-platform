import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { FeastPassPlan, FeastPassStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Stripe from 'stripe';

import { EmailProvider } from '../modules/notifications/providers/email.provider';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class FeastPassService {
  private readonly logger = new Logger(FeastPassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly email: EmailProvider,
  ) {}

  // ---------------------------------------------------------------------------
  // Membership checks
  // ---------------------------------------------------------------------------

  async isMember(userId: string): Promise<boolean> {
    const sub = await this.prisma.feastPassSubscription.findUnique({
      where: { userId },
      select: { status: true },
    });
    return sub?.status === FeastPassStatus.ACTIVE;
  }

  async getMembership(userId: string) {
    const [sub, savings] = await Promise.all([
      this.prisma.feastPassSubscription.findUnique({
        where: { userId },
        select: {
          id: true,
          plan: true,
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          startedAt: true,
          cancelledAt: true,
        },
      }),
      this.prisma.feastPassSaving.aggregate({
        where: { userId },
        _sum: { savedPence: true },
        _count: { id: true },
      }),
    ]);

    return {
      subscription: sub,
      savings: {
        totalSavedPence: savings._sum.savedPence ?? 0,
        orderCount: savings._count.id,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Stripe Checkout / Portal
  // ---------------------------------------------------------------------------

  async createCheckoutSession(
    userId: string,
    email: string,
    plan: 'MONTHLY' | 'ANNUAL',
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ url: string }> {
    // Reuse stripeCustomerId if an existing subscription exists (even cancelled)
    const existing = await this.prisma.feastPassSubscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, status: true },
    });
    if (existing?.status === FeastPassStatus.ACTIVE) {
      throw new BadRequestException({ code: 'ALREADY_MEMBER', message: 'Already an active FeastPass member' });
    }

    const stripeCustomerId = existing?.stripeCustomerId
      ?? await this.stripe.createBillingCustomer(email, { userId });

    const priceId =
      plan === 'ANNUAL'
        ? (process.env.STRIPE_FEASTPASS_ANNUAL_PRICE_ID ?? '')
        : (process.env.STRIPE_FEASTPASS_MONTHLY_PRICE_ID ?? '');

    if (!priceId) {
      throw new BadRequestException({ code: 'PRICE_NOT_CONFIGURED', message: 'FeastPass price not configured' });
    }

    const session = await this.stripe.createCheckoutSession({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: { metadata: { userId } },
      allow_promotion_codes: true,
    });

    return { url: session.url! };
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
    const sub = await this.prisma.feastPassSubscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub) {
      throw new NotFoundException({ code: 'NO_SUBSCRIPTION', message: 'No FeastPass subscription found' });
    }

    const session = await this.stripe.createBillingPortalSession({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // ---------------------------------------------------------------------------
  // FeastPass saving recorder (called from OrdersService)
  // ---------------------------------------------------------------------------

  async recordSaving(userId: string, orderId: string, savedPence: number): Promise<void> {
    if (savedPence <= 0) return;
    try {
      await this.prisma.feastPassSaving.upsert({
        where: { orderId },
        create: { userId, orderId, savedPence },
        update: {},
      });
    } catch (err) {
      // Best-effort: never block order creation
      this.logger.error(`Failed to record FeastPass saving orderId=${orderId}: ${String(err)}`);
      Sentry.captureException(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook handlers
  // ---------------------------------------------------------------------------

  /** Upsert subscription state from any subscription.created / .updated event. */
  async handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
    const userId: string | undefined = (sub.metadata?.userId as string | undefined)
      ?? await this.userIdFromCustomer(sub.customer as string);

    if (!userId) {
      this.logger.warn(`FeastPass webhook: no userId for subscription ${sub.id}`);
      return;
    }

    const status = this.mapStripeStatus(sub.status);
    const plan = this.planFromPriceId(sub.items.data[0]?.price.id ?? '');

    await this.prisma.feastPassSubscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: sub.customer as string,
        plan,
        status,
        currentPeriodStart: new Date((sub.current_period_start) * 1000),
        currentPeriodEnd: new Date((sub.current_period_end) * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
      update: {
        stripeSubscriptionId: sub.id,
        stripeCustomerId: sub.customer as string,
        plan,
        status,
        currentPeriodStart: new Date((sub.current_period_start) * 1000),
        currentPeriodEnd: new Date((sub.current_period_end) * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : undefined,
      },
    });

    this.logger.log(`FeastPass subscription upserted userId=${userId} status=${status}`);
  }

  async handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const userId = (sub.metadata?.userId as string | undefined)
      ?? await this.userIdFromCustomer(sub.customer as string);
    if (!userId) return;

    await this.prisma.feastPassSubscription.updateMany({
      where: { userId },
      data: {
        status: FeastPassStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelAtPeriodEnd: false,
      },
    });

    // Email: membership cancelled
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
    if (user) {
      await this.email.send({
        to: user.email,
        subject: 'Your FeastPass has been cancelled',
        html: cancelledEmail(user.firstName),
      }).catch((e) => this.logger.error(`FeastPass cancelled email failed: ${String(e)}`));
    }

    this.logger.log(`FeastPass subscription cancelled userId=${userId}`);
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const sub = await this.prisma.feastPassSubscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true, status: true },
    });
    if (!sub) return;

    // Move to PAST_DUE only if currently ACTIVE (grace period starts)
    if (sub.status === FeastPassStatus.ACTIVE) {
      await this.prisma.feastPassSubscription.updateMany({
        where: { stripeCustomerId: customerId },
        data: { status: FeastPassStatus.PAST_DUE },
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: sub.userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      await this.email.send({
        to: user.email,
        subject: 'FeastPass payment failed: update your card',
        html: paymentFailedEmail(user.firstName),
      }).catch((e) => this.logger.error(`FeastPass payment-failed email failed: ${String(e)}`));
    }

    this.logger.log(`FeastPass payment failed customerId=${customerId}`);
  }

  async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    // Re-activate if was PAST_DUE (successful retry)
    await this.prisma.feastPassSubscription.updateMany({
      where: { stripeCustomerId: customerId, status: FeastPassStatus.PAST_DUE },
      data: { status: FeastPassStatus.ACTIVE },
    });
  }

  // ---------------------------------------------------------------------------
  // Admin health stats
  // ---------------------------------------------------------------------------

  async adminHealthStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      activeCount,
      pastDueCount,
      cancelledThisMonth,
      totalMembers,
      savings,
      memberOrders,
      nonMemberOrders,
    ] = await Promise.all([
      this.prisma.feastPassSubscription.count({ where: { status: FeastPassStatus.ACTIVE } }),
      this.prisma.feastPassSubscription.count({ where: { status: FeastPassStatus.PAST_DUE } }),
      this.prisma.feastPassSubscription.count({
        where: { status: FeastPassStatus.CANCELLED, cancelledAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.feastPassSubscription.count(),
      this.prisma.feastPassSaving.aggregate({
        _sum: { savedPence: true },
        _count: { id: true },
      }),
      // Orders by members in last 30 days
      this.prisma.feastPassSaving.count({ where: { savedAt: { gte: thirtyDaysAgo } } }),
      // Proxy for non-member order count: total orders in last 30 days minus member orders
      this.prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo }, serviceFeePence: { gt: 0 } } }),
    ]);

    // Monthly revenue from FeastPass
    const monthlyRevenue = activeCount * 399; // £3.99 in pence, approximate
    const annualRevenue = activeCount * 3990; // adjust for actual mix

    // Cohort churn: subs started 30-60 days ago that cancelled
    const [cohortStarted, cohortCancelled] = await Promise.all([
      this.prisma.feastPassSubscription.count({
        where: { startedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      this.prisma.feastPassSubscription.count({
        where: {
          startedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          status: { in: [FeastPassStatus.CANCELLED, FeastPassStatus.EXPIRED] },
        },
      }),
    ]);

    const churnRate = cohortStarted > 0 ? (cohortCancelled / cohortStarted) * 100 : 0;
    const renewalRate = 100 - churnRate;

    return {
      activeCount,
      pastDueCount,
      cancelledThisMonth,
      totalMembers,
      renewalRate: Math.round(renewalRate * 10) / 10,
      churnRate: Math.round(churnRate * 10) / 10,
      cohortCancelledCount: cohortCancelled,
      cohortStartedCount: cohortStarted,
      totalSavedPence: savings._sum.savedPence ?? 0,
      totalSavingsOrders: savings._count.id,
      avgSavingPerMemberPence:
        activeCount > 0 ? Math.round((savings._sum.savedPence ?? 0) / Math.max(totalMembers, 1)) : 0,
      memberOrdersLast30d: memberOrders,
      nonMemberOrdersLast30d: nonMemberOrders,
      belowRenewalThreshold: renewalRate < 80,
      estimatedMonthlyRevenuePence: monthlyRevenue,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapStripeStatus(stripeStatus: string): FeastPassStatus {
    switch (stripeStatus) {
      case 'active':
      case 'trialing':
        return FeastPassStatus.ACTIVE;
      case 'past_due':
        return FeastPassStatus.PAST_DUE;
      case 'canceled':
      case 'unpaid':
        return FeastPassStatus.CANCELLED;
      default:
        return FeastPassStatus.EXPIRED;
    }
  }

  private planFromPriceId(priceId: string): FeastPassPlan {
    if (priceId === (process.env.STRIPE_FEASTPASS_ANNUAL_PRICE_ID ?? '__annual__')) {
      return FeastPassPlan.ANNUAL;
    }
    return FeastPassPlan.MONTHLY;
  }

  private async userIdFromCustomer(customerId: string): Promise<string | undefined> {
    const sub = await this.prisma.feastPassSubscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    return sub?.userId;
  }
}

// ---------------------------------------------------------------------------
// Email templates (inline; no outbox needed, these fire once on lifecycle events)
// ---------------------------------------------------------------------------

function cancelledEmail(firstName: string | null): string {
  const name = firstName ?? 'there';
  return `
<p>Hi ${name},</p>
<p>Your <strong>FeastPass</strong> membership has been cancelled. You'll keep your benefits until the end of the current billing period.</p>
<p>If you change your mind, you can rejoin any time at <a href="https://feastpot.co.uk/feastpass">feastpot.co.uk/feastpass</a>.</p>
<p>The Feastpot team</p>
`;
}

function paymentFailedEmail(firstName: string | null): string {
  const name = firstName ?? 'there';
  return `
<p>Hi ${name},</p>
<p>We couldn't collect your <strong>FeastPass</strong> subscription payment. Your membership is in a 3-day grace period. Please update your payment method to keep your benefits.</p>
<p><a href="https://feastpot.co.uk/account/feastpass">Manage your membership →</a></p>
<p>The Feastpot team</p>
`;
}
