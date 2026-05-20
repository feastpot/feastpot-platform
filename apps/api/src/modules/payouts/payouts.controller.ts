import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, VendorMemberRole } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';
import { VendorMembersService } from '../vendor-members/vendor-members.service';

import { HoldPayoutDto } from './dto/hold-payout.dto';
import { ListPayoutsDto } from './dto/list-payouts.dto';
import { PayoutsService } from './payouts.service';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

// T010: roles allowed to see vendor payouts.  Mirrors the client-side
// ROLE_PERMISSIONS table in apps/vendor so the UI gate and the server
// gate agree.  Platform finance/admin (UserRole) always pass.
const PAYOUTS_VENDOR_ROLES: ReadonlySet<VendorMemberRole> = new Set([
  VendorMemberRole.owner,
  VendorMemberRole.finance,
]);

@ApiTags('Payouts')
@ApiBearerAuth()
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly vendorMembers: VendorMembersService,
  ) {}

  private async ensureVendorRoleCanReadPayouts(user: AuthUser): Promise<void> {
    if (user.role === UserRole.finance || user.role === UserRole.admin) return;
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff || !PAYOUTS_VENDOR_ROLES.has(eff.role)) {
      throw new ForbiddenException({
        code: 'VENDOR_ROLE_FORBIDDEN',
        message: 'Your role on this vendor team does not include payouts',
      });
    }
  }

  @Get()
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'List payouts (scoped: vendors see their own, finance/admin see all)' })
  async list(@Req() req: AuthedRequest, @Query() dto: ListPayoutsDto) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    return this.payouts.list(user, dto);
  }

  @Get('export.csv')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({
    summary: 'CSV export of the actor’s payout history (T006). Capped at 5 000 rows.',
  })
  async exportCsv(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Query('vendorId') vendorId?: string,
  ) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    // Headers set explicitly: when a route opts into manual @Res() handling,
    // Nest's @Header() decorators are not guaranteed to apply, so we own
    // both response headers and the body.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="feastpot-payouts.csv"');
    res.flushHeaders?.();
    await this.payouts.exportCsv(user, (chunk) => res.write(chunk), {
      vendorId,
    });
    res.end();
  }

  @Get(':id')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Get a payout by id' })
  async get(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    return this.payouts.getById(id, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Approve a draft payout for transfer (finance/admin)' })
  approve(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.approvePayout(id, requireUser(req));
  }

  @Patch(':id/hold')
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Place a hold on a payout (finance/admin)' })
  hold(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: HoldPayoutDto,
  ) {
    return this.payouts.holdPayout(id, dto.holdReason, requireUser(req));
  }
}
