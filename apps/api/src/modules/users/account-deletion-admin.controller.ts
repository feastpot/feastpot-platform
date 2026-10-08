import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { AccountDeletionService } from './account-deletion.service';
import {
  AdminRequestAccountDeletionDto,
  CancelAccountDeletionDto,
} from './dto/account-deletion.dto';

@Controller({ path: 'admin/account-deletions', version: '1' })
@Roles(UserRole.admin)
export class AccountDeletionAdminController {
  constructor(private readonly deletions: AccountDeletionService) {}

  @Get()
  list(@Query('includeTestData') includeTestData?: string) {
    return this.deletions.adminList(includeTestData === 'true');
  }

  @Get('summary')
  summary() {
    return this.deletions.adminSummary();
  }

  @Post()
  request(@CurrentUser() actor: AuthUser, @Body() dto: AdminRequestAccountDeletionDto) {
    return this.deletions.request(dto.userId, actor.id, dto.reason);
  }

  @Delete(':id')
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAccountDeletionDto,
  ) {
    return this.deletions.cancelById(id, actor.id, dto.reason);
  }
}
