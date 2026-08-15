import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { AuthUser } from '../auth/types';

import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { FeastPassService } from './feastpass.service';

@Controller({ version: '1' })
export class FeastPassController {
  constructor(private readonly feastpass: FeastPassService) {}

  // ---------------------------------------------------------------------------
  // Customer routes
  // ---------------------------------------------------------------------------

  /** Current membership status + cumulative savings for the account page. */
  @Get('feastpass/me')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('customer', 'admin')
  async getMyMembership(@CurrentUser() user: AuthUser) {
    return this.feastpass.getMembership(user.id);
  }

  /** How much the customer would have saved with FeastPass (non-member conversion). */
  @Get('feastpass/savings-potential')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('customer', 'admin')
  async getSavingsPotential(@CurrentUser() user: AuthUser) {
    return this.feastpass.getSavingsPotential(user.id);
  }

  /** Create a Stripe Checkout Session to start a subscription. */
  @Post('feastpass/checkout')
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('customer', 'admin')
  async createCheckout(@CurrentUser() user: AuthUser, @Body() dto: CreateCheckoutSessionDto) {
    return this.feastpass.createCheckoutSession(
      user.id,
      user.email,
      dto.plan,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  /** Create a Stripe Billing Portal session (manage / cancel). */
  @Post('feastpass/portal')
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('customer', 'admin')
  async createPortal(@CurrentUser() user: AuthUser, @Body() dto: CreatePortalSessionDto) {
    return this.feastpass.createPortalSession(user.id, dto.returnUrl);
  }

  // ---------------------------------------------------------------------------
  // Admin routes
  // ---------------------------------------------------------------------------

  @Get('admin/feastpass/health')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('admin', 'finance')
  async adminHealth() {
    return this.feastpass.adminHealthStats();
  }
}
