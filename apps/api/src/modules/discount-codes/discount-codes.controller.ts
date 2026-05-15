import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthUser } from '../../auth/types';

import { DiscountCodesService } from './discount-codes.service';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { ToggleDiscountCodeDto } from './dto/toggle-discount-code.dto';
import { ValidateDiscountCodeDto } from './dto/validate-discount-code.dto';

@ApiTags('Discount codes')
@ApiBearerAuth()
@Controller({ version: '1' })
export class DiscountCodesController {
  constructor(private readonly discountCodes: DiscountCodesService) {}

  // -- customer-facing --

  @Public()
  @Post('discount-codes/validate')
  @HttpCode(200)
  // Anti-enumeration rate limit. Without this, an attacker can iterate
  // SAVE10 / WELCOME20 / LAUNCH50 / … against this endpoint to discover
  // live promotions. The named throttler must be `long` (60 s window) —
  // our ThrottlerModule registers `short` (1 s burst) + `long` (60 s);
  // there is NO throttler called `default`, so a `{ default: … }` override
  // would be a silent no-op. We tighten `long` to 10/min for this single
  // route while leaving the global per-role caps in place. The 1 s/10 req
  // burst limit from `short` still applies on top.
  //
  // Tracker: anonymous callers are tracked by `ip:<req.ip>` via
  // RoleThrottlerGuard.getTracker(); req.ip is the real client IP because
  // Express `trust proxy` is set in main.ts. We deliberately do NOT use
  // raw `x-forwarded-for` — that header is attacker-controlled and can be
  // spoofed to bypass the limit.
  @Throttle({ long: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Validate a discount code against the calling basket (returns discountPence). Rate-limited to 10/min per caller to prevent code enumeration.',
  })
  validate(@Body() dto: ValidateDiscountCodeDto) {
    return this.discountCodes.validate(dto.code, dto.vendorId, dto.subtotalPence);
  }

  // -- admin --

  @Get('admin/discount-codes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin, UserRole.finance)
  @ApiOperation({ summary: 'Paginated list of discount codes (admin/finance only).' })
  adminList(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.discountCodes.adminList(parseInt(page, 10) || 1, parseInt(limit, 10) || 20);
  }

  @Post('admin/discount-codes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create a new discount code (admin only).' })
  adminCreate(@Body() dto: CreateDiscountCodeDto, @CurrentUser() user: AuthUser | null) {
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    return this.discountCodes.adminCreate(dto, user.id);
  }

  @Patch('admin/discount-codes/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Activate / deactivate a discount code (admin only).' })
  adminToggle(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ToggleDiscountCodeDto) {
    return this.discountCodes.adminToggle(id, dto.isActive);
  }
}
