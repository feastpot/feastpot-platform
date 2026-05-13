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
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
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

  @Post('discount-codes/validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a discount code against the calling basket (returns discountPence).' })
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
