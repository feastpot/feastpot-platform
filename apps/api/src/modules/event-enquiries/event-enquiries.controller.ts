import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';

import { ConfirmNumbersDto } from './dto/confirm-numbers.dto';
import { CreateEventEnquiryDto } from './dto/create-enquiry.dto';
import { ListEventEnquiriesDto } from './dto/list-enquiries.dto';
import { SelectVendorDto } from './dto/select-vendor.dto';
import { SubmitQuoteDto } from './dto/submit-quote.dto';
import { EventEnquiriesService } from './event-enquiries.service';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('EventEnquiries')
@ApiBearerAuth()
@Controller({ path: 'event-enquiries', version: '1' })
export class EventEnquiriesController {
  constructor(private readonly enquiries: EventEnquiriesService) {}

  @Get()
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'List event enquiries scoped by role' })
  list(@Req() req: AuthedRequest, @Query() dto: ListEventEnquiriesDto) {
    return this.enquiries.list(requireUser(req), dto);
  }

  @Post()
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Create an event enquiry (triggers vendor matching)' })
  create(@Req() req: AuthedRequest, @Body() dto: CreateEventEnquiryDto) {
    return this.enquiries.create(requireUser(req).id, dto);
  }

  @Get(':id')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get enquiry with submitted quotes' })
  get(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.enquiries.getById(id, requireUser(req));
  }

  @Post(':id/select-vendor')
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Select a vendor quote and create deposit PaymentIntent' })
  selectVendor(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SelectVendorDto,
  ) {
    return this.enquiries.selectVendor(id, requireUser(req).id, dto);
  }

  @Post(':id/confirm-deposit')
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Finalize booking after Stripe deposit succeeded (verifies PI server-side)' })
  confirmDeposit(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.enquiries.confirmDeposit(id, requireUser(req).id);
  }

  @Patch(':id/confirm-numbers')
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Confirm final guest numbers (recalculates balance)' })
  confirmNumbers(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmNumbersDto,
  ) {
    return this.enquiries.confirmNumbers(id, requireUser(req).id, dto);
  }

  @Post(':id/quotes')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Submit a quote against this enquiry (vendor)' })
  submitQuote(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SubmitQuoteDto,
  ) {
    return this.enquiries.submitQuote(id, requireUser(req), dto);
  }
}
