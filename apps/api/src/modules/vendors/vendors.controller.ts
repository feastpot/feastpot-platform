import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { CreateVendorDto } from './dto/create-vendor.dto';
import { CursorPaginationDto } from './dto/pagination.dto';
import { RegisterVendorInterestDto } from './dto/register-vendor-interest.dto';
import { SearchVendorsDto } from './dto/search-vendors.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpsertDeliveryConfigDto } from './dto/upsert-delivery-config.dto';
import {
  StripeConnectLinkResponseDto,
  VendorAnalyticsResponseDto,
} from './dto/vendor-analytics.dto';
import { VendorStatsResponseDto } from './dto/vendor-stats.dto';
import { VendorsService } from './vendors.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  return user;
}

@ApiTags('Vendors')
@Controller({ path: 'vendors', version: '1' })
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

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
  registerInterest(@Body() dto: RegisterVendorInterestDto) {
    return this.vendors.registerInterest(dto);
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

  @Get('me/delivery-config')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get the authed vendor’s delivery configuration (or null)' })
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
  // real deploy — returns 404 in production.
  @Public()
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

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get vendor by slug (public) — used by customer PWA' })
  findBySlug(@Param('slug') slug: string) {
    return this.vendors.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get vendor by id (public)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vendors.findById(id);
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
