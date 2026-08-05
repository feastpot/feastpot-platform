import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

import { CreateVendorRecommendationDto } from './dto/create-vendor-recommendation.dto';
import { VendorRecommendationsService } from './vendor-recommendations.service';

@ApiTags('VendorRecommendations')
@Controller({ path: 'vendor-recommendations', version: '1' })
export class VendorRecommendationsController {
  constructor(private readonly recs: VendorRecommendationsService) {}

  @Public()
  @Post()
  @Throttle({ long: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Submit a vendor recommendation (public)' })
  create(@Body() dto: CreateVendorRecommendationDto) {
    return this.recs.create(dto);
  }

  @Get()
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: list vendor recommendations' })
  list(
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recs.list({
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: update recommendation status / notes' })
  update(@Param('id') id: string, @Body() body: { status: string; adminNotes?: string }) {
    return this.recs.updateStatus(id, body.status, body.adminNotes);
  }
}
