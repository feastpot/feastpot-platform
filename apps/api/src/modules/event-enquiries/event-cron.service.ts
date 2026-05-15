import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EnquiryStatus, QuoteStatus } from '@prisma/client';

import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { NotificationsService } from '../notifications/notifications.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Hourly cron jobs for the event flow:
 *  - 72h reminder to confirm final guest numbers
 *  - 48h balance PaymentIntent + customer payment link
 *
 * Both windows are matched as `eventDate ∈ [now+target-1h, now+target+1h]` so
 * a single missed cron tick (Redis blip, redeploy) doesn't permanently skip
 * an enquiry.
 */
@Injectable()
export class EventCronService {
  private readonly logger = new Logger(EventCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
    private readonly cache: RedisCacheService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'event-reminder-72h' })
  async eventReminder72h() {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable — skipping event-reminder-72h tick');
      return;
    }
    const now = Date.now();
    const lower = new Date(now + 71 * HOUR_MS);
    const upper = new Date(now + 73 * HOUR_MS);
    const enquiries = await this.prisma.eventEnquiry.findMany({
      where: { status: EnquiryStatus.confirmed, eventDate: { gte: lower, lte: upper } },
      select: { id: true, customerId: true, eventDate: true, guestCount: true },
    });
    if (enquiries.length === 0) return;
    this.logger.log(`event-reminder-72h: ${enquiries.length} enquiries`);
    await Promise.all(
      enquiries.map((e) =>
        this.notifications.enqueue(
          'event_reminder_72h',
          {
            userId: e.customerId,
            enquiryId: e.id,
            eventDate: e.eventDate.toISOString(),
            guestCount: e.guestCount,
          },
          { jobId: `event_reminder_72h:${e.id}` },
        ),
      ),
    );
  }

  /**
   * D16 (S2): expire enquiries that received no quote within the
   * 48h SLA window. Runs every 6 hours — finer granularity isn't
   * useful because the SLA is measured in days. Status 'expired'
   * (vs 'cancelled') preserves the distinction in analytics between
   * "vendor unresponsive" and "customer/vendor changed their mind".
   *
   * Idempotency: the WHERE clause already filters out non-`open`
   * enquiries, so re-running this cron after a Redis blip is safe —
   * an already-expired row is no longer `open`, won't match again,
   * and the customer won't get a duplicate "expired" email.
   */
  @Cron(CronExpression.EVERY_6_HOURS, { name: 'enquiries-expire-stale' })
  async expireStaleEnquiries() {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable — skipping enquiries-expire-stale tick');
      return;
    }
    const SLA_HOURS = 48;
    const expiryThreshold = new Date(Date.now() - SLA_HOURS * HOUR_MS);

    const stale = await this.prisma.eventEnquiry.findMany({
      where: { status: EnquiryStatus.open, createdAt: { lt: expiryThreshold } },
      select: { id: true, customerId: true, eventDate: true },
    });
    if (stale.length === 0) return;

    let expired = 0;
    for (const e of stale) {
      // Conditional update: re-check status at write time to avoid
      // racing the customer hitting "cancel" or a vendor finally quoting
      // between the SELECT above and this UPDATE.
      const claim = await this.prisma.eventEnquiry.updateMany({
        where: { id: e.id, status: EnquiryStatus.open },
        data: { status: EnquiryStatus.expired },
      });
      if (claim.count === 0) continue;
      expired += 1;
      // Notify the customer via the standard NotificationsService pipeline
      // so the email/push channel resolution is consistent with the rest
      // of the app (resolves recipient via userId; bypasses raw queue).
      await this.notifications.enqueue(
        'enquiry_expired',
        {
          userId: e.customerId,
          enquiryId: e.id,
          eventDate: e.eventDate.toISOString(),
        },
        { jobId: `enquiry_expired:${e.id}` },
      );
    }
    this.logger.log(`enquiries-expire-stale: expired ${expired} of ${stale.length} candidate enquiries`);
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'event-balance-48h' })
  async eventBalance48h() {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable — skipping event-balance-48h tick');
      return;
    }
    const now = Date.now();
    const lower = new Date(now + 47 * HOUR_MS);
    const upper = new Date(now + 49 * HOUR_MS);
    const enquiries = await this.prisma.eventEnquiry.findMany({
      where: {
        status: EnquiryStatus.confirmed,
        eventDate: { gte: lower, lte: upper },
        balancePiId: null,
      },
      include: { quotes: { where: { status: QuoteStatus.accepted } } },
    });
    if (enquiries.length === 0) return;
    this.logger.log(`event-balance-48h: ${enquiries.length} enquiries`);

    for (const e of enquiries) {
      const accepted = e.quotes[0];
      if (!accepted) continue;
      const guestCount = e.finalGuestCount ?? e.guestCount;
      const finalTotal = accepted.perHeadPence * guestCount + accepted.deliveryFeePence;
      const depositPct = accepted.minDepositPct || 30;
      const depositPaid = Math.round(
        (accepted.perHeadPence * e.guestCount + accepted.deliveryFeePence) * depositPct / 100,
      );
      const balance = Math.max(0, finalTotal - depositPaid);
      if (balance <= 0) continue;
      try {
        const pi = await this.stripe.createPaymentIntentGeneric({
          amountPence: balance,
          captureMethod: 'manual',
          // Same metadata + amount as confirmNumbers so the shared idempotency
          // key 'event_balance:<enquiryId>' returns the existing PI cleanly
          // instead of throwing a Stripe idempotency conflict.
          metadata: { enquiryId: e.id, customerId: e.customerId, kind: 'event_balance' },
          idempotencyKey: `event_balance:${e.id}`,
        });
        // Conditional claim — if confirmNumbers / a parallel cron beat us,
        // cancel the duplicate PI rather than orphaning two on Stripe.
        const claim = await this.prisma.eventEnquiry.updateMany({
          where: { id: e.id, balancePiId: null },
          data: { balancePiId: pi.id },
        });
        if (claim.count === 0) {
          await this.stripe.cancel(pi.id).catch((err2) =>
            this.logger.warn(`event-balance-48h: failed to cancel orphan PI ${pi.id}: ${(err2 as Error).message}`),
          );
          continue;
        }
        await this.notifications.enqueue(
          'event_balance_link',
          {
            userId: e.customerId,
            enquiryId: e.id,
            balancePence: balance,
            paymentIntentId: pi.id,
          },
          { jobId: `event_balance_link:${e.id}` },
        );
      } catch (err) {
        this.logger.error(`event-balance-48h failed for ${e.id}: ${(err as Error).message}`);
      }
    }
  }
}
