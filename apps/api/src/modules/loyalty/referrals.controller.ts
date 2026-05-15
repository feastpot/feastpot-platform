import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/decorators/public.decorator';

import { ReferralService } from './referral.service';

/**
 * Public referral routes mounted at the spec-canonical path `/v1/referrals`.
 *
 * The same handler is also reachable at `/v1/loyalty/referrals/validate`
 * via LoyaltyController. Both routes delegate to ReferralService.validateCode
 * so they cannot drift — this controller exists purely to satisfy the public
 * URL contract documented in the integration spec without forcing the loyalty
 * UI (which already uses the /loyalty-prefixed path) to change.
 */
@ApiTags('Referrals')
@Controller({ version: '1', path: 'referrals' })
export class ReferralsController {
  constructor(private readonly referralService: ReferralService) {}

  @Public()
  @Get('validate')
  @ApiOperation({ summary: 'Verify a shared referral code before /join persists it client-side' })
  async validateCode(@Query('code') code?: string) {
    if (!code || code.trim().length < 4) {
      throw new BadRequestException({ code: 'INVALID_REFERRAL_CODE', message: 'Invalid code' });
    }
    const result = await this.referralService.validateCode(code);
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
