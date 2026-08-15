import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  Headers,
  HttpCode,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import * as QRCode from 'qrcode';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../catalogue/supabase-storage.service';

import { AddBlackoutDto } from './dto/add-blackout.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CursorPaginationDto } from './dto/pagination.dto';
import { RegisterVendorInterestDto } from './dto/register-vendor-interest.dto';
import { SearchVendorsDto } from './dto/search-vendors.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateVendorComplianceDto } from './dto/update-vendor-compliance.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpsertCapacityDto } from './dto/upsert-capacity.dto';
import { UpsertDeliveryConfigDto } from './dto/upsert-delivery-config.dto';
import {
  StripeConnectLinkResponseDto,
  VendorAnalyticsResponseDto,
} from './dto/vendor-analytics.dto';
import { VendorStatsResponseDto } from './dto/vendor-stats.dto';
import {
  getCapacityForVendors,
  getVendorAvailability,
  getVendorTrustSignals,
  getVerifiedTrustSignalsForVendors,
} from './vendor-capacity';
import { VendorsService } from './vendors.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user)
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
  return user;
}

@ApiTags('Vendors')
@Controller({ path: 'vendors', version: '1' })
export class VendorsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly storage: SupabaseStorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search vendors (public). Defaults to status=live.' })
  search(@Query() dto: SearchVendorsDto) {
    return this.vendors.search(dto);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new vendor profile (any authenticated user)' })
  create(@CurrentUser() user: AuthUser | null, @Body() dto: CreateVendorDto) {
    return this.vendors.create(requireUser(user), dto);
  }

  @Public()
  @Post('register-interest')
  @ApiOperation({
    summary:
      'Public become-a-vendor application capture. Persists a VendorApplication row and emails the admin + the applicant.',
  })
  registerInterest(@Body() dto: RegisterVendorInterestDto, @Headers('x-fp-ref') fpRef?: string) {
    return this.vendors.registerInterest(dto, fpRef);
  }

  @Get('me')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get the authenticated vendor’s own profile' })
  findMine(@CurrentUser() user: AuthUser | null) {
    return this.vendors.findMyVendor(requireUser(user).id);
  }

  @Get('me/stats')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary: 'Aggregated stats (today, this week, pending now) for the authed vendor',
  })
  myStats(@CurrentUser() user: AuthUser | null): Promise<VendorStatsResponseDto> {
    return this.vendors.getMyStats(requireUser(user).id);
  }

  /**
   * QR code for the vendor's canonical share link.
   *
   * The URL embedded in the QR is derived from the vendor's VendorReferralLink
   * slug (NOT Vendor.slug). The attribution click recorder looks up
   * VendorReferralLink by slug; if Vendor.slug is used instead and the two
   * differ, fp_ref is never set and orders are attributed as marketplace.
   * The ?src=vendor parameter has NO effect on attribution - the route handler
   * ignores it - so it is intentionally absent.
   *
   * The slug is resolved from the authenticated user's vendor row, never
   * from a request parameter, so a vendor can never fetch another vendor's
   * QR by guessing a slug.
   *
   * Error-correction H (30 % redundancy) so the code remains scannable
   * after printing small or overlaying a logo. Margin 4 modules = standard
   * quiet zone required by QR spec.
   */
  @Get('me/qr')
  @ApiBearerAuth()
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: "PNG or SVG QR code for the vendor's canonical share link" })
  async myQrCode(
    @CurrentUser() user: AuthUser | null,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const u = requireUser(user);
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: u.id },
      select: { slug: true, id: true },
    });
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });

    // Use the VendorReferralLink slug, not Vendor.slug, so the QR encodes a URL
    // that the click recorder can actually resolve to a referral link and set fp_ref.
    const referralLink = await this.prisma.vendorReferralLink.findUnique({
      where: { vendorId: vendor.id },
      select: { slug: true },
    });
    if (!referralLink) {
      throw new NotFoundException({
        code: 'REFERRAL_LINK_NOT_FOUND',
        message: 'Referral link not set up yet. Please contact support.',
      });
    }

    const link = `https://feastpot.co.uk/v/${encodeURIComponent(referralLink.slug)}`;
    const qrOpts = { errorCorrectionLevel: 'H' as const, margin: 4 };

    if (format === 'svg') {
      const svg = await QRCode.toString(link, { ...qrOpts, type: 'svg' });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${vendor.slug}-feastpot-qr.svg"`);
      res.send(svg);
    } else {
      // Default: PNG at 1024 px - high enough for print without being huge.
      const png = await QRCode.toBuffer(link, { ...qrOpts, type: 'png', width: 1024 });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${referralLink.slug}-feastpot-qr.png"`,
      );
      res.send(png);
    }
  }

  @Get('me/dashboard')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary:
      'Dashboard summary (T004): orders due today, upcoming, pending event enquiries, next payout, menu warnings',
  })
  myDashboard(@CurrentUser() user: AuthUser | null) {
    return this.vendors.getMyDashboardSummary(requireUser(user).id);
  }

  @Get('me/onboarding-progress')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary: 'Onboarding checklist progress (5 setup steps) for the authed vendor',
  })
  getMyOnboardingProgress(@CurrentUser() user: AuthUser | null) {
    return this.vendors.getOnboardingProgress(requireUser(user).id);
  }

  @Get('me/analytics')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary:
      'Vendor analytics: 8-week revenue history, top dishes (90d), hourly order distribution',
  })
  myAnalytics(@CurrentUser() user: AuthUser | null): Promise<VendorAnalyticsResponseDto> {
    return this.vendors.getMyAnalytics(requireUser(user).id);
  }

  @Get('me/delivery-config/compute-districts')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary: 'Return postcode districts whose centroid is within radiusMiles of a kitchen location',
  })
  computeDeliveryDistricts(
    @CurrentUser() user: AuthUser | null,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusMiles') radiusMiles: string,
  ): Promise<{ districts: string[] }> {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const miles = parseFloat(radiusMiles);
    if (
      !Number.isFinite(latNum) ||
      !Number.isFinite(lngNum) ||
      !Number.isFinite(miles) ||
      miles <= 0
    ) {
      throw new BadRequestException('lat, lng and radiusMiles must be finite positive numbers');
    }
    requireUser(user);
    return this.vendors.computeDeliveryDistricts(latNum, lngNum, miles);
  }

  @Get('me/delivery-config')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: "Get the authed vendor's delivery configuration (or null)" })
  getMyDeliveryConfig(@CurrentUser() user: AuthUser | null) {
    return this.vendors.getMyDeliveryConfig(requireUser(user).id);
  }

  @Put('me/delivery-config')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Upsert the authed vendor’s delivery configuration' })
  upsertMyDeliveryConfig(
    @CurrentUser() user: AuthUser | null,
    @Body() dto: UpsertDeliveryConfigDto,
  ) {
    return this.vendors.upsertMyDeliveryConfig(requireUser(user).id, dto);
  }

  @Get('me/availability')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get the authed vendor’s availability + blackout dates (T002)' })
  getMyAvailability(@CurrentUser() user: AuthUser | null) {
    return this.vendors.getMyAvailability(requireUser(user).id);
  }

  @Patch('me/availability')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Update the authed vendor’s scheduling fields (T002)' })
  updateMyAvailability(@CurrentUser() user: AuthUser | null, @Body() dto: UpdateAvailabilityDto) {
    return this.vendors.updateMyAvailability(requireUser(user).id, dto);
  }

  @Post('me/blackouts')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Add (or upsert) a blackout date for the authed vendor (T002)' })
  addMyBlackout(@CurrentUser() user: AuthUser | null, @Body() dto: AddBlackoutDto) {
    return this.vendors.addMyBlackout(requireUser(user).id, dto);
  }

  @Delete('me/blackouts/:id')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a blackout date for the authed vendor (T002)' })
  removeMyBlackout(
    @CurrentUser() user: AuthUser | null,
    @Param('id', new ParseUUIDPipe()) blackoutId: string,
  ) {
    return this.vendors.removeMyBlackout(requireUser(user).id, blackoutId);
  }

  @Get('me/capacity')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary:
      'List the authed vendor’s per-date capacity rows (next 90 days), with slots taken/remaining',
  })
  getMyCapacity(@CurrentUser() user: AuthUser | null) {
    return this.vendors.getMyCapacity(requireUser(user).id);
  }

  @Put('me/capacity')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary:
      'Upsert a capacity row (slots per date per order type, optional pre-order cutoff, optional weekly repeat) for the authed vendor',
  })
  upsertMyCapacity(@CurrentUser() user: AuthUser | null, @Body() dto: UpsertCapacityDto) {
    return this.vendors.upsertMyCapacity(requireUser(user).id, dto);
  }

  @Delete('me/capacity/:id')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a capacity row for the authed vendor' })
  removeMyCapacity(
    @CurrentUser() user: AuthUser | null,
    @Param('id', new ParseUUIDPipe()) capacityId: string,
  ) {
    return this.vendors.removeMyCapacity(requireUser(user).id, capacityId);
  }

  @Post('me/stripe-connect-link')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({
    summary:
      'Create-or-reuse a Stripe Connect Express account for the authed vendor and return a one-shot onboarding URL',
  })
  createStripeConnectLink(
    @CurrentUser() user: AuthUser | null,
  ): Promise<StripeConnectLinkResponseDto> {
    return this.vendors.createStripeConnectLink(requireUser(user).id);
  }

  // Diagnostic-only endpoint. MUST be declared before @Get(':id') so
  // Nest matches "debug" as a literal segment rather than falling through
  // to the UUID-validated `/:id` route (which is what produced the
  // "Validation failed (uuid is expected)" 400s in production logs).
  // Gated to non-prod so we never accidentally leak internals from a
  // real deploy - returns 404 in production.
  @Public()
  @Public()
  @Get('coverage')
  @ApiOperation({
    summary:
      'Aggregated live-vendor delivery coverage (postcode districts), optionally filtered by cuisine. Feeds the SEO landing pages.',
  })
  coverage(@Query('cuisine') cuisine?: string) {
    const cuisines = cuisine
      ?.split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    return this.vendors.getCoverage(cuisines);
  }

  @Get('debug')
  @ApiOperation({
    summary: 'Diagnostic snapshot of live vendors + delivery configs (non-prod only).',
  })
  debug(@Query('postcode') postcode?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    }
    return this.vendors.getDebugInfo(postcode);
  }

  // Batch card data for search/rail cards: verified trust signals + the
  // next-7-days capacity rows for up to 50 vendors in one round trip.
  // Declared before @Get(':id') so "card-extras" is matched literally.
  @Public()
  @Get('card-extras')
  @ApiOperation({
    summary:
      'Batch verified trust signals + 7-day capacity for vendor cards (public, ?ids=comma-separated UUIDs, max 50).',
  })
  async cardExtras(@Query('ids') ids?: string) {
    const vendorIds = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
      .slice(0, 50);
    const [trustSignals, capacity] = await Promise.all([
      getVerifiedTrustSignalsForVendors(this.prisma, vendorIds),
      getCapacityForVendors(this.prisma, vendorIds),
    ]);
    return { trustSignals, capacity };
  }

  @Public()
  @Get('slug-redirect/:slug')
  @ApiOperation({
    summary: 'Return { newSlug } if a slug has been permanently redirected (public)',
  })
  async findSlugRedirect(@Param('slug') slug: string) {
    const result = await this.vendors.findSlugRedirect(slug);
    if (!result)
      throw new NotFoundException({
        code: 'REDIRECT_NOT_FOUND',
        message: 'No redirect for this slug',
      });
    return result;
  }

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get vendor by slug (public) - used by customer PWA' })
  findBySlug(@Param('slug') slug: string, @Query('postcode') postcode?: string) {
    return this.vendors.findBySlug(slug, postcode);
  }

  @Get(':id/live-menu-items')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Return live, approved menu items for the featured-dishes picker' })
  getLiveMenuItems(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser | null) {
    requireUser(user);
    return this.vendors.getLiveMenuItems(id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get vendor by id (public)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vendors.findById(id);
  }

  @Public()
  @Get(':id/availability')
  @ApiOperation({
    summary:
      'Public availability snapshot (opening days, hours, lead, blackouts) for the customer checkout date picker.',
  })
  async getAvailability(@Param('id', new ParseUUIDPipe()) id: string) {
    // Additive only: every pre-existing field keeps its name and shape.
    // `capacity` lists remainingSlots + preorderCutoffAt per capacity_type
    // per date for the next 21 days (empty until a vendor configures rows).
    const [snapshot, capacity] = await Promise.all([
      this.vendors.getAvailabilityById(id),
      getVendorAvailability(this.prisma, id),
    ]);
    return { ...snapshot, capacity };
  }

  @Public()
  @Get(':id/trust-signals')
  @ApiOperation({
    summary:
      'Verified trust signals for a vendor (public, customer profile). Never exposes unverified signals, evidence references or verifier ids.',
  })
  async getTrustSignals(@Param('id', new ParseUUIDPipe()) id: string) {
    const signals = await getVendorTrustSignals(this.prisma, id);
    return {
      signals: signals.map((s) => ({
        signalType: s.signalType,
        verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
      })),
    };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Update vendor profile (owner or admin)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendors.update(id, requireUser(user), dto);
  }

  /**
   * T005: identity image uploads (logo + cover). Mirrors the menu-item
   * image upload contract (multipart `file`, 5MB, jpeg/png/webp). The
   * service writes the public URL straight back onto the vendor row so
   * the caller does not need a separate PATCH round-trip.
   */
  @Post(':id/images')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiOperation({
    summary: 'Upload vendor logo or cover image (kind=logo|cover; max 5MB; jpeg/png/webp)',
  })
  async uploadIdentityImage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('kind') kind: string | undefined,
    @CurrentUser() user: AuthUser | null,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'multipart field "file" is required',
      });
    }
    if (kind !== 'logo' && kind !== 'cover') {
      throw new BadRequestException({
        code: 'INVALID_KIND',
        message: 'kind query param must be "logo" or "cover"',
      });
    }
    return this.vendors.uploadIdentityImage(id, requireUser(user), kind, file);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'Update vendor status (admin / compliance)' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: UpdateVendorStatusDto,
  ) {
    return this.vendors.updateStatus(id, dto, requireUser(user));
  }

  @Patch(':id/compliance')
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({
    summary: 'Update vendor FSA compliance status and rating details (admin / compliance only)',
    description:
      'Sets complianceStatus, fsaHygieneRating, fsaRatingDate, fsaRegistrationNumber, fhrsId, ' +
      'and fsaLastChecked. Immediately invalidates the search cache so the listing gate ' +
      '(RATED + rating >= 3) reflects the new state on the next customer search.',
  })
  updateCompliance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVendorComplianceDto,
  ) {
    return this.vendors.updateCompliance(id, dto);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'List published reviews for a vendor (public)' })
  listReviews(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.vendors.getVendorReviews(id, pagination);
  }
}
