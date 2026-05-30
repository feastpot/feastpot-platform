import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AmendmentStatus, DeliveryType, ItemCategory, LoyaltyTxType, ModerationStatus, OrderStatus, OrderType, Prisma, UserRole } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { Queue } from 'bull';
import { randomBytes, randomUUID } from 'node:crypto';

import type { AuthUser } from '../../auth/types';
import { getServiceFeePence } from '../../common/config/service-fee';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { InboxService } from '../inbox/inbox.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralService } from '../loyalty/referral.service';
import { PaymentsService } from '../payments/payments.service';
import {
  VENDOR_ORDER_ROLES,
  VendorMembersService,
} from '../vendor-members/vendor-members.service';

import { ProposeAmendmentDto, RespondAmendmentDto } from './dto/amendment.dto';

import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderSlotsService } from './order-slots.service';
import { OrdersRepository } from './orders.repository';

export const NOTIFICATIONS_QUEUE = 'notifications';
const AUTO_CANCEL_DELAY_MS = 15 * 60 * 1000;
const REVIEW_DELAY_MS = 2 * 60 * 60 * 1000;

/**
 * Allowed status transitions and the role permitted to perform each.
 *   - vendor (acting on its own orders) drives the happy-path lifecycle.
 *   - admin can cancel or refund from any state.
 */
export const VENDOR_TRANSITIONS: ReadonlyMap<OrderStatus, ReadonlySet<OrderStatus>> = new Map<
  OrderStatus,
  ReadonlySet<OrderStatus>
