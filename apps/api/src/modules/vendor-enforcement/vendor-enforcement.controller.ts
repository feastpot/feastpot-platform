import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

import {
  CreateEnforcementActionDto,
  LiftEnforcementActionDto,
} from './dto/create-enforcement-action.dto';
import { VendorEnforcementService } from './vendor-enforcement.service';

@Controller()
export class VendorEnforcementController {
  constructor(private readonly enforcement: VendorEnforcementService) {}

  // ── Admin endpoints ───────────────────────────────────────────────────────

  /**
   * GET /admin/vendors/:id/enforcement
   * Full enforcement history for a vendor.
   * Accessible by admin, compliance, and support roles.
   */
  @Get('admin/vendors/:id/enforcement')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('admin', 'compliance', 'support')
  getActions(@Param('id') vendorId: string) {
    return this.enforcement.getActions(vendorId);
  }

  /**
   * POST /admin/vendors/:id/enforcement
   * Create a new P2B-compliant enforcement action.
   * Accessible by admin and compliance roles only.
   *
   * All four business rules are enforced in the service:
   *   1. reasonNarrative >= 50 chars
   *   2. Non-urgent: effectiveAt >= now
   *   3. Urgent: urgentBasis required
   *   4. TERMINATION non-serious: effectiveAt >= now + 30 days
   */
  @Post('admin/vendors/:id/enforcement')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('admin', 'compliance')
  async createAction(
    @Param('id') vendorId: string,
    @Body() dto: CreateEnforcementActionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.enforcement.createAction(vendorId, dto, actor.email ?? actor.id);
  }

  /**
   * PATCH /admin/vendors/:id/enforcement/:actionId/lift
   * Lift (revoke) an active enforcement action.
   * Restores the vendor's prior status automatically.
   */
  @Patch('admin/vendors/:id/enforcement/:actionId/lift')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('admin', 'compliance')
  async liftAction(
    @Param('id') _vendorId: string,
    @Param('actionId') actionId: string,
    @Body() dto: LiftEnforcementActionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.enforcement.liftAction(actionId, actor.email ?? actor.id, dto.liftNote);
  }

  // ── Vendor endpoints ──────────────────────────────────────────────────────

  /**
   * GET /vendors/enforcement
   * Returns active enforcement actions for the requesting vendor.
   * Used by the vendor account-status page.
   * A suspended vendor can always see why.
   */
  @Get('vendors/enforcement')
  @UseGuards(SupabaseAuthGuard)
  async getVendorActiveActions(@CurrentUser() user: AuthUser) {
    const vendor = await this.enforcement['prisma'].vendor.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!vendor) return [];
    return this.enforcement.getActiveActions(vendor.id);
  }
}
