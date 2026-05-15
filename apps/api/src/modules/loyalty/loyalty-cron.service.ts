import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { LoyaltyService } from './loyalty.service';

/**
 * Nightly sweep at 00:30 UTC: expire any earned points whose 12-month
 * window has lapsed. Idempotent — already-expired rows have their
 * `expiresAt` cleared so this won't double-process.
 */
@Injectable()
export class LoyaltyCronService {
  private readonly logger = new Logger(LoyaltyCronService.name);

  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly cache: RedisCacheService,
  ) {}

  @Cron('30 0 * * *', { name: 'expire-loyalty-points' })
  async runExpiry() {
    // Loyalty expiry only runs on the leader pod — without a working
    // Redis-backed lock there's no way to prevent every replica from
    // double-debiting the same points rows. Skip cleanly when Redis
    // is unavailable.
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable — skipping loyalty expiry sweep');
      return;
    }
    const { processed } = await this.loyalty.expirePoints();
    this.logger.log(`Loyalty expiry sweep complete (${processed} rows expired)`);
  }
}
