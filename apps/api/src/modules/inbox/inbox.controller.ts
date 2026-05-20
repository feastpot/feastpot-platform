import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types';

import { ListInboxDto } from './dto/list-inbox.dto';
import { InboxService } from './inbox.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  return user;
}

/**
 * T007: vendor/customer-facing notification inbox.
 *
 * All routes are scoped to the caller's userId at the service layer, so
 * users can only ever see/mutate their own rows. No role gating - any
 * authenticated user has an inbox.
 */
@ApiTags('Inbox')
@ApiBearerAuth()
@Controller({ path: 'inbox', version: '1' })
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user (cursor paginated, newest first)' })
  list(@CurrentUser() user: AuthUser | null, @Query() dto: ListInboxDto) {
    return this.inbox.list(requireUser(user).id, dto);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for the current user' })
  unreadCount(@CurrentUser() user: AuthUser | null) {
    return this.inbox.unreadCount(requireUser(user).id);
  }

  @Patch(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(
    @CurrentUser() user: AuthUser | null,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.inbox.markRead(requireUser(user).id, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  markAllRead(@CurrentUser() user: AuthUser | null) {
    return this.inbox.markAllRead(requireUser(user).id);
  }
}
