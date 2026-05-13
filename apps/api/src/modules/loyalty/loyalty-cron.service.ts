import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { LoyaltyService } from './loyalty.service';

/**
 * Nightly sweep at 00:30 UTC: expire any earned points whose 12-month
 * window has lapsed. Idempotent — already-expired rows have their
 * `expiresAt` cleared so this won't double-process.
 */
@Injectable()
export class LoyaltyCronService {
  private readonly logger = new Logger(LoyaltyCronService.name);

  constructor(private readonly loyalty: LoyaltyService) {}

  @Cron('30 0 * * *', { name: 'expire-loyalty-points' })
  async runExpiry() {
    const { processed } = await this.loyalty.expirePoints();
    this.logger.log(`Loyalty expiry sweep complete (${processed} rows expired)`);
  }
}
