import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';

import { UpsertVerificationDto } from './dto/upsert-verification.dto';
import { VendorVerificationService } from './vendor-verification.service';

@Controller()
export class VendorVerificationController {
  constructor(private readonly svc: VendorVerificationService) {}

  /**
   * Public endpoint - read by the vendor profile page (server-side, cached 5 min).
   * Returns 404 when the vendor hasn't been through verification yet.
   */
  @Get('vendors/:id/verification')
  async getVerification(@Param('id', new ParseUUIDPipe()) id: string) {
    const v = await this.svc.getVerification(id);
    if (!v) throw new NotFoundException('Verification record not found');
    return v;
  }

  /**
   * Admin-only: create or update a vendor's verification record.
   * Changing overallState to SUSPENDED here bypasses the scheduled job
   * (useful for immediate manual action).
   */
  @Put('admin/vendors/:id/verification')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('admin', 'compliance')
  async upsertVerification(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertVerificationDto,
  ) {
    return this.svc.upsertVerification(id, dto);
  }
}
