import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../../auth/types';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  VENDOR_MENU_ROLES,
  VendorMembersService,
} from '../../vendor-members/vendor-members.service';

interface RequestWithUser {
  user?: AuthUser | null;
  params: Record<string, string>;
}

/**
 * Verifies the authenticated user can act on the vendor referenced by
 * :vendorId in the URL with menu-management permissions. Owner of the
 * vendor or an active VendorMember with role `owner` or `kitchen_manager`
 * pass. Platform admins always pass. Anonymous users always fail.
 */
@Injectable()
export class VendorOwnershipGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: VendorMembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user ?? null;
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    if (user.role === UserRole.admin) return true;

    const vendorId = req.params.vendorId;
    if (!vendorId) {
      throw new ForbiddenException({ code: 'VENDOR_ID_MISSING', message: 'vendorId path param missing' });
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }
    const allowed = await this.members.canActOnVendor(user.id, vendorId, VENDOR_MENU_ROLES);
    if (!allowed) {
      throw new ForbiddenException({
        code: 'NOT_VENDOR_OWNER',
        message: 'Your role on this vendor team does not include menu management',
      });
    }
    return true;
  }
}
