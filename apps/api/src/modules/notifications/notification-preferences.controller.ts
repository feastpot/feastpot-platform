import { Body, Controller, Get, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

/**
 * Self-service notification opt-outs for the authenticated user. Every route is
 * already auth-gated by the global SupabaseAuthGuard; `@Roles` narrows to the
 * account-holding roles. Ownership is implicit - the service only ever reads or
 * writes rows for the caller's own id.
 */
@ApiTags('Notification preferences')
@ApiBearerAuth()
@Controller({ path: 'notification-preferences', version: '1' })
export class NotificationPreferencesController {
  constructor(private readonly prefs: NotificationPreferencesService) {}

  @Get()
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get the calling user’s notification preferences' })
  get(@CurrentUser() user: AuthUser | null) {
    return this.prefs.getPreferences(this.requireUser(user).id);
  }

  @Patch()
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Update the calling user’s notification preferences' })
  update(@CurrentUser() user: AuthUser | null, @Body() dto: UpdatePreferencesDto) {
    return this.prefs.updatePreferences(this.requireUser(user).id, dto);
  }

  private requireUser(user: AuthUser | null): AuthUser {
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
