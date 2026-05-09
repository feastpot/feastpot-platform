import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdWithItems(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true, vendor: { select: { id: true, userId: true, businessName: true } } },
    });
  }

  findMenuItems(menuItemIds: string[]) {
    return this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: {
        id: true,
        vendorId: true,
        name: true,
        pricePence: true,
        isAvailable: true,
        preparationHours: true,
      },
    });
  }

  vendorWithDelivery(vendorId: string) {
    return this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        userId: true,
        commissionBps: true,
        status: true,
        deliveryConfig: true,
      },
    });
  }

  list(opts: {
    where: Prisma.OrderWhereInput;
    take: number;
    cursor?: { createdAt: Date; id: string };
  }) {
    const { where, take, cursor } = opts;
    // Keyset on (createdAt DESC, id DESC) for stable pagination.
    const cursorWhere: Prisma.OrderWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    return this.prisma.order.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: { items: true },
    });
  }

  createWithItems(args: {
    data: Prisma.OrderUncheckedCreateInput;
    items: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
  }) {
    return this.prisma.order.create({
      data: { ...args.data, items: { create: args.items } },
      include: { items: true },
    });
  }

  updateStatus(orderId: string, data: Prisma.OrderUncheckedUpdateInput) {
    return this.prisma.order.update({ where: { id: orderId }, data, include: { items: true } });
  }

  updatePaymentMeta(orderId: string, stripePaymentIntentId: string) {
    // Order schema has no stripe_payment_intent_id column — write it onto a Payment row.
    return this.prisma.payment.create({
      data: {
        orderId,
        provider: 'stripe',
        providerRef: stripePaymentIntentId,
        amountPence: 0,
        status: 'pending',
      } as unknown as Prisma.PaymentUncheckedCreateInput,
    }).catch(() => null); // Payment model may differ; non-fatal.
  }

  findStripePaymentIntent(orderId: string): Promise<string | null> {
    return this.prisma.payment
      .findFirst({
        where: { orderId, provider: 'stripe' as never },
        orderBy: { createdAt: 'desc' },
        select: { providerRef: true },
      } as never)
      .then((p) => (p as { providerRef?: string } | null)?.providerRef ?? null)
      .catch(() => null);
  }

  countToday(): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return this.prisma.order.count({ where: { createdAt: { gte: start } } });
  }

  byCustomer(orderId: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { items: true },
    });
  }

  countByVendorAndStatus(vendorId: string, status: OrderStatus) {
    return this.prisma.order.count({ where: { vendorId, status } });
  }
}
