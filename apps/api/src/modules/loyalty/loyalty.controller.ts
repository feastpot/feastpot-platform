import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import type { AuthUser } from '../../auth/types';

import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

const SHARE_BASE_URL = 'https://feastpot.co.uk/join';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller({ version: '1', path: 'loyalty' })
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
  ) {}

  @Get('points')
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

  @Public()
  @Get('referrals/validate')
  @ApiOperation({ summary: 'Verify a shared referral code before /join persists it client-side' })
  async validateReferral(@Query('code') code?: string) {
    // Length guard mirrors the public-facing rule on /join: anything shorter
    // than 4 chars is structurally not one of our 8-char codes (or a 4-char
    // suffix variant) and we'd rather 400 than burn a DB round-trip.
    if (!code || code.trim().length < 4) {
      throw new BadRequestException({ code: 'INVALID_REFERRAL_CODE', message: 'Invalid code' });
    }
    const result = await this.referrals.validateCode(code);
    if (!result) {
      throw new NotFoundException({
        code: 'REFERRAL_NOT_FOUND',
        message: 'Referral code not found or expired',
      });
    }
    return {
      valid: true,
      referrerFirstName: result.referrerFirstName,
      // Keep the bonus literal in lock-step with REWARD_POINTS in
      // ReferralService — surfacing it here lets the /join page render
      // an accurate "you'll get £5" line without a second round-trip.
      bonusPence: 500,
    };
  }

  private requireUser(user: AuthUser | null): AuthUser {
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
