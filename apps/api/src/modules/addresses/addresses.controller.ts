import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

/**
 * Saved-address CRUD for authenticated users.
 *
 * All routes are gated to authenticated customers (and staff impersonating
 * one — vendors/admins never need their own delivery address but the
 * decorator stays narrow so role drift can't accidentally leak access).
 * Ownership is enforced inside the service: every mutation re-checks
 * `userId === request.user.id` against the row.
 */
@ApiTags('Addresses')
@ApiBearerAuth()
@Controller({ path: 'addresses', version: '1' })
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @Roles(UserRole.customer, UserRole.admin)
  @ApiOperation({ summary: 'List the calling user’s saved delivery addresses' })
  list(@CurrentUser() user: AuthUser | null) {
    const u = this.requireUser(user);
    return this.addresses.findAll(u.id);
  }

  @Post()
  @Roles(UserRole.customer, UserRole.admin)
  @ApiOperation({ summary: 'Create a new saved address for the calling user' })
  create(@CurrentUser() user: AuthUser | null, @Body() dto: CreateAddressDto) {
    const u = this.requireUser(user);
    return this.addresses.create(u.id, dto);
  }

  @Patch(':id')
  @Roles(UserRole.customer, UserRole.admin)
  @ApiOperation({ summary: 'Update one of the calling user’s addresses' })
  update(
    @CurrentUser() user: AuthUser | null,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const u = this.requireUser(user);
    return this.addresses.update(id, u.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.customer, UserRole.admin)
  @ApiOperation({ summary: 'Delete one of the calling user’s addresses (blocked if used by an active order)' })
  remove(@CurrentUser() user: AuthUser | null, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = this.requireUser(user);
    return this.addresses.delete(id, u.id);
  }

  private requireUser(user: AuthUser | null): AuthUser {
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
