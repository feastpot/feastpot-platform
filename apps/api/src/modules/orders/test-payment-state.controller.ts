import { Controller, Get, Headers, NotFoundException, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-only assertion seam for the isolated browser-payment suite.
 *
 * This is intentionally not an operations endpoint: it only exists in a test
 * process, requires the exact per-run factory namespace, and only returns the
 * calling factory customer's own order, payment, and dispute assertion fields.
 * In every other environment it responds as though the route does not exist.
 */
@Controller({ path: 'test/payment-state', version: '1' })
export class TestPaymentStateController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(UserRole.customer)
  async inspect(
    @Req() req: AuthedRequest,
    @Headers('x-test-factory-namespace') namespace?: string,
  ) {
    const user = this.requireFactoryCustomer(req.user, namespace);
    const orders = await this.prisma.order.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        subtotalPence: true,
        deliveryFeePence: true,
        serviceFeePence: true,
        discountPence: true,
        totalPence: true,
        payments: { select: { id: true, status: true, orderId: true } },
        disputes: { select: { id: true, status: true, orderId: true } },
      },
    });

    return {
      namespace,
      orders: orders.map((order) => ({
        id: order.id,
        status: order.status,
        subtotalPence: order.subtotalPence,
        deliveryFeePence: order.deliveryFeePence,
        serviceFeePence: order.serviceFeePence,
        discountPence: order.discountPence,
        totalPence: order.totalPence,
        payments: order.payments,
        disputes: order.disputes,
      })),
    };
  }

  private requireFactoryCustomer(user: AuthUser | null, namespace?: string): AuthUser {
    const configuredNamespace = process.env.TEST_FACTORY_NAMESPACE;
    const safeNamespace = /^[a-z0-9][a-z0-9-]{7,}$/i.test(namespace ?? '');
    if (
      process.env.NODE_ENV !== 'test' ||
      !configuredNamespace ||
      namespace !== configuredNamespace ||
      !safeNamespace ||
      !user ||
      !user.email.toLowerCase().startsWith(`tf-${namespace.toLowerCase()}-`)
    ) {
      // Do not reveal that this test seam exists, or any information about
      // another customer/namespace, outside the dedicated test process.
      throw new NotFoundException();
    }
    return user;
  }
}
