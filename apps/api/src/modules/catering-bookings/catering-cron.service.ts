import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CateringBookingStatus } from '@prisma/client';

import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

import { CateringBookingsService } from './catering-bookings.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Hourly cron jobs for the catering booking lifecycle:
 *  - Expire QUOTED bookings past their quoteExpiresAt
 *  - Create balance PaymentIntent + send customer payment link 48h before event
 *  - Complete booking and release vendor payout 24h after event
 *
 * All windows use a ±1h band so a single missed tick doesn't permanently skip
 * a booking. All operations are idempotent via conditional updates.
 */
@Injectable()
export class CateringCronService {
  private readonly logger = new Logger(CateringCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: CateringBookingsService,
    private readonly cache: RedisCacheService,
  ) {}

  /** Expire QUOTED bookings whose quoteExpiresAt has passed. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'catering-expire-quotes' })
  async expireQuotes() {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping catering-expire-quotes');
      return;
    }
    const stale = await this.prisma.cateringBooking.findMany({
      where: {
        status: CateringBookingStatus.QUOTED,
        quoteExpiresAt: { lt: new Date() },
      },
      select: { id: true },
    });
    if (stale.length === 0) return;

    let expired = 0;
    for (const b of stale) {
      const claim = await this.prisma.cateringBooking.updateMany({
        where: { id: b.id, status: CateringBookingStatus.QUOTED },
        data: { status: CateringBookingStatus.EXPIRED },
      });
      if (claim.count > 0) expired += 1;
    }
    this.logger.log(`catering-expire-quotes: expired ${expired} of ${stale.length} bookings`);
  }

  /** Create balance PI and send payment link to customers 48h before event. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'catering-balance-48h' })
  async balanceCharge48h() {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping catering-balance-48h');
      return;
    }
    const now = Date.now();
    const lower = new Date(now + 47 * HOUR_MS);
    const upper = new Date(now + 49 * HOUR_MS);

    const bookings = await this.prisma.cateringBooking.findMany({
      where: {
        status: CateringBookingStatus.CONFIRMED,
        eventDate: { gte: lower, lte: upper },
        balancePiId: null,
      },
      select: {
        id: true,
        balancePence: true,
        vendorId: true,
        customerId: true,
        customerEmail: true,
        customerName: true,
        eventDate: true,
        balancePiId: true,
      },
    });
    if (bookings.length === 0) return;
    this.logger.log(`catering-balance-48h: ${bookings.length} bookings`);

    for (const b of bookings) {
      try {
        await this.bookings.scheduleBalanceCharge(b);
      } catch (err) {
        this.logger.error(`catering-balance-48h failed for ${b.id}: ${String(err)}`);
      }
    }
  }

  /** Complete bookings 24h after event date - release vendor payout. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'catering-complete-24h' })
  async complete24hPostEvent() {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping catering-complete-24h');
      return;
    }
    const now = Date.now();
    // Event date + 24h - 1h window means event date is in [now-25h, now-23h]
    const upper = new Date(now - 23 * HOUR_MS);
    const lower = new Date(now - 25 * HOUR_MS);

    const bookings = await this.prisma.cateringBooking.findMany({
      where: {
        status: CateringBookingStatus.BALANCE_PAID,
        eventDate: { gte: lower, lte: upper },
        completedAt: null,
      },
      select: { id: true },
    });
    if (bookings.length === 0) return;
    this.logger.log(`catering-complete-24h: ${bookings.length} bookings`);

    for (const b of bookings) {
      try {
        await this.bookings.completeBooking(b.id);
      } catch (err) {
        this.logger.error(`catering-complete-24h failed for ${b.id}: ${String(err)}`);
      }
    }
  }
}