>([
  [
    OrderStatus.pending,
    new Set<OrderStatus>([
      OrderStatus.accepted,
      OrderStatus.rejected,
      OrderStatus.needs_clarification,
      OrderStatus.cancelled,
    ]),
  ],
  [
    OrderStatus.accepted,
    new Set<OrderStatus>([OrderStatus.preparing, OrderStatus.needs_clarification]),
  ],
  [
    OrderStatus.needs_clarification,
    new Set<OrderStatus>([
      OrderStatus.accepted,
      OrderStatus.rejected,
      OrderStatus.cancelled,
    ]),
  ],
  [
    OrderStatus.preparing,
    new Set<OrderStatus>([OrderStatus.ready, OrderStatus.dispatched]),
  ],
  [OrderStatus.ready, new Set<OrderStatus>([OrderStatus.dispatched, OrderStatus.delivered])],
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

/**
 * Commission is charged on the vendor's food revenue (subtotalPence) only -
 * NOT on delivery fees (which are vendor reimbursement, not vendor income)
 * and NOT on the platform service fee (which is platform revenue, not the
 * vendor's). The vendor's payout is the customer-paid total minus the
 * platform commission, so the vendor still receives their delivery-fee
 * reimbursement and any service-fee that flowed to the order in full.
 */
export function computeCommission(
  subtotalPence: number,
  totalPence: number,
  commissionBps: number,
): CommissionBreakdown {
  const commissionPence = Math.round((subtotalPence * commissionBps) / 10_000);
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
    private readonly discountCodes: DiscountCodesService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    // T007: in-app inbox emitter. InboxModule is @Global() so no module
    // import is needed; failures are swallowed by the service.
    private readonly inbox: InboxService,
    // T010: server-side RBAC across vendor team members (orders surface).
    private readonly members: VendorMembersService,
  ) {}

  // Best-effort BullMQ wrappers. When REDIS_URL is unset (dev/CI), the
  // injected Queue uses lazyConnect + enableOfflineQueue:false, so the very
  // first add()/getJob() throws "Connection is closed." and 500s the whole
  // request (e.g. POST /orders/:id/confirm). Enqueue failures must NEVER
  // block the synchronous user-facing flow - jobs are observability/comms,
  // not source-of-truth. We log and swallow.
  private async safeEnqueue(
    name: string,
    data: Record<string, unknown>,
    opts?: Parameters<Queue['add']>[2],
  ): Promise<void> {
    try {
      await this.notifications.add(name, data, opts);
    } catch (e) {
      this.logger.warn(`safeEnqueue(${name}) failed: ${(e as Error).message}`);
    }
  }

  private async safeGetJob(jobId: string): Promise<Awaited<ReturnType<Queue['getJob']>> | null> {
    try {
      return await this.notifications.getJob(jobId);
    } catch (e) {
      this.logger.warn(`safeGetJob(${jobId}) failed: ${(e as Error).message}`);
      return null;
    }
  }

  // Window during which a vendor-proposed amendment auto-expires if the
  // customer doesn't respond. Kept short so we don't sit on the order.
  private static readonly AMENDMENT_TTL_MS = 30 * 60 * 1000;
  // Grace window after vendor's stated ETA before we ping the customer.
  private static readonly ETA_OVERDUE_GRACE_MS = 10 * 60 * 1000;

  /**
   * Reject orders whose delivery address falls outside the vendor's local
   * delivery radius. Fails OPEN (allows the order) when we genuinely can't
   * tell - vendor hasn't geocoded their location, no delivery address is
   * attached (collection), or postcode geocoding is unavailable - so a
   * transient postcodes.io outage never blocks legitimate checkout.
   */
  private async assertWithinDeliveryArea(
    vendor: { businessName: string | null; deliveryConfig: { latitude: number | null; longitude: number | null; localRadiusMiles: number } | null },
    address: { postcode: string; latitude: number | null; longitude: number | null } | null,
  ): Promise<void> {
    const dc = vendor.deliveryConfig;
    if (!dc || dc.latitude == null || dc.longitude == null) return;
    if (!address) return;

    // Prefer the address's cached coordinates; geocode the postcode only when
    // they're missing (older address rows pre-date coordinate capture).
    let lat = address.latitude;
    let lng = address.longitude;
    if (lat == null || lng == null) {
      const geo = await geocodeOrderPostcode(address.postcode, this.logger);
      lat = geo.latitude;
      lng = geo.longitude;
    }
    if (lat == null || lng == null) return; // geocode failed - fail open

    const distanceMiles = haversineMiles({ lat, lng }, { lat: dc.latitude, lng: dc.longitude });
    const radiusMiles = dc.localRadiusMiles ?? 5;
    if (distanceMiles > radiusMiles) {
      throw new BadRequestException({
        code: 'OUTSIDE_DELIVERY_AREA',
        message: `${vendor.businessName ?? 'This kitchen'} delivers within ${radiusMiles} miles, but this address is ${distanceMiles.toFixed(1)} miles away. Please choose an address inside the delivery area.`,
      });
    }
  }

  // ------------------------------------------------------------------
  // CREATE
  // ------------------------------------------------------------------

  async createOrder(customerId: string, dto: CreateOrderDto) {
    // Wrap the entire order creation path in a Sentry transaction so the
    // Performance dashboard breaks down P95 latency by sub-span (Prisma
    // round-trips, Stripe PI creation, BullMQ enqueues). Sentry no-ops
    // gracefully when SENTRY_DSN is unset.
    return Sentry.startSpan(
      { name: 'createOrder', op: 'order.create', attributes: { vendorId: dto.vendorId } },
      () => this.createOrderInner(customerId, dto),
    );
  }

  private async createOrderInner(customerId: string, dto: CreateOrderDto) {
    const vendor = await this.repo.vendorWithDelivery(dto.vendorId);
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });

    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const items = await this.repo.findMenuItems(menuItemIds);
    const byId = new Map(items.map((i) => [i.id, i]));

    let deliveryAddress: {
      id: string;
      postcode: string;
      latitude: number | null;
      longitude: number | null;
    } | null = null;
    if (dto.deliveryAddressId) {
      const owned = await this.repo.addressOwnedBy(dto.deliveryAddressId, customerId);
      if (!owned) {
        throw new BadRequestException({
          code: 'ADDRESS_NOT_OWNED',
          message: 'Delivery address does not belong to this customer',
        });
      }
      deliveryAddress = owned;
    }

    // Delivery-radius enforcement (source of truth). The client surfaces a
    // coverage badge, but the server is the real guard so an out-of-area
    // order can never be created (and never reaches Stripe). We run this
    // BEFORE slot validation / pricing / PaymentIntent creation so a rejected
    // address fails fast with no side effects.
    await this.assertWithinDeliveryArea(vendor, deliveryAddress);

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
      // Moderation gate: held / rejected items can never be purchased, even if
      // the vendor flipped them to available or the client holds a stale id.
      if (
        mi.moderationStatus !== ModerationStatus.auto_approved &&
        mi.moderationStatus !== ModerationStatus.approved
      ) {
        throw new BadRequestException({ code: 'MENU_ITEM_UNAVAILABLE', message: `Menu item "${mi.name}" is not available` });
      }
    }

    const scheduledFor = new Date(dto.scheduledFor);
    const requiredLeadHours = items.reduce((max, i) => Math.max(max, i.preparationHours), 0);
    // Sum cart tray quantity for the daily-tray cap + large-order lead
    // checks. Done by ID lookup so a cart line for a non-existent item
    // doesn't sneak past the per-input loop above (which has already
    // validated it).
    const trayCount = dto.items.reduce((sum, input) => {
      const mi = byId.get(input.menuItemId);
      return mi?.category === ItemCategory.tray ? sum + input.quantity : sum;
    }, 0);
    await this.slots.validateSlot(dto.vendorId, scheduledFor, {
      requiredLeadHours,
      trayCount,
      orderType: OrderType.standard,
    });

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

    // FR-DISC-001 promo code. Validation throws BadRequest with the
    // customer-friendly message the checkout UI surfaces verbatim. The
    // redemption counter (`used_count`) is bumped later, in confirmOrder,
    // so an abandoned checkout doesn't burn one of the code's `maxUses`.
    let promoDiscountPence = 0;
    let discountCodeId: string | null = null;
    if (dto.discountCode) {
      const result = await this.discountCodes.validate(
        dto.discountCode,
        dto.vendorId,
        subtotalPence,
      );
      promoDiscountPence = result.discountPence;
      discountCodeId = result.discountCodeId;
    }

    // Loyalty redemption: cap to never exceed (subtotal + delivery) so the
    // order total can't go negative. We pre-validate the balance here
    // (read-only) and write the redeem ledger row AFTER the order row
    // exists, with the real orderId - that removes the need to patch a
    // freshly-orphaned row and eliminates a "wrong row picked under
    // concurrency" hazard. The window between assert + write is narrow
    // (single request) and the ledger write is itself idempotent per
    // (userId, orderId).
    // Cap loyalty redemption against the value REMAINING after the promo
    // discount, never the gross order value. Without this, a customer
    // with promo=£5 on a £10 order could redeem £10 of points and we'd
    // debit the full 1000pt while only £5 of value was actually applied
    // (the total clamps at £0). Subtracting promo first keeps the
    // ledger debit equal to the cash discount delivered.
    let loyaltyToRedeem = 0;
    if (dto.loyaltyPointsToRedeem) {
      const maxRedeemable = Math.max(0, subtotalPence + deliveryFeePence - promoDiscountPence);
      const requested = Math.min(dto.loyaltyPointsToRedeem, maxRedeemable);
      if (requested >= 200) {
        await this.loyalty.assertCanRedeem(customerId, requested);
        loyaltyToRedeem = requested;
      }
    }

    // Combine loyalty + promo discounts. Final clamp ensures total never
    // dips below £0 even if the two stack to more than the order value.
    const discountPence = loyaltyToRedeem + promoDiscountPence;
    const serviceFeePence = getServiceFeePence(subtotalPence);
    const totalPence = Math.max(0, subtotalPence + deliveryFeePence + serviceFeePence - discountPence);

    const { commissionPence, vendorPayoutPence } = computeCommission(
      subtotalPence,
      totalPence,
      vendor.commissionBps,
    );
    const orderNumber = this.generateOrderNumber();
    // Generate the order id client-side so the Stripe PI (created BEFORE the
    // DB transaction, for idempotency) can carry the real orderId in its
    // metadata - matches the value the order row will be inserted with.
    const orderId = randomUUID();

    // Stripe PI is created BEFORE the DB transaction so we have a single
    // outbound side-effect to compensate for if the DB tx fails (cancel the
    // PI). orderNumber is unique-per-attempt and stable across SDK-level
    // retries, making it a safe Stripe idempotency key. Tracked as its own
    // Sentry span - Stripe is the dominant external dependency in createOrder.
    const intent = await Sentry.startSpan(
      { name: 'stripe.paymentIntents.create', op: 'http.client', attributes: { orderId } },
      () =>
        this.stripe.createPaymentIntent({
          amountPence: totalPence,
          orderId,
          customerId,
          vendorId: dto.vendorId,
          idempotencyKey: orderNumber,
        }),
    );

    try {
      // ATOMIC: order row + line items + payment row + loyalty debit are all
      // committed in a single Prisma interactive transaction. If any step
      // throws, every write rolls back together - no half-created order, no
      // orphaned loyalty debit, no payment row pointing at a non-existent
      // order. The compensating action for the already-created Stripe PI
      // happens in the catch block below.
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            id: orderId,
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
            discountCodeId,
            items: {
              create: dto.items.map((input) => {
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
            },
          },
          include: { items: true },
        });

        // Payment row holds the Stripe PI ID (the Order model has no
        // stripePaymentIntentId column - PI lives on the related Payment row).
        await tx.payment.create({
          data: {
            orderId: created.id,
            userId: customerId,
            amountPence: totalPence,
            stripePaymentIntentId: intent.id,
          },
        });

        // Loyalty debit, atomic with the order. We replicate the per-user
        // advisory-lock pattern that LoyaltyService.redeemPoints uses
        // (pg_advisory_xact_lock with the same key shape) so concurrent
        // checkouts for the same user serialize on the balance read+write
        // and cannot overdraw the ledger. Cannot reuse redeemPoints() here
        // because it opens its own interactive transaction - Prisma doesn't
        // support nesting interactive txs on a single connection.
        if (loyaltyToRedeem > 0) {
          const lockKey = `loyalty:user:${customerId}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

          // Idempotency per (userId, orderId) - same guard as redeemPoints.
          const existing = await tx.loyaltyPoint.findFirst({
            where: { userId: customerId, orderId: created.id, type: LoyaltyTxType.redeemed },
            select: { id: true },
          });
          if (!existing) {
            const agg = await tx.loyaltyPoint.aggregate({
              where: { userId: customerId },
              _sum: { points: true },
            });
            const balance = agg._sum.points ?? 0;
            if (balance < loyaltyToRedeem) {
              throw new BadRequestException({
                code: 'LOYALTY_INSUFFICIENT',
                message: 'Insufficient loyalty points',
              });
            }
            await tx.loyaltyPoint.create({
              data: {
                userId: customerId,
                orderId: created.id,
                type: LoyaltyTxType.redeemed,
                points: -loyaltyToRedeem,
                reason: `Redeemed ${loyaltyToRedeem} points at checkout`,
              },
            });
          }
        }

        return created;
      });

      return { order, clientSecret: intent.client_secret };
    } catch (err) {
      // DB tx rolled back - release the Stripe authorization so the
      // customer's card isn't held against an order that doesn't exist.
      // Swallow the cancel failure (log only) so the original DB error
      // surfaces to the caller; PI cleanup is best-effort.
      await this.stripe.cancel(intent.id).catch((cancelErr) => {
        this.logger.error(
          `Failed to cancel orphaned Stripe PI ${intent.id} after order tx rollback: ${(cancelErr as Error).message}`,
        );
      });
      throw err;
    }
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

    // FR-DISC-001: bump the discount code's used_count exactly once, AFTER
    // Stripe authorisation succeeds. We use a per-order CAS on
    // `discount_applied_at` so concurrent confirmOrder calls (e.g. customer
    // double-clicks "Pay" while the order row is still `pending`) can never
    // double-increment. Best-effort - a transient failure here must not
    // block the customer from being told the order is confirmed.
    if (order.discountCodeId) {
      try {
        const cas = await this.prisma.$executeRaw`
          UPDATE "orders"
             SET "discount_applied_at" = NOW()
           WHERE "id" = ${orderId}::uuid
             AND "discount_code_id" IS NOT NULL
             AND "discount_applied_at" IS NULL
        `;
        if (cas > 0) {
          await this.discountCodes.applyToOrder(order.discountCodeId);
        }
      } catch (e) {
        this.logger.error(
          `applyToOrder (discount=${order.discountCodeId}) failed for ${orderId}: ${(e as Error).message}`,
        );
      }
    }

    await this.safeEnqueue('notify_vendor', { vendorId: order.vendorId, orderId });
    // T007: vendor inbox - new paid order. Resolve vendor.userId via the
    // include already loaded above. Best-effort: failure is swallowed by
    // InboxService and must NOT block order confirmation.
    if (order.vendor?.userId) {
      await this.inbox.notify({
        userId: order.vendor.userId,
        type: 'order_created',
        title: `New order ${order.orderNumber}`,
        body: `${order.items.length} item${order.items.length === 1 ? '' : 's'}, £${(order.totalPence / 100).toFixed(2)} total. Tap to review.`,
        link: `/orders/${orderId}`,
        metadata: { orderId, orderNumber: order.orderNumber },
      });
    }
    await this.safeEnqueue(
      'auto_cancel',
      { orderId },
      { delay: AUTO_CANCEL_DELAY_MS, jobId: `auto_cancel:${orderId}` },
    );
    // Customer-facing order_confirmation: registered template, dispatched on
    // email + sms + whatsapp + push by the processor based on the user's
    // contactable channels. `userId` is what the processor uses to look up
    // the recipient's email/phone - passing customerId fills that role.
    await this.safeEnqueue(
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
    const canVendorAct = await this.members.canActOnVendor(
      user.id,
      order.vendorId,
      VENDOR_ORDER_ROLES,
    );

    if (isAdmin && ADMIN_TRANSITIONS.has(dto.status)) {
      return this.applyAdminTerminal(order.id, order.status, dto);
    }
    if (!canVendorAct) {
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
    // Snapshot the immutable order fields once - used below to enqueue
    // customer-facing notifications without re-fetching after the CAS.
    const snap = await this.repo.findByIdWithItems(orderId);
    const data: Prisma.OrderUncheckedUpdateInput = { status: dto.status };
    const now = new Date();

    if (dto.status === OrderStatus.accepted) data.acceptedAt = now;
    if (dto.status === OrderStatus.dispatched) {
      data.dispatchedAt = now;
      // FR-TRK-001: vendor MAY supply an ETA (minutes from now). Stamp both
      // the raw minutes and the absolute eta_at so customers see a stable
      // wall-clock target even if their device clock drifts.
      if (dto.etaMinutes != null) {
        data.etaMinutes = dto.etaMinutes;
        data.etaAt = new Date(now.getTime() + dto.etaMinutes * 60_000);
      }
    }
    if (dto.status === OrderStatus.delivered) data.deliveredAt = now;
    if (dto.status === OrderStatus.cancelled) {
      data.cancelledAt = now;
      if (dto.cancellationReason) {
        data.cancellationReason = dto.cancellationReason;
        data.cancelledBy = 'vendor';
      }
    }
    if (dto.status === OrderStatus.rejected) {
      // Rejection is a terminal pre-acceptance state. We stamp cancelledAt
      // so reporting / payout sweeps that key off "is this order over?" keep
      // working without learning a new column.
      data.cancelledAt = now;
      data.cancellationReason = dto.rejectionReason ?? 'Vendor declined order';
      data.cancelledBy = 'vendor';
    }
    if (dto.status === OrderStatus.needs_clarification && dto.clarificationNote) {
      // Append the question to notes so the existing notes-banner surfaces it
      // on the customer tracking page without a new column.
      const prefix = snap?.notes ? `${snap.notes}\n\n` : '';
      data.notes = `${prefix}[VENDOR QUESTION] ${dto.clarificationNote}`;
    }

    // Atomic CAS guard: refuses to write if another request already moved the row.
    const ok = await this.repo.transitionStatus(orderId, from, data);
    if (!ok) {
      throw new BadRequestException({
        code: 'STATUS_CHANGED_CONCURRENTLY',
        message: 'Order status changed concurrently; please reload and retry',
      });
    }

    // Side-effects only run after the CAS succeeded - guaranteeing exactly-once semantics.
    if (dto.status === OrderStatus.accepted) {
      try {
        const job = await this.safeGetJob(`auto_cancel:${orderId}`);
        if (job) await job.remove();
      } catch (e) {
        this.logger.warn(`Could not remove auto_cancel job for ${orderId}: ${(e as Error).message}`);
      }
      if (snap) {
        await this.safeEnqueue(
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
      const etaAt = dto.etaMinutes != null ? new Date(now.getTime() + dto.etaMinutes * 60_000) : null;
      const etaText = etaAt
        ? etaAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : snap.scheduledFor
          ? snap.scheduledFor.toISOString()
          : undefined;
      await this.safeEnqueue(
        'order_dispatched',
        {
          userId: snap.customerId,
          orderId,
          orderNumber: snap.orderNumber,
          vendorName: snap.vendor?.businessName,
          etaText,
        },
        { jobId: `order_dispatched:${orderId}` },
      );
      // Schedule eta_overdue check after the vendor's ETA + grace window.
      // Job name doubles as the dispatch type the processor branches on.
      if (etaAt) {
        const delay = etaAt.getTime() - now.getTime() + OrdersService.ETA_OVERDUE_GRACE_MS;
        await this.safeEnqueue(
          'eta_overdue',
          { orderId, customerId: snap.customerId },
          { jobId: `eta_overdue:${orderId}`, delay: Math.max(delay, 60_000) },
        );
      }
    }

    // Vendor-driven terminal pre-prep exits: pending → cancelled (legacy
     // path) and the new pending|needs_clarification → rejected path. Both
     // need to release the Stripe authorisation and refund any loyalty
     // points that were redeemed against the order.
    const isVendorReject =
      dto.status === OrderStatus.rejected &&
      (from === OrderStatus.pending || from === OrderStatus.needs_clarification);
    const isVendorPendingCancel =
      dto.status === OrderStatus.cancelled && from === OrderStatus.pending;
    if (isVendorReject || isVendorPendingCancel) {
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
      await this.safeEnqueue(
        'review_trigger',
        { orderId },
        { delay: REVIEW_DELAY_MS, jobId: `review_trigger:${orderId}` },
      );
      if (snap) {
        // FR-LOY-001: credit loyalty points (idempotent per orderId) +
        // FR-REF-001: reward referrer if this is the customer's first
        // delivered order. Both are best-effort - a transient failure
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

        await this.safeEnqueue(
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

    // Admin terminal cancel/refund - refund any loyalty redemption.
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
          // NB: payment row stays "succeeded" - refunds are tracked separately by Stripe;
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
  // CUSTOMER CANCEL (UK Consumer Contracts Regulations 2013)
  // ------------------------------------------------------------------

  /**
   * Customer self-cancellation. Permitted only while the order is still in a
   * pre-prep state (pending or accepted) - once the vendor moves to
   * `preparing`, ingredients are committed and refunds become a dispute
   * (handled separately).
   *
   * NB on Stripe: this codebase uses MANUAL CAPTURE (capture happens on
   * `delivered`). For BOTH `pending` and `accepted` the PaymentIntent is
   * still in `requires_capture` - `refunds.create` would 400 with
   * "charge has not been captured yet". So we always `paymentIntents.cancel`
   * here regardless of status; the customer is never charged in the first
   * place. (The spec literally says refund-on-accepted; we deliberately
   * deviate because that call would fail at runtime.)
   */
  async customerCancel(orderId: string, customerId: string, reason: string) {
    const order = await this.repo.findByIdWithItems(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    if (order.customerId !== customerId) {
      throw new ForbiddenException({ code: 'NOT_YOUR_ORDER', message: 'Not your order' });
    }

    const cancellable: OrderStatus[] = [OrderStatus.pending, OrderStatus.accepted];
    if (!cancellable.includes(order.status)) {
      const message =
        order.status === OrderStatus.preparing
          ? 'Your order is already being prepared - please contact the vendor'
          : order.status === OrderStatus.dispatched
            ? 'Your order is already on the way'
            : order.status === OrderStatus.delivered
              ? 'This order has already been delivered'
              : 'This order cannot be cancelled';
      throw new BadRequestException({ code: 'ORDER_NOT_CANCELLABLE', message });
    }

    const now = new Date();

    // Atomic CAS through the existing repository helper guarantees we only
    // write if the row is still in the status we read. If a vendor accepted
    // (pending → accepted) between read and write, the second cancel-from-
    // pending attempt is rejected and the customer is asked to reload.
    const ok = await this.repo.transitionStatus(orderId, order.status, {
      status: OrderStatus.cancelled,
      cancelledAt: now,
      cancellationReason: reason,
      cancelledBy: 'customer',
    });
    if (!ok) {
      throw new BadRequestException({
        code: 'STATUS_CHANGED_CONCURRENTLY',
        message: 'Order status changed while you were cancelling - please reload and retry',
      });
    }

    // Audit trail - schema uses actorId + metadata (not actorUserId/newState).
    await this.prisma.auditLog
      .create({
        data: {
          actorId: customerId,
          entityType: 'orders',
          entityId: orderId,
          action: 'order.cancelled_by_customer',
          metadata: { status: 'cancelled', reason, previousStatus: order.status },
        },
      })
      .catch((e) =>
        this.logger.error(`AuditLog write failed for cancel ${orderId}: ${(e as Error).message}`),
      );

    // Release the auto-cancel job so it doesn't fire after the row is already terminal.
    try {
      const job = await this.safeGetJob(`auto_cancel:${orderId}`);
      if (job) await job.remove();
    } catch (e) {
      this.logger.warn(`Could not remove auto_cancel job for ${orderId}: ${(e as Error).message}`);
    }

    // Cancel the (still uncaptured) PaymentIntent so the auth is released.
    const pi = await this.repo.findStripePaymentIntent(orderId);
    if (pi) {
      try {
        await this.stripe.cancel(pi);
        await this.repo.markPaymentStatus(pi, 'cancelled');
      } catch (e) {
        // Stripe failure must not block the cancel - the customer's intent
        // is already recorded; ops can reconcile from the audit log + Stripe
        // dashboard. Log loudly so on-call sees it.
        this.logger.error(
          `Stripe cancel failed for order ${orderId} pi=${pi}: ${(e as Error).message}`,
        );
      }
    }

    // Refund any loyalty redemption attached so the customer doesn't lose
    // points to their own cancellation. Idempotent on the loyalty side.
    try {
      await this.loyalty.refundRedemption(customerId, orderId);
    } catch (e) {
      this.logger.error(
        `refundRedemption (customer-cancel) failed for ${orderId}: ${(e as Error).message}`,
      );
    }

    // Confirm the cancellation to the customer AND alert the vendor. The
    // notifications processor resolves the recipient from the data keys
    // (customerId → the customer; vendorUserId → the vendor's user) and routes
    // each job name to its template. (The previous single enqueue passed
    // `vendorId`, which resolveUserId does not recognise, and there was no
    // matching template - so nobody was ever notified on a customer cancel.)
    // jobIds keep both enqueues idempotent if customerCancel is retried.
    await this.safeEnqueue(
      'order_cancelled_by_customer',
      {
        customerId: order.customerId,
        customerFirstName: order.customer?.firstName ?? undefined,
        orderId,
        orderNumber: order.orderNumber,
        vendorName: order.vendor?.businessName,
        totalPence: order.totalPence,
        reason,
      },
      { jobId: `cancelled_by_customer:${orderId}` },
    );
    await this.safeEnqueue(
      'order_cancelled_vendor_alert',
      {
        vendorUserId: order.vendor?.userId,
        orderId,
        orderNumber: order.orderNumber,
        reason,
      },
      { jobId: `cancelled_vendor_alert:${orderId}` },
    );

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
    } else {
      // T010: prefer vendor-team membership so any active member (owner,
      // kitchen manager, staff, delivery coordinator) sees the team's
      // orders. Fall back to the customer view if the caller is not on
      // any vendor team.
      const owned = await this.prisma.vendor.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      let vendorId: string | null = owned?.id ?? null;
      if (!vendorId) {
        const member = await this.prisma.vendorMember.findFirst({
          where: { userId: user.id, status: 'active', role: { in: VENDOR_ORDER_ROLES } },
          select: { vendorId: true },
        });
        vendorId = member?.vendorId ?? null;
      }
      if (vendorId) {
        where.vendorId = vendorId;
      } else {
        where.customerId = user.id;
      }
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
    const isVendor = await this.members.canActOnVendor(
      user.id,
      order.vendorId,
      VENDOR_ORDER_ROLES,
    );
    if (!isAdmin && !isCustomer && !isVendor) {
      throw new ForbiddenException({ code: 'ORDER_FORBIDDEN', message: 'You may not view this order' });
    }
    return order;
  }

  // ------------------------------------------------------------------
  // AMENDMENT (FR-AMD-001)
  // ------------------------------------------------------------------

  /**
   * Vendor proposes a change to an in-flight order. Allowed only while the
   * order is in a pre-delivery vendor-controlled state and only the assigned
   * vendor (or admin) may do it. Enqueues a customer notification + a delayed
   * `expire_amendment` job so a no-reply auto-resolves to declined.
   */
  async proposeAmendment(orderId: string, dto: ProposeAmendmentDto, user: AuthUser) {
    const order = await this.repo.findByIdWithItems(orderId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    if (user.role !== UserRole.admin) {
      // T010: any active vendor-team member with order permissions can
      // propose an amendment, not only the original owner.
      const allowed = await this.members.canActOnVendor(
        user.id,
        order.vendorId,
        VENDOR_ORDER_ROLES,
      );
      if (!allowed) {
        throw new ForbiddenException({ code: 'NOT_ORDER_VENDOR', message: 'Not your order' });
      }
    }

    const PROPOSABLE: OrderStatus[] = [OrderStatus.accepted, OrderStatus.preparing, OrderStatus.dispatched];
    if (!PROPOSABLE.includes(order.status)) {
      throw new BadRequestException({
        code: 'AMENDMENT_NOT_ALLOWED_IN_STATUS',
        message: `Cannot amend an order in status ${order.status}`,
      });
    }

    // Upcharges silently break captured-payment flows - block them up front.
    const priceDeltaPence = dto.priceDeltaPence ?? 0;
    if (priceDeltaPence > 0) {
      throw new BadRequestException({
        code: 'AMENDMENT_UPCHARGE_NOT_SUPPORTED',
        message: 'Positive price deltas are not supported yet',
      });
    }

    // Single pending amendment per order is enforced by a Postgres partial
    // unique index (status='pending'). Catch the unique-violation and turn
    // it into a friendly 400 instead of a 500. This closes the propose-race
    // window that an application-level findFirst+create would leave open.
    const expiresAt = new Date(Date.now() + OrdersService.AMENDMENT_TTL_MS);
    let amendment;
    try {
      amendment = await this.prisma.orderAmendment.create({
        data: {
          orderId,
          vendorId: order.vendorId,
          proposedChange: dto.proposedChange,
          priceDeltaPence,
          status: AmendmentStatus.pending,
          expiresAt,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException({
          code: 'AMENDMENT_ALREADY_PENDING',
          message: 'There is already a pending amendment on this order',
        });
      }
      throw e;
    }

    await this.safeEnqueue(
      'order_amendment_proposed',
      {
        userId: order.customerId,
        orderId,
        orderNumber: order.orderNumber,
        vendorName: order.vendor?.businessName,
        amendmentId: amendment.id,
        proposedChange: dto.proposedChange,
        priceDeltaPence,
      },
      { jobId: `amendment_proposed:${amendment.id}` },
    );

    // Auto-expire poke. Job name routes to the special-case branch in
    // NotificationProcessor.
    await this.safeEnqueue(
      'expire_amendment',
      { amendmentId: amendment.id },
      {
        jobId: `expire_amendment:${amendment.id}`,
        delay: OrdersService.AMENDMENT_TTL_MS,
      },
    );

    return amendment;
  }

  /**
   * Customer accepts/declines a pending amendment. On accept with a negative
   * priceDelta, fires off a partial refund through PaymentsService.
   */
  async respondToAmendment(orderId: string, dto: RespondAmendmentDto, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, vendor: { select: { businessName: true } } },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (order.customerId !== user.id && user.role !== UserRole.admin) {
      throw new ForbiddenException({ code: 'NOT_ORDER_CUSTOMER', message: 'Not your order' });
    }

    const amendment = await this.prisma.orderAmendment.findFirst({
      where: { orderId, status: AmendmentStatus.pending },
    });
    if (!amendment) {
      throw new NotFoundException({
        code: 'NO_PENDING_AMENDMENT',
        message: 'No pending amendment for this order',
      });
    }
    if (amendment.expiresAt.getTime() < Date.now()) {
      // Race with the expire job - treat as already resolved.
      throw new BadRequestException({
        code: 'AMENDMENT_EXPIRED',
        message: 'Amendment has already expired',
      });
    }

    // Issue the refund FIRST (before flipping state). If Stripe fails the
    // amendment stays pending so the customer can retry - much better than
    // claiming "accepted" with no refund issued. Idempotency key makes the
    // retry safe.
    if (dto.accepted && amendment.priceDeltaPence < 0) {
      await this.payments.createRefund(
        {
          orderId,
          amountPence: Math.abs(amendment.priceDeltaPence),
          reason: `Order amendment ${amendment.id}`,
        },
        // Customer authorised this by accepting the amendment. Role=admin
        // bypasses the large-refund role check (matters only for £100+).
        { id: order.customerId, role: UserRole.admin },
        `amendment-refund:${amendment.id}`,
      );
    }

    // Conditional update: only flip if still pending. updateMany returns the
    // number of rows changed - if 0 we lost a race (expire job, double-tap)
    // and must surface that rather than send a stale notification.
    const newStatus = dto.accepted ? AmendmentStatus.accepted : AmendmentStatus.declined;
    const result = await this.prisma.orderAmendment.updateMany({
      where: { id: amendment.id, status: AmendmentStatus.pending },
      data: { status: newStatus, respondedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BadRequestException({
        code: 'AMENDMENT_ALREADY_RESOLVED',
        message: 'Amendment was already resolved',
      });
    }
    const updated = await this.prisma.orderAmendment.findUniqueOrThrow({
      where: { id: amendment.id },
    });

    // Cancel the pending expire job so it doesn't double-resolve. Best-effort.
    try {
      const job = await this.safeGetJob(`expire_amendment:${amendment.id}`);
      if (job) await job.remove();
    } catch (e) {
      this.logger.warn(`Could not remove expire_amendment job for ${amendment.id}: ${(e as Error).message}`);
    }

    await this.safeEnqueue(
      'order_amendment_resolved',
      {
        userId: order.customerId,
        orderId,
        amendmentId: updated.id,
        accepted: dto.accepted,
        proposedChange: updated.proposedChange,
        priceDeltaPence: updated.priceDeltaPence,
        vendorName: order.vendor?.businessName,
      },
      { jobId: `amendment_resolved:${updated.id}` },
    );

    return updated;
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

// ---------------------------------------------------------------------------
// Delivery-radius geofencing helpers
// ---------------------------------------------------------------------------

interface OrderPostcodeLatLng {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Process-lifetime cache for postcodes.io lookups in the order path. Mirrors
 * the cache used by VendorsService so repeated checkout attempts for the same
 * postcode don't re-hit the network. Misses are cached too.
 */
const ORDER_GEOCODE_CACHE = new Map<string, OrderPostcodeLatLng>();

async function geocodeOrderPostcode(raw: string, logger?: Logger): Promise<OrderPostcodeLatLng> {
  const key = raw.replace(/\s+/g, '').toUpperCase();
  if (!key) return { latitude: null, longitude: null };
  const cached = ORDER_GEOCODE_CACHE.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) {
      const miss: OrderPostcodeLatLng = { latitude: null, longitude: null };
      ORDER_GEOCODE_CACHE.set(key, miss);
      return miss;
    }
    const json = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
    const lat = json.result?.latitude;
    const lng = json.result?.longitude;
    const out: OrderPostcodeLatLng = {
      latitude: typeof lat === 'number' ? lat : null,
      longitude: typeof lng === 'number' ? lng : null,
    };
    ORDER_GEOCODE_CACHE.set(key, out);
    return out;
  } catch (e) {
    logger?.warn(`geocodeOrderPostcode failed for ${raw}: ${(e as Error).message}`);
    const miss: OrderPostcodeLatLng = { latitude: null, longitude: null };
    ORDER_GEOCODE_CACHE.set(key, miss);
    return miss;
  }
}

/** Great-circle distance in miles between two WGS-84 points (Earth radius 3958.8mi). */
function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}
