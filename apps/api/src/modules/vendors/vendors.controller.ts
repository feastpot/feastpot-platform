import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { SearchVendorsDto } from './dto/search-vendors.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
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
  @ApiOperation({ summary: 'Search live vendors (public)' })
  search(@Query() dto: SearchVendorsDto) {
    return this.vendors.search(dto);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new vendor profile (any authenticated user)' })
  create(@CurrentUser() user: AuthUser | null, @Body() dto: CreateVendorDto) {
    return this.vendors.create(requireUser(user), dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get the authenticated vendor’s own profile' })
  findMine(@CurrentUser() user: AuthUser | null) {
    return this.vendors.findMyVendor(requireUser(user).id);
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
