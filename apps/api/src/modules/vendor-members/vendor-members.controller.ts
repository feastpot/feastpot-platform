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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types';

import { InviteMemberDto, UpdateMemberRoleDto } from './dto/invite-member.dto';
import { VendorMembersService } from './vendor-members.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  return user;
}

@ApiTags('vendor-members')
@ApiBearerAuth()
@Controller({ path: 'vendor/members', version: '1' })
export class VendorMembersController {
  constructor(private readonly svc: VendorMembersService) {}

  // Anyone with a resolvable vendor role can read the roster (so finance
  // / staff see who else is on the team). Write methods enforce owner.
  @Get()
  list(@CurrentUser() user: AuthUser | null) {
    return this.svc.listForCaller(requireUser(user));
  }

  @Get('me/role')
  async me(@CurrentUser() user: AuthUser | null) {
    const u = requireUser(user);
    return (await this.svc.getEffectiveRole(u)) ?? { vendorId: null, role: null };
  }

  @Post()
  invite(@CurrentUser() user: AuthUser | null, @Body() dto: InviteMemberDto) {
    return this.svc.invite(requireUser(user), dto);
  }

  @Patch(':id')
  updateRole(
    @CurrentUser() user: AuthUser | null,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.svc.updateRole(requireUser(user), id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser | null, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(requireUser(user), id);
  }
}
