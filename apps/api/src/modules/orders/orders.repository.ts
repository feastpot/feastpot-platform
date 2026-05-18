import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdWithItems(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        // Nested `user.phone` powers the customer-facing tracking page
        // WhatsApp / call CTAs (Vendor itself has no phone column).
        vendor: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            user: { select: { phone: true } },
          },
        },
        // Vendor portal renders customer first name on every order card. Selecting
        // only firstName + email keeps the row size small and avoids leaking
        // unrelated PII (passwordHash, phone, etc.) over the API.
        customer: { select: { id: true, firstName: true, email: true } },
        // Tracking page renders any pending amendment as a banner. Filtering
        // server-side keeps the response small and means the UI doesn't need
        // to know the AmendmentStatus enum values.
        amendments: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
        },
      },
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
      include: {
        items: true,
        // Same rationale as findByIdWithItems - vendor dashboard needs first name
        // per row to address customers by name.
        customer: { select: { id: true, firstName: true, email: true } },
      },
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

  /**
   * Order schema has no stripe_payment_intent_id column - Stripe identifiers live
   * on the related Payment row. We create a pending Payment row at order creation
   * time so the PI can be looked up later for capture/cancel/refund.
   */
  recordPaymentIntent(args: {
    orderId: string;
    userId: string;
    amountPence: number;
    stripePaymentIntentId: string;
  }) {
    return this.prisma.payment.create({
      data: {
        orderId: args.orderId,
        userId: args.userId,
        amountPence: args.amountPence,
        currency: 'GBP',
        stripePaymentIntentId: args.stripePaymentIntentId,
      },
    });
  }

  async findStripePaymentIntent(orderId: string): Promise<string | null> {
    const p = await this.prisma.payment.findFirst({
      where: { orderId, stripePaymentIntentId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { stripePaymentIntentId: true },
    });
    return p?.stripePaymentIntentId ?? null;
  }

  markPaymentStatus(stripePaymentIntentId: string, status: 'succeeded' | 'cancelled' | 'failed') {
    return this.prisma.payment.updateMany({
      where: { stripePaymentIntentId },
      data: { status, processedAt: new Date() },
    });
  }

  countToday(): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return this.prisma.order.count({ where: { createdAt: { gte: start } } });
  }

  /**
   * Atomic status transition: only updates the row if its current status matches
   * `expectedFrom`, returning the number of rows affected. Used as a CAS guard
   * around the status machine to prevent concurrent transitions from both
   * proceeding (and double-firing Stripe captures / queue jobs).
   */
  async transitionStatus(
    orderId: string,
    expectedFrom: OrderStatus,
    data: Prisma.OrderUncheckedUpdateInput,
  ): Promise<boolean> {
    const res = await this.prisma.order.updateMany({
      where: { id: orderId, status: expectedFrom },
      data,
    });
    return res.count === 1;
  }

  addressOwnedBy(addressId: string, userId: string) {
    return this.prisma.address.findFirst({ where: { id: addressId, userId }, select: { id: true } });
  }

  byCustomer(orderId: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        items: true,
        // Vendor businessName is needed for the confirmation notification
        // payload - selecting just the one field keeps the row size small.
        vendor: { select: { businessName: true } },
      },
    });
  }

  countByVendorAndStatus(vendorId: string, status: OrderStatus) {
    return this.prisma.order.count({ where: { vendorId, status } });
  }
}
