import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('Waitlist')
@Controller({ path: 'waitlist', version: '1' })
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  /**
   * Public postcode waitlist signup. Rate-limited to 5 per 10 minutes per
   * IP (anonymous users); honeypot field silently swallows bots.
   */
  @Public()
  @Post()
  @Throttle({ long: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Sign up for postcode waitlist notification (public)' })
  register(@Body() dto: CreateWaitlistDto) {
    return this.waitlist.register(dto);
  }

  @Get('demand')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: waitlist demand grouped by outward code (count desc)' })
  demand() {
    return this.waitlist.getDemand();
  }

  @Get()
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: paginated waitlist signups' })
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.waitlist.list({ cursor, limit: limit ? parseInt(limit, 10) : undefined });
  }
}
