import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { ApproveMenuItemWithEditDto } from './dto/approve-menu-item-with-edit.dto';
import { BulkApproveMenuItemsDto } from './dto/bulk-approve-menu-items.dto';
import { ListMenuModerationDto } from './dto/list-menu-moderation.dto';
import { ModerateMenuItemDto } from './dto/moderate-menu-item.dto';
import { MenuItemsService } from './menu-items.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user)
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
  return user;
}

/**
 * Admin-only moderation surface for vendor menu items. Mirrors the reviews
 * moderation queue: read (admin/support), act (admin). Kept on its own
 * non-vendor-scoped path so it sits outside the vendor-ownership guard that
 * protects the `vendors/:vendorId/...` catalogue routes.
 */
@ApiTags('Menu moderation')
@ApiBearerAuth()
@Controller({ path: 'admin/menu-items', version: '1' })
export class MenuModerationController {
  constructor(private readonly items: MenuItemsService) {}

  @Get('moderation-queue')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'List menu items by moderation status (admin/support)' })
  queue(@Query() dto: ListMenuModerationDto) {
    return this.items.listModerationQueue(dto);
  }

  @Get('moderation-queue/counts')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({
    summary: 'Counts per moderation status honouring current filters (admin/support)',
  })
  queueCounts(@Query() dto: ListMenuModerationDto) {
    return this.items.moderationQueueCounts(dto);
  }

  @Patch(':id/moderation')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Approve, reject, or re-hold a menu item (admin)' })
  moderate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: ModerateMenuItemDto,
  ) {
    return this.items.moderate(id, dto, requireUser(user));
  }

  @Patch(':id/approve-with-edit')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Apply moderator edits and approve a menu item (admin)' })
  approveWithEdit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: ApproveMenuItemWithEditDto,
  ) {
    return this.items.approveWithEdit(id, dto, requireUser(user));
  }

  @Patch('moderation-queue/vendors/:vendorId/approve')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Bulk approve held items for exactly one vendor (admin)' })
  bulkApprove(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: BulkApproveMenuItemsDto,
  ) {
    return this.items.bulkApprove(vendorId, dto.items, requireUser(user));
  }
}
