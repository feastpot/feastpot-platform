import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { DeliveryType, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { Queue } from 'bull';
import { randomBytes } from 'node:crypto';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralService } from '../loyalty/referral.service';

import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersRepository } from './orders.repository';
import { OrderSlotsService } from './order-slots.service';

export const NOTIFICATIONS_QUEUE = 'notifications';
const AUTO_CANCEL_DELAY_MS = 15 * 60 * 1000;
const REVIEW_DELAY_MS = 2 * 60 * 60 * 1000;
const SERVICE_FEE_BPS = 0;

/**
 * Allowed status transitions and the role permitted to perform each.
 *   - vendor (acting on its own orders) drives the happy-path lifecycle.
 *   - admin can cancel or refund from any state.
 */
export const VENDOR_TRANSITIONS: ReadonlyMap<OrderStatus, ReadonlySet<OrderStatus>> = new Map<
  OrderStatus,
  ReadonlySet<OrderStatus>
>([
  [OrderStatus.pending, new Set<OrderStatus>([OrderStatus.accepted, OrderStatus.cancelled])], // 'rejected' uses cancelled with reason
  [OrderStatus.accepted, new Set<OrderStatus>([OrderStatus.preparing])],
  [OrderStatus.preparing, new Set<OrderStatus>([OrderStatus.dispatched])],
  [OrderStatus.dispatched, new Set<OrderStatus>([OrderStatus.delivered])],
]);
export const ADMIN_TRANSITIONS: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.cancelled,
  OrderStatus.refunded,
]);

export interface CommissionBreakdown {
  commissionPence: number;
  vendorPayoutPence: number;
}

export function computeCommission(totalPence: number, commissionBps: number): CommissionBreakdown {
  const commissionPence = Math.round((totalPence * commissionBps) / 10_000);
  return { commissionPence, vendorPayoutPence: totalPence - commissionPence };
}

