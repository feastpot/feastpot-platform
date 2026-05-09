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

interface RequestWithUser {
  user?: AuthUser | null;
  params: Record<string, string>;
}

/**
 * Verifies the authenticated user owns the vendor referenced by :vendorId in the URL.
 * Admins always pass. Anonymous users always fail.
 */
@Injectable()
export class VendorOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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
      select: { id: true, userId: true },
    });
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }
    if (vendor.userId !== user.id) {
      throw new ForbiddenException({
        code: 'NOT_VENDOR_OWNER',
        message: 'You do not own this vendor',
      });
    }
    return true;
  }
}
