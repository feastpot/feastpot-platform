import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
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

  @Get('summary')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Vendor payouts rollup: next payout date, pending, paid to date' })
  async summary(@Req() req: AuthedRequest) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    // Resolve the vendor through team membership (owner OR active member with
    // a payout-reading role), so finance members of a vendor team see their
    // team's aggregate rather than an empty summary.
    const eff = await this.vendorMembers.getEffectiveRole(user);
    return this.payouts.vendorSummary(eff?.vendorId ?? null);
  }

  /**
   * Source-based earnings breakdown for the vendor portal /earnings page.
   * Returns period (current month) + cumulative commission summary including
   * blended rate, by-source breakdown, and savings vs the standard marketplace rate.
   */
  @Get('earnings-summary')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Vendor earnings breakdown with source-based commission detail' })
  async earningsSummary(
    @Req() req: AuthedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff?.vendorId) throw new NotFoundException({ code: 'NOT_A_VENDOR' });
    const now = new Date();
    const y = year ? parseInt(year) : now.getFullYear();
    const m = month ? parseInt(month) - 1 : now.getMonth();
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 1));
    return this.payouts.getEarningsSummary(eff.vendorId, from, to);
  }

  @Get('export.csv')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({
    summary: "CSV export of the actor's payout history (T006). Capped at 5 000 rows.",
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

  /**
   * Order-level CSV export: one row per order, not per payout batch.
   * Columns: order_date, order_number, attribution_source,
   *          subtotal_gbp, commission_gbp, net_to_vendor_gbp (+ pence variants).
   * Optionally scoped to a single payout via ?payoutId=<uuid>.
   * Reflects post-refund commission/payout figures for partial-refund orders.
   */
  @Get('orders/export.csv')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({
    summary: 'Order-level CSV export with attribution source and commission per order.',
  })
  async exportOrdersCsv(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Query('payoutId') payoutId?: string,
  ) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="feastpot-orders.csv"');
    res.flushHeaders?.();
    await this.payouts.exportOrdersCsv(user, (chunk) => res.write(chunk), { payoutId });
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

  /**
   * Per-order breakdown for a payout batch: one row per delivered order in the
   * payout's time window, with attribution tier and commission figures.
   * Vendors see only their own payout; finance/admin see any.
   */
  @Get(':id/orders')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'List orders within a payout batch with attribution and commission' })
  async getPayoutOrders(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const user = requireUser(req);
    await this.ensureVendorRoleCanReadPayouts(user);
    return this.payouts.listPayoutOrders(id, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Approve a draft payout for transfer (finance/admin)' })
  approve(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.approvePayout(id, requireUser(req));
  }

  @Post(':id/reset')
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Reset a failed payout to draft for re-approval (finance/admin)' })
  resetFailed(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.resetFailedPayout(id, requireUser(req));
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