export function isVendorTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return VENDOR_TRANSITIONS.get(from)?.has(to) ?? false;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: OrdersRepository,
    private readonly slots: OrderSlotsService,
    private readonly stripe: StripeService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
  ) {}

  // ------------------------------------------------------------------
  // CREATE
  // ------------------------------------------------------------------

  async createOrder(customerId: string, dto: CreateOrderDto) {
    const vendor = await this.repo.vendorWithDelivery(dto.vendorId);
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });

    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const items = await this.repo.findMenuItems(menuItemIds);
    const byId = new Map(items.map((i) => [i.id, i]));

    if (dto.deliveryAddressId) {
      const owned = await this.repo.addressOwnedBy(dto.deliveryAddressId, customerId);
      if (!owned) {
        throw new BadRequestException({
          code: 'ADDRESS_NOT_OWNED',
          message: 'Delivery address does not belong to this customer',
        });
      }
    }

    for (const input of dto.items) {
      const mi = byId.get(input.menuItemId);
      if (!mi) {
        throw new BadRequestException({ code: 'MENU_ITEM_NOT_FOUND', message: `Menu item ${input.menuItemId} not found` });
      }
      if (mi.vendorId !== dto.vendorId) {
        throw new BadRequestException({ code: 'MENU_ITEM_WRONG_VENDOR', message: `Menu item ${mi.id} does not belong to vendor` });
      }
      if (!mi.isAvailable) {
        throw new BadRequestException({ code: 'MENU_ITEM_UNAVAILABLE', message: `Menu item "${mi.name}" is not available` });
      }
    }

    const scheduledFor = new Date(dto.scheduledFor);
    const requiredLeadHours = items.reduce((max, i) => Math.max(max, i.preparationHours), 0);
    await this.slots.validateSlot(dto.vendorId, scheduledFor, requiredLeadHours);

    // Pricing
    const subtotalPence = dto.items.reduce((sum, input) => {
      const mi = byId.get(input.menuItemId)!;
      return sum + mi.pricePence * input.quantity;
    }, 0);

    const dc = vendor.deliveryConfig;
    const deliveryType = (dc?.types?.[0] ?? DeliveryType.local) as DeliveryType;
    let deliveryFeePence = 0;
    if (dc) {
      if (dc.minOrderPence > 0 && subtotalPence < dc.minOrderPence) {
        throw new BadRequestException({
          code: 'BELOW_MIN_ORDER',
          message: `Order must be at least ${dc.minOrderPence}p (vendor minimum)`,
        });
      }
      const baseFee = deliveryType === DeliveryType.nationwide ? dc.nationwideFeePence : dc.localFeePence;
      deliveryFeePence =
        dc.freeDeliveryOverPence !== null && dc.freeDeliveryOverPence !== undefined && subtotalPence >= dc.freeDeliveryOverPence
          ? 0
          : baseFee;
    }

    // Discount: schema has no DiscountCode model — accept the field but ignore it.
    if (dto.discountCode) {
      this.logger.warn(`Discount code "${dto.discountCode}" ignored (no DiscountCode model in schema)`);
    }

    // Loyalty redemption: cap to never exceed (subtotal + delivery) so the
    // order total can't go negative. We pre-validate the balance here
    // (read-only) and write the redeem ledger row AFTER the order row
    // exists, with the real orderId — that removes the need to patch a
    // freshly-orphaned row and eliminates a "wrong row picked under
    // concurrency" hazard. The window between assert + write is narrow
    // (single request) and the ledger write is itself idempotent per
    // (userId, orderId).
    let loyaltyToRedeem = 0;
    if (dto.loyaltyPointsToRedeem) {
      const maxRedeemable = subtotalPence + deliveryFeePence;
      const requested = Math.min(dto.loyaltyPointsToRedeem, maxRedeemable);
      if (requested >= 200) {
        await this.loyalty.assertCanRedeem(customerId, requested);
        loyaltyToRedeem = requested;
      }
    }

    const discountPence = loyaltyToRedeem;
    const serviceFeePence = Math.round((subtotalPence * SERVICE_FEE_BPS) / 10_000);
    const totalPence = Math.max(0, subtotalPence + deliveryFeePence + serviceFeePence - discountPence);

    const { commissionPence, vendorPayoutPence } = computeCommission(totalPence, vendor.commissionBps);
    const orderNumber = this.generateOrderNumber();

    // Transaction: create the order with snapshotted line items.
    const order = await this.repo.createWithItems({
      data: {
        orderNumber,
        customerId,
        vendorId: dto.vendorId,
        addressId: dto.deliveryAddressId ?? null,
        deliveryType,
        status: OrderStatus.pending,
        subtotalPence,
        deliveryFeePence,
        serviceFeePence,
        discountPence,
        totalPence,
        commissionPence,
        vendorPayoutPence,
        notes: dto.notes ?? null,
        scheduledFor,
      },
      items: dto.items.map((input) => {
        const mi = byId.get(input.menuItemId)!;
        return {
          menuItemId: mi.id,
          nameSnapshot: mi.name,
          quantity: input.quantity,
          unitPence: mi.pricePence,
          totalPence: mi.pricePence * input.quantity,
          notes: input.customisationNotes ?? null,
        };
      }),
    });

    // Write the redeemed-points ledger row with the real orderId. If this
    // throws after the order is committed the order's `discountPence` is
    // already on the order row — the caller will see the failure and
    // can retry; redeemPoints is idempotent per (userId, orderId) so a
    // retry won't double-debit.
    if (loyaltyToRedeem > 0) {
      await this.loyalty.redeemPoints(customerId, loyaltyToRedeem, order.id);
    }

    // Stripe payment intent (auth-only; capture happens on delivery).
    const intent = await this.stripe.createPaymentIntent({
      amountPence: totalPence,
      orderId: order.id,
      customerId,
      vendorId: dto.vendorId,
    });

    await this.repo.recordPaymentIntent({
      orderId: order.id,
      userId: customerId,
      amountPence: totalPence,
      stripePaymentIntentId: intent.id,
    });

    return { order, clientSecret: intent.client_secret };
  }

  // ------------------------------------------------------------------
  // CONFIRM (after Stripe client-side confirmation)
  // ------------------------------------------------------------------

  async confirmOrder(orderId: string, customerId: string) {
    const order = await this.repo.byCustomer(orderId, customerId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    // Idempotent: already-confirmed orders return success without re-enqueuing.
    if (order.status !== OrderStatus.pending) {
      return { confirmed: true, orderId, alreadyConfirmed: true };
    }

    const pi = await this.repo.findStripePaymentIntent(orderId);
    if (!pi) {
      throw new BadRequestException({
        code: 'NO_PAYMENT_INTENT',
        message: 'Order has no Stripe payment intent on record',
      });
    }
    const intent = await this.stripe.retrieve(pi);
    // Manual-capture flow: must be authorised (`requires_capture`) before vendor work begins.
    // We also accept `processing` as a transient post-confirmation state.
    if (!['requires_capture', 'processing'].includes(intent.status)) {
      throw new BadRequestException({
        code: 'PAYMENT_NOT_AUTHORISED',
        message: `Stripe payment intent is in state "${intent.status}", expected "requires_capture"`,
      });
    }

    await this.notifications.add('notify_vendor', { vendorId: order.vendorId, orderId });
    await this.notifications.add(
      'auto_cancel',
      { orderId },
      { delay: AUTO_CANCEL_DELAY_MS, jobId: `auto_cancel:${orderId}` },
    );
    // Customer-facing order_confirmation: registered template, dispatched on
    // email + sms + whatsapp + push by the processor based on the user's
    // contactable channels. `userId` is what the processor uses to look up
    // the recipient's email/phone — passing customerId fills that role.
    await this.notifications.add(
      'order_confirmation',
      {
        userId: order.customerId,
        orderId,
        orderNumber: order.orderNumber,
        vendorName: order.vendor?.businessName,
        totalPence: order.totalPence,
        scheduledFor: order.scheduledFor?.toISOString() ?? null,
        items: order.items.map((it) => ({ name: it.nameSnapshot, qty: it.quantity, pricePence: it.unitPence })),
      },
      { jobId: `order_confirmation:${orderId}` },
    );
    return { confirmed: true, orderId };
  }

  // ------------------------------------------------------------------
  // STATUS MACHINE
  // ------------------------------------------------------------------

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto, user: AuthUser) {
    const order = await this.repo.findByIdWithItems(orderId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (dto.status === order.status) {
      throw new BadRequestException({ code: 'NO_STATUS_CHANGE', message: `Order already ${order.status}` });
    }

    const isAdmin = user.role === UserRole.admin;
    const isVendorOwner = user.role === UserRole.vendor && order.vendor.userId === user.id;

    if (isAdmin && ADMIN_TRANSITIONS.has(dto.status)) {
      return this.applyAdminTerminal(order.id, order.status, dto);
    }
    if (!isVendorOwner) {
      throw new ForbiddenException({ code: 'NOT_ORDER_VENDOR', message: 'Only the owning vendor (or admin) may update this order' });
    }
    if (!isVendorTransitionAllowed(order.status, dto.status)) {
      throw new BadRequestException({
        code: 'ILLEGAL_TRANSITION',
        message: `Cannot move order from ${order.status} → ${dto.status}`,
      });
    }
    return this.applyVendorTransition(order.id, order.status, dto);
  }

  private async applyVendorTransition(orderId: string, from: OrderStatus, dto: UpdateOrderStatusDto) {
    // Snapshot the immutable order fields once — used below to enqueue
    // customer-facing notifications without re-fetching after the CAS.
    const snap = await this.repo.findByIdWithItems(orderId);
    const data: Prisma.OrderUncheckedUpdateInput = { status: dto.status };
    const now = new Date();

    if (dto.status === OrderStatus.accepted) data.acceptedAt = now;
    if (dto.status === OrderStatus.dispatched) data.dispatchedAt = now;
    if (dto.status === OrderStatus.delivered) data.deliveredAt = now;
    if (dto.status === OrderStatus.cancelled && from === OrderStatus.pending) {
      data.cancelledAt = now;
      data.notes = dto.rejectionReason
        ? `[REJECTED] ${dto.rejectionReason}`
        : '[REJECTED] Vendor declined order';
    }

    // Atomic CAS guard: refuses to write if another request already moved the row.
    const ok = await this.repo.transitionStatus(orderId, from, data);
    if (!ok) {
      throw new BadRequestException({
        code: 'STATUS_CHANGED_CONCURRENTLY',
        message: 'Order status changed concurrently; please reload and retry',
      });
    }

    // Side-effects only run after the CAS succeeded — guaranteeing exactly-once semantics.
    if (dto.status === OrderStatus.accepted) {
      try {
        const job = await this.notifications.getJob(`auto_cancel:${orderId}`);
        if (job) await job.remove();
      } catch (e) {
        this.logger.warn(`Could not remove auto_cancel job for ${orderId}: ${(e as Error).message}`);
      }
      if (snap) {
        await this.notifications.add(
          'order_accepted',
          {
            userId: snap.customerId,
            orderId,
            orderNumber: snap.orderNumber,
            vendorName: snap.vendor?.businessName,
            scheduledFor: snap.scheduledFor?.toISOString() ?? null,
          },
          { jobId: `order_accepted:${orderId}` },
        );
      }
    }

    if (dto.status === OrderStatus.dispatched && snap) {
      await this.notifications.add(
        'order_dispatched',
        {
          userId: snap.customerId,
          orderId,
          orderNumber: snap.orderNumber,
          vendorName: snap.vendor?.businessName,
          // ETA derived from scheduledFor when present; templates fall back
          // to "soon" if absent.
          etaText: snap.scheduledFor ? snap.scheduledFor.toISOString() : undefined,
        },
        { jobId: `order_dispatched:${orderId}` },
      );
    }

    if (dto.status === OrderStatus.cancelled && from === OrderStatus.pending) {
      const pi = await this.repo.findStripePaymentIntent(orderId);
      if (pi) {
        await this.stripe.cancel(pi);
        await this.repo.markPaymentStatus(pi, 'cancelled');
      }
      // Refund any loyalty redemption attached to this order so the
      // customer doesn't permanently lose points to a vendor-rejected
      // order. Idempotent on the loyalty side.
      if (snap) {
        try {
          await this.loyalty.refundRedemption(snap.customerId, orderId);
        } catch (e) {
          this.logger.error(`refundRedemption failed for ${orderId}: ${(e as Error).message}`);
        }
      }
    }

    if (dto.status === OrderStatus.delivered) {
      const pi = await this.repo.findStripePaymentIntent(orderId);
      if (pi) {
        await this.stripe.capture(pi);
        await this.repo.markPaymentStatus(pi, 'succeeded');
      }
      await this.notifications.add(
        'review_trigger',
        { orderId },
        { delay: REVIEW_DELAY_MS, jobId: `review_trigger:${orderId}` },
      );
      if (snap) {
        // FR-LOY-001: credit loyalty points (idempotent per orderId) +
        // FR-REF-001: reward referrer if this is the customer's first
        // delivered order. Both are best-effort — a transient failure
        // here must not roll back the delivered transition itself.
        let pointsEarned = 0;
        try {
          pointsEarned = await this.loyalty.creditPoints(
            snap.customerId,
            orderId,
            snap.totalPence,
          );
        } catch (e) {
          this.logger.error(`creditPoints failed for ${orderId}: ${(e as Error).message}`);
        }
        try {
          await this.referrals.rewardReferral(snap.customerId);
        } catch (e) {
          this.logger.error(`rewardReferral failed for ${orderId}: ${(e as Error).message}`);
        }

        await this.notifications.add(
          'delivery_confirmed',
          {
            userId: snap.customerId,
            orderId,
            orderNumber: snap.orderNumber,
            vendorName: snap.vendor?.businessName,
            loyaltyPointsEarned: pointsEarned,
          },
          { jobId: `delivery_confirmed:${orderId}` },
        );
      }
    }

    return this.repo.findByIdWithItems(orderId);
  }

  private async applyAdminTerminal(orderId: string, from: OrderStatus, dto: UpdateOrderStatusDto) {
    const now = new Date();
    const data: Prisma.OrderUncheckedUpdateInput = { status: dto.status, cancelledAt: now };
    const reason = dto.cancellationReason ?? 'Admin action';
    data.notes = dto.status === OrderStatus.refunded ? `[REFUNDED] ${reason}` : `[CANCELLED] ${reason}`;

    const ok = await this.repo.transitionStatus(orderId, from, data);
    if (!ok) {
      throw new BadRequestException({
        code: 'STATUS_CHANGED_CONCURRENTLY',
        message: 'Order status changed concurrently; please reload and retry',
      });
    }

    // Admin terminal cancel/refund — refund any loyalty redemption.
    const snap = await this.repo.findByIdWithItems(orderId);
    if (snap?.customerId) {
      try {
        await this.loyalty.refundRedemption(snap.customerId, orderId);
      } catch (e) {
        this.logger.error(`refundRedemption (admin) failed for ${orderId}: ${(e as Error).message}`);
      }
    }

    const pi = await this.repo.findStripePaymentIntent(orderId);
    if (pi) {
      if (dto.status === OrderStatus.refunded) {
        try {
          await this.stripe.refund(pi);
          // NB: payment row stays "succeeded" — refunds are tracked separately by Stripe;
          // a future Refund table would record the negative ledger entry.
        } catch {
          await this.stripe.cancel(pi);
          await this.repo.markPaymentStatus(pi, 'cancelled');
        }
      } else if (from !== OrderStatus.delivered) {
        await this.stripe.cancel(pi);
        await this.repo.markPaymentStatus(pi, 'cancelled');
      }
    }
    return this.repo.findByIdWithItems(orderId);
  }

  // ------------------------------------------------------------------
  // REORDER
  // ------------------------------------------------------------------

  async reorder(originalOrderId: string, customerId: string, overrides: ReorderDto) {
    const original = await this.repo.byCustomer(originalOrderId, customerId);
    if (!original) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Original order not found' });

    // Address ownership is re-validated inside createOrder(), so passing through is safe.
    const dto: CreateOrderDto = {
      vendorId: original.vendorId,
      items: original.items.map((i) => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        customisationNotes: i.notes ?? undefined,
      })),
      deliveryAddressId: overrides.deliveryAddressId ?? original.addressId ?? undefined,
      scheduledFor: overrides.scheduledFor,
      notes: overrides.notes ?? undefined,
    };
    return this.createOrder(customerId, dto);
  }

  // ------------------------------------------------------------------
  // LIST / GET
  // ------------------------------------------------------------------

  async list(user: AuthUser, dto: ListOrdersDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.OrderWhereInput = {};
    if (dto.status) where.status = dto.status;

    if (user.role === UserRole.admin) {
      if (dto.vendorId) where.vendorId = dto.vendorId;
    } else if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!vendor) return { data: [], nextCursor: null };
      where.vendorId = vendor.id;
    } else {
      where.customerId = user.id;
    }

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const rows = await this.repo.list({ where, take: limit, cursor });
    const nextCursor = rows.length === limit ? this.encodeCursor(rows[rows.length - 1]!) : null;
    return { data: rows, nextCursor };
  }

  async getById(id: string, user: AuthUser) {
    const order = await this.repo.findByIdWithItems(id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    const isAdmin = user.role === UserRole.admin;
    const isCustomer = order.customerId === user.id;
    const isVendor = user.role === UserRole.vendor && order.vendor.userId === user.id;
    if (!isAdmin && !isCustomer && !isVendor) {
      throw new ForbiddenException({ code: 'ORDER_FORBIDDEN', message: 'You may not view this order' });
    }
    return order;
  }

  // ------------------------------------------------------------------
  // AMENDMENT (stub — no Amendment model in schema yet)
  // ------------------------------------------------------------------

  requestAmendment(_orderId: string, _user: AuthUser): never {
    throw new NotImplementedException({
      code: 'AMENDMENTS_NOT_IMPLEMENTED',
      message: 'Order amendments require an Amendment table — not yet present in schema.',
    });
  }
  respondAmendment(_orderId: string, _user: AuthUser): never {
    throw new NotImplementedException({
      code: 'AMENDMENTS_NOT_IMPLEMENTED',
      message: 'Order amendments require an Amendment table — not yet present in schema.',
    });
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private generateOrderNumber(): string {
    // Random suffix avoids the count-then-insert race that the prior `countToday()+1`
    // approach had under concurrency. The DB unique index on order_number is the
    // ultimate guarantor; collisions in 6 hex chars (~16M space) per day are negligible.
    const today = new Date();
    const ymd = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `FP-${ymd}-${suffix}`;
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
