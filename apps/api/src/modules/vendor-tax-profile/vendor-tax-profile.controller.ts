import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { UpsertTaxProfileDto } from './dto/upsert-tax-profile.dto';
import { VerifyTaxProfileDto } from './dto/verify-tax-profile.dto';
import { HmrcReportService } from './hmrc-report.service';
import { VendorTaxProfileService } from './vendor-tax-profile.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new Error('Unauthenticated');
  return user;
}

@ApiTags('Tax profiles')
@Controller()
export class VendorTaxProfileController {
  constructor(
    private readonly taxProfile: VendorTaxProfileService,
    private readonly hmrcReport: HmrcReportService,
  ) {}

  // ── Vendor self-service ──────────────────────────────────────────────────

  @Get('vendors/me/tax-profile')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: "Get my tax profile (HMRC reporting data)" })
  getMyProfile(@CurrentUser() user: AuthUser | null) {
    return this.taxProfile.getMyProfile(requireUser(user));
  }

  @Put('vendors/me/tax-profile')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: "Create or update my tax profile" })
  upsertMyProfile(@CurrentUser() user: AuthUser | null, @Body() dto: UpsertTaxProfileDto) {
    return this.taxProfile.upsertMyProfile(requireUser(user), dto);
  }

  @Post('vendors/me/tax-profile/from-stripe')
  @Roles(UserRole.vendor)
  @ApiOperation({
    summary: "Pre-fill tax profile from Stripe KYC data (only fills missing fields)",
  })
  prefillFromStripe(@CurrentUser() user: AuthUser | null) {
    return this.taxProfile.prefillFromStripe(requireUser(user));
  }

  @Get('vendors/me/reports')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: "List my annual HMRC reports" })
  listMyReports(@CurrentUser() user: AuthUser | null) {
    return this.taxProfile.getMyProfile(requireUser(user)).then(async (profile) => {
      if (!profile) return [];
      const vendor = await this.hmrcReport
        .listReports(profile.vendorId)
        .catch(() => [] as Awaited<ReturnType<HmrcReportService['listReports']>>);
      return vendor;
    });
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  @Get('admin/vendors/:id/tax-profile')
  @Roles(UserRole.admin, UserRole.compliance, UserRole.finance)
  @ApiOperation({ summary: "Get a vendor's tax profile (admin)" })
  adminGetProfile(@Param('id', new ParseUUIDPipe()) vendorId: string) {
    return this.taxProfile.adminGetProfile(vendorId);
  }

  @Post('admin/vendors/:id/tax-profile/verify')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: "Set verification status on a vendor's tax profile" })
  adminVerify(
    @Param('id', new ParseUUIDPipe()) vendorId: string,
    @Body() dto: VerifyTaxProfileDto,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.taxProfile.adminVerify(vendorId, dto, requireUser(user));
  }

  @Get('admin/tax-profiles/incomplete')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'List vendors with incomplete or unverified tax profiles' })
  listIncomplete() {
    return this.taxProfile.listIncomplete();
  }

  @Get('admin/platform-reports')
  @Roles(UserRole.admin, UserRole.finance, UserRole.compliance)
  @ApiOperation({ summary: 'List all platform reports for a reporting year' })
  adminListReports(@Query('year') yearStr: string) {
    const year = parseInt(yearStr, 10) || new Date().getUTCFullYear() - 1;
    return this.hmrcReport.adminListReports(year);
  }

  @Post('admin/platform-reports/generate')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Manually trigger annual report generation (admin override)' })
  adminGenerateReport(@Query('year') yearStr: string) {
    const year = parseInt(yearStr, 10) || new Date().getUTCFullYear() - 1;
    return this.hmrcReport.generateAnnualReport(year);
  }

  @Post('admin/platform-reports/send-copies')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Send vendor copies for a reporting year (admin override)' })
  adminSendCopies(@Query('year') yearStr: string) {
    const year = parseInt(yearStr, 10) || new Date().getUTCFullYear() - 1;
    return this.hmrcReport.sendVendorCopies(year);
  }
}
