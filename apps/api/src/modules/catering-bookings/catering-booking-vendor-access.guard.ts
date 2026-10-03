import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Check authenticated vendor ownership before pipes, payment-state shortcuts
 * and QR handlers. Customer payment-link behaviour remains unchanged.
 */
@Injectable()
export class CateringBookingVendorAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params: { id?: string };
    }>();
    if (request.user?.role !== UserRole.vendor || !request.params.id) return true;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(request.params.id)) return true;
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: request.params.id },
      select: { vendor: { select: { userId: true } } },
    });
    if (booking && booking.vendor.userId !== request.user.id) {
      throw new ForbiddenException({
        code: 'CATERING_BOOKING_FORBIDDEN',
        message: 'Cannot access another vendor booking',
      });
    }
    return true;
  }
}
