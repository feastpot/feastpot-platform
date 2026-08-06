import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TrustSignalType, UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

import { UpdateTrustSignalDto } from './dto/update-trust-signal.dto';
import { listVendorTrustSignalsForAdmin, setVendorTrustSignalStatus } from './vendor-capacity';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user)
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
  return user;
}

/**
 * Staff-only review surface for vendor trust signals ("What we have
 * checked" badges). Customers only ever see `verified` signals via the
 * public read layer (getVendorTrustSignals default filter) - these
 * endpoints are the sole way a signal reaches `verified` / `expired`.
 */
@ApiTags('Admin')
@ApiBearerAuth()
// NOTE: namespaced under /admin because the public catalogue route
// GET /vendors/:id/trust-signals (verified-only) already owns that path.
@Controller({ path: 'admin/vendors/:vendorId/trust-signals', version: '1' })
export class VendorTrustSignalsController {
  constructor(private readonly prisma: PrismaService) {}

  private async assertVendorExists(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
  }

  @Get()
  // Mirror the admin vendor-detail page role matrix (view-only for support).
  @Roles(UserRole.admin, UserRole.compliance, UserRole.support)
  @ApiOperation({
    summary: 'All seven trust signals for a vendor (staff view, includes unverified)',
  })
  async list(@Param('vendorId', new ParseUUIDPipe()) vendorId: string) {
    await this.assertVendorExists(vendorId);
    return listVendorTrustSignalsForAdmin(this.prisma, vendorId);
  }

  @Patch(':signalType')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({
    summary: 'Mark a trust signal verified or expired (records verified_by / verified_at)',
  })
  async update(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('signalType', new ParseEnumPipe(TrustSignalType)) signalType: TrustSignalType,
    @Body() dto: UpdateTrustSignalDto,
    @CurrentUser() user: AuthUser | null,
  ) {
    const staff = requireUser(user);
    await this.assertVendorExists(vendorId);
    return setVendorTrustSignalStatus(
      this.prisma,
      vendorId,
      signalType,
      dto.status,
      staff.id,
      dto.evidenceReference,
    );
  }
}
