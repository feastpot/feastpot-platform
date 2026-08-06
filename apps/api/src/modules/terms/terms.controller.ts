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
   * Requires effectiveAt >= 15 days from now (hard validation).
   */
  @Post('versions')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Publish a new terms version (admin)' })
  publishVersion(@Body() dto: PublishTermsVersionDto) {
    return this.terms.publishVersion(dto);
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  /**
   * List all published terms versions for a document type (public).
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
   * Vendor acknowledges / accepts a specific terms version.
   */
  @Post('versions/:id/accept')
  @HttpCode(200)
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Accept a terms version' })
  async acceptVersion(@Param('id') id: string, @Req() req: AuthedRequest) {
    const user = requireUser(req);
    const eff = await this.vendorMembers.getEffectiveRole(user);
    if (!eff) return { ok: false };
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      (req as unknown as { ip?: string }).ip;
    return this.terms.acceptVersion(eff.vendorId, id, ip);
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
}
