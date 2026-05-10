import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { UpdateUserDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the calling user (id, email, name, role, status, avatar)' })
  me(@CurrentUser() user: AuthUser | null) {
    return this.users.getMe(this.requireUser(user).id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the calling user’s own profile (name, phone, avatar)' })
  updateMe(@CurrentUser() user: AuthUser | null, @Body() dto: UpdateUserDto) {
    return this.users.updateMe(this.requireUser(user).id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete the calling user’s account and revoke their Supabase session' })
  async deleteMe(@CurrentUser() user: AuthUser | null) {
    await this.users.deleteMe(this.requireUser(user).id);
  }

  @Patch(':userId/status')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Admin: change a user’s status (active | suspended | deleted)' })
  updateStatus(
    @CurrentUser() actor: AuthUser | null,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(userId, dto, this.requireUser(actor).id);
  }

  private requireUser(user: AuthUser | null): AuthUser {
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
