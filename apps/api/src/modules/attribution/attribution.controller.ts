import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderSource, UserRole } from '@prisma/client';
import type { Response } from 'express';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';
import { VendorMembersService } from '../vendor-members/vendor-members.service';

import { AttributionService } from './attribution.service';
import { RecordClickDto } from './dto/record-click.dto';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('attribution')
@ApiBearerAuth()
@Controller({ path: 'attribution', version: '1' })
export class AttributionController {
  constructor(
    private readonly attribution: AttributionService,
    private readonly vendorMembers: VendorMembersService,
  ) {}

  // ─── Public ─────────────────────────────────────────────────────────────────

  /**
   * Record a referral link click.
   * Called by the /v/[slug] Next.js route handler server-side.
   * No authentication required (visitor may not be signed in).
   */
  @Post('clicks')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a referral link click (public)' })
  recordClick(@Body() dto: RecordClickDto) {
    return this.attribution.recordClick(dto);
  }

  // ─── Vendor ─────────────────────────────────────────────────────────────────

  /**
   * Get (or create) the calling vendor's referral link.
   * Triggers async QR code generation on first call.
   */
  @Get('links/me')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: "Get or create the vendor's referral link" })
  async getMyLink(@Req() req: AuthedRequest) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return null;
    return this.attribution.getOrCreateLink(eff.vendorId);
  }

  /**
   * Source split: orders and GMV by source for this vendor.
   */
  @Get('vendor-split')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Order and GMV split by source for this vendor' })
  async getVendorSplit(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return { thisWeek: {}, cumulative: {} };
    return this.attribution.getVendorSplit(
      eff.vendorId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  /**
   * Queue a backfill for referral links that lack QR URLs. Rendering and
   * storage happen in bounded background batches, never in this request.
   */
  @Post('admin/backfill-qr')
  @Roles(UserRole.admin)
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin: backfill QR codes for links that lack them (IS NULL)' })
  backfillQr() {
    return this.attribution.backfillMissingQr();
  }

  /**
   * Regenerate QR codes for links that already have a stored QR but encode
   * the old URL without the ?m=qr tracking marker.
   *
   * Pass ?dryRun=true to preview scope (returns slugs list, no writes).
   * Pass ?dryRun=false (or omit) to commit the regeneration.
   */
  @Post('admin/backfill-qr-markers')
  @Roles(UserRole.admin)
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin: regenerate QR codes to include the ?m=qr tracking marker' })
  backfillQrMarkers(@Query('dryRun') dryRun?: string) {
    return this.attribution.backfillQrMarkers(dryRun === 'true');
  }

  @Get('admin/list')
  @Roles(UserRole.admin, UserRole.finance, UserRole.support)
  @ApiOperation({ summary: 'Admin: list attribution records with filters' })
  listAdmin(
    @Query('source') source?: OrderSource,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.attribution.listForAdmin({
      source,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('admin/export.csv')
  @Roles(UserRole.admin, UserRole.finance)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Admin: export attribution CSV' })
  async exportCsv(
    @Query('source') source?: OrderSource,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res: Response = undefined as unknown as Response,
  ) {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="attribution-${date}.csv"`);
    const csv = await this.attribution.csvForAdmin({ source, from, to });
    res.send(csv);
  }
}
