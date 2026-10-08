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
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { AccountDeletionService } from './account-deletion.service';
import { RequestAccountDeletionDto } from './dto/account-deletion.dto';
import { SyncUserDto, UpdateUserDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly deletions: AccountDeletionService,
  ) {}

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

  @Post('sync')
  @ApiOperation({
    summary:
      'Mirror Supabase signup data into public.users (idempotent) + process referral code if present',
  })
  sync(@CurrentUser() user: AuthUser | null, @Body() dto: SyncUserDto) {
    return this.users.sync(this.requireUser(user).id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue a cancellable account deletion request; never immediately erase the account',
  })
  async deleteMe(@CurrentUser() user: AuthUser | null) {
    return this.deletions.request(this.requireUser(user).id, this.requireUser(user).id);
  }

  @Get('me/deletion')
  deletionStatus(@CurrentUser() user: AuthUser | null) {
    return this.deletions.status(this.requireUser(user).id);
  }

  @Post('me/deletion')
  @HttpCode(HttpStatus.ACCEPTED)
  requestDeletion(@CurrentUser() user: AuthUser | null, @Body() _dto: RequestAccountDeletionDto) {
    return this.deletions.request(this.requireUser(user).id, this.requireUser(user).id);
  }

  @Delete('me/deletion')
  cancelDeletion(@CurrentUser() user: AuthUser | null) {
    return this.deletions.cancel(this.requireUser(user).id, this.requireUser(user).id);
  }

  @Get('me/export')
  exportData(@CurrentUser() user: AuthUser | null) {
    return this.deletions.export(this.requireUser(user).id);
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
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }
    return user;
  }
}
