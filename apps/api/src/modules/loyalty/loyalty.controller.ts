import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import type { AuthUser } from '../../auth/types';

import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

const SHARE_BASE_URL = 'https://feastpot.co.uk/join';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller({ version: '1', path: 'loyalty' })
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.customer, UserRole.admin)
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
  ) {}

  @Get('points')
  @ApiOperation({ summary: 'Loyalty balance + recent ledger for the calling user' })
  async getMyLoyalty(@CurrentUser() user: AuthUser) {
    const [balance, history] = await Promise.all([
      this.loyalty.getBalance(user.id),
      this.loyalty.getHistory(user.id),
    ]);
    return { balance, worthPence: balance, history };
  }

  @Get('referrals')
  @ApiOperation({ summary: 'Personal referral code, share URL, and referred-friend list' })
  async getMyReferrals(@CurrentUser() user: AuthUser) {
    const code = await this.referrals.ensureCode(user.id);
    const referrals = await this.referrals.listForUser(user.id);
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
      bonusPence: 500,
    };
  }
}
