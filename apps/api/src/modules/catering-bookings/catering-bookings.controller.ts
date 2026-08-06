import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';

import { CateringBookingsService } from './catering-bookings.service';
import { CancelCateringBookingDto } from './dto/cancel-catering-booking.dto';
import { ConfirmBalanceDto } from './dto/confirm-balance.dto';
import { ConfirmDepositDto } from './dto/confirm-deposit.dto';
import { CreateCateringBookingDto } from './dto/create-catering-booking.dto';

@Controller({ path: 'catering-bookings', version: '1' })
export class CateringBookingsController {
  constructor(private readonly service: CateringBookingsService) {}

  // ── Vendor: create quote ───────────────────────────────────────────────────

  @Post()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.vendor)
  createQuote(@CurrentUser() user: AuthUser, @Body() dto: CreateCateringBookingDto) {
    return this.service.createQuote(user, dto);
  }

  // ── Vendor: list own bookings ──────────────────────────────────────────────

  @Get('mine')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.vendor)
  listMine(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    // Resolve the vendor's id from their userId
    return this.service.listForVendorByUserId(user.id, {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ── Vendor / admin: send quote to customer ─────────────────────────────────

  @Post(':id/send-quote')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.vendor, UserRole.admin, UserRole.support)
  sendQuote(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.sendQuote(id, user);
  }

  // ── Public: initiate deposit payment (customer clicks link) ───────────────

  @Post(':id/deposit')
  initiateDeposit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.initiateDeposit(id);
  }

  // ── Public: confirm deposit after Stripe redirect ──────────────────────────

  @Post(':id/confirm-deposit')
  confirmDeposit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDepositDto,
  ) {
    return this.service.confirmDeposit(id, dto.paymentIntentId);
  }

  // ── Public: confirm balance payment ───────────────────────────────────────

  @Post(':id/confirm-balance')
  confirmBalance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmBalanceDto,
  ) {
    return this.service.confirmBalance(id, dto.paymentIntentId);
  }

  // ── Public: track QR scan + redirect ──────────────────────────────────────

  @Post(':id/qr-scan')
  trackQrScan(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.trackQrScan(id);
  }

  // ── Customer / vendor / admin: cancel ─────────────────────────────────────

  @Post(':id/cancel')
  @UseGuards(SupabaseAuthGuard)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCateringBookingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelBooking(id, dto, user);
  }

  // ── Admin: list all ────────────────────────────────────────────────────────

  @Get()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.support, UserRole.finance)
  listAll(
    @Query('status') status?: string,
    @Query('vendorId') vendorId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listForAdmin({
      status,
      vendorId,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ── Auth: get by id ────────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(SupabaseAuthGuard)
  getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getById(id, user);
  }
}
