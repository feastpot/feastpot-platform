import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types';

import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

const SHARE_BASE_URL = 'https://feastpot.co.uk/join';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller({ version: '1' })
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
  ) {}

  @Get('loyalty-points')
  @ApiOperation({ summary: 'Loyalty balance + recent ledger for the calling user' })
  async getMyLoyalty(@CurrentUser() user: AuthUser | null) {
    const u = this.requireUser(user);
    const [balance, history] = await Promise.all([
      this.loyalty.getBalance(u.id),
      this.loyalty.getHistory(u.id),
    ]);
    return { balance, worthPence: balance, history };
  }

  @Get('referrals')
  @ApiOperation({ summary: 'Personal referral code, share URL, and referred-friend list' })
  async getMyReferrals(@CurrentUser() user: AuthUser | null) {
    const u = this.requireUser(user);
    const code = await this.referrals.ensureCode(u.id);
    const referrals = await this.referrals.listForUser(u.id);
    const totalEarnedPence = referrals
      .filter((r) => r.status === 'rewarded')
      .reduce((sum, r) => sum + (r.rewardPence ?? 0), 0);
    return {
      referralCode: code,
      shareUrl: `${SHARE_BASE_URL}?ref=${encodeURIComponent(code)}`,
      referrals,
      totalEarnedPence,
    };
  }

  private requireUser(user: AuthUser | null): AuthUser {
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
