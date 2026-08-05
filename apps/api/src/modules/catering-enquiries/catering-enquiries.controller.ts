import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

import { CateringEnquiriesService } from './catering-enquiries.service';
import { CreateCateringEnquiryDto } from './dto/create-catering-enquiry.dto';

@ApiTags('CateringEnquiries')
@Controller({ path: 'catering-enquiries', version: '1' })
export class CateringEnquiriesController {
  constructor(private readonly enquiries: CateringEnquiriesService) {}

  @Public()
  @Post()
  @Throttle({ long: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Submit a public catering enquiry (no auth required)' })
  create(@Body() dto: CreateCateringEnquiryDto) {
    return this.enquiries.create(dto);
  }

  @Get()
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: list catering enquiries' })
  list(
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.enquiries.list({
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: get catering enquiry detail' })
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.enquiries.getById(id);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Admin: update enquiry status / notes' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status: string; adminNotes?: string },
  ) {
    return this.enquiries.updateStatus(id, body.status, body.adminNotes);
  }
}
