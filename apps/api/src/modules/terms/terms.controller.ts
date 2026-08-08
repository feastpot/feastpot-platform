import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TermsDocumentType, UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';
import { VendorMembersService } from '../vendor-members/vendor-members.service';

import { AcceptTermsVersionDto } from './dto/accept-terms-version.dto';
import { PublishTermsVersionDto } from './dto/publish-terms-version.dto';
import { TermsService } from './terms.service';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('terms')
@ApiBearerAuth()
@Controller({ path: 'terms', version: '1' })
export class TermsController {
  constructor(
    private readonly terms: TermsService,
    private readonly vendorMembers: VendorMembersService,
  ) {}

  // ─── Admin ──────────────────────────────────────────────────────────────────

  /**
   * Publish a new terms version.
   * Hard rules enforced in service: 15-day notice for material changes,
   * solicitor sign-off required for VENDOR_TERMS, contentHash computed on publish.
   */
  @Post('versions')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Publish a new terms version (admin)' })
  publishVersion(@Body() dto: PublishTermsVersionDto) {
    return this.terms.publishVersion(dto);
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  /**
   * Current live version metadata + content for public rendering.
   * Used by the customer-facing vendor-terms page.
   */
  @Get('current')
  @Public()
  @ApiOperation({ summary: 'Get the current live terms version (public)' })
  getCurrent(
    @Query('documentType') documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    return this.terms.getCurrentVersion(documentType);
  }

  /**
   * List all published versions for a document type (public -- version history).
   */
  @Get('versions')
  @Public()
  @ApiOperation({ summary: 'List terms versions (public)' })
  listVersions(
    @Query('documentType') documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    return this.terms.listVersions(documentType);
  }

  // ─── Vendor-authed ──────────────────────────────────────────────────────────

  /**
   * Current + pending versions with acceptance status for the calling vendor.
   */
  @Get('versions/me')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Current and pending terms for this vendor' })
  async getMyVersions(
    @Req() req: AuthedRequest,
    @Query('documentType') documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return { current: null, pending: null };
    return this.terms.getVersionsForVendorView(documentType, eff.vendorId);
  }

  /**
   * Full version history + this vendor's acceptance record.
   */
  @Get('versions/me/history')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Terms change history with acceptance record' })
  async getMyHistory(
    @Req() req: AuthedRequest,
    @Query('documentType') documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return [];
    return this.terms.getHistoryForVendor(documentType, eff.vendorId);
  }

  /**
   * Whether this vendor has accepted the current live version.
   * Used by the onboarding flow to decide whether to show the terms step.
   */
  @Get('acceptance-status')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Check if vendor has accepted the current live version' })
  async getAcceptanceStatus(
    @Req() req: AuthedRequest,
    @Query('documentType') documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return { accepted: false };
    const accepted = await this.terms.hasAcceptedCurrentVersion(eff.vendorId, documentType);
    return { accepted };
  }

  /**
   * Vendor click-wraps a specific terms version.
   *
   * Records all nine audit fields required for enforceable click-wrap:
   * vendorId, versionId, acceptedAt, contentHash, ipAddress, userAgent,
   * acceptanceText, scrolledToEnd, method=CLICKWRAP.
   *
   * Acceptances are append-only -- no update or delete endpoint exists.
   * DO NOT allow an admin to call this on behalf of a vendor.
   */
  @Post('versions/:id/accept')
  @HttpCode(200)
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Click-wrap accept a terms version (vendor)' })
  async acceptVersion(
    @Param('id') id: string,
    @Body() dto: AcceptTermsVersionDto,
    @Req() req: AuthedRequest,
  ) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return { ok: false };

    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      (req as unknown as { ip?: string }).ip;
    const uaRaw = req.headers['user-agent'];
    const ua = Array.isArray(uaRaw) ? uaRaw[0] : uaRaw;

    await this.terms.acceptVersion(eff.vendorId, id, dto, ip, ua);
    return { ok: true };
  }

  /**
   * List pending (future-effective) terms not yet accepted by this vendor.
   * Used to decide whether to show the dashboard banner.
   */
  @Get('pending')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Pending terms not yet accepted by this vendor' })
  async getPending(
    @Req() req: AuthedRequest,
    @Query('documentType') documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return [];
    return this.terms.getPendingForVendor(eff.vendorId, documentType);
  }

  /**
   * Return DASHBOARD notices for this vendor that have not yet been
   * acknowledged. Each notice includes the version metadata (version number,
   * effectiveAt, changeSummary) so the banner can render the countdown and
   * summary without a second round-trip.
   */
  @Get('notices')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Active dashboard change notices for this vendor' })
  async getDashboardNotices(@Req() req: AuthedRequest) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return [];
    return this.terms.getDashboardNotices(eff.vendorId);
  }

  /**
   * Mark a DASHBOARD notice as acknowledged.
   * Vendors can acknowledge (dim the banner) without accepting the new terms;
   * the re-acceptance gate will still appear when effectiveAt passes.
   * Only the owning vendor may acknowledge their own notice.
   */
  @Post('notices/:id/acknowledge')
  @HttpCode(200)
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Acknowledge a dashboard change notice' })
  async acknowledgeNotice(@Param('id') id: string, @Req() req: AuthedRequest) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return { ok: false };
    await this.terms.acknowledgeNotice(id, eff.vendorId);
    return { ok: true };
  }
}
