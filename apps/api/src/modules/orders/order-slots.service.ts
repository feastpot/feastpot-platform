import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, OrderType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface ValidateSlotOptions {
  /**
   * Lead hours required by the cart, typically `MAX(menuItem.preparation_hours)`
   * across the cart. The validator takes `max(this, vendor.prepLeadHours,
   * largeOrderLeadHours?)`, so callers don't have to pre-merge.
   */
  requiredLeadHours?: number;
  /**
   * Number of trays in the cart (used for `maxTraysPerDay` and the
   * large-order lead threshold). Sum of `quantity` for cart items whose
   * `category === 'tray'`. Default 0.
   */
  trayCount?: number;
  /**
   * Optional order type. `event` may be hard-blocked when the vendor has
   * flipped on the "event catering manual quote only" toggle so we don't
   * silently take an instant booking for a manual-quote vendor.
   */
  orderType?: OrderType;
}

/**
 * Statuses that still "count" against per-day caps. A cancelled or
 * refunded order has freed its slot back up; everything else is a
 * commitment we made to the vendor's kitchen for that day.
 */
const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.accepted,
  OrderStatus.preparing,
  OrderStatus.dispatched,
  OrderStatus.delivered,
];

/**
 * Validates a customer-requested delivery slot against a vendor's
 * configured availability (T002):
 *
 *  - Opening days (Vendor.openingDays, 0=Sun … 6=Sat)
 *  - Open/close hour window (slotOpenHour, slotCloseHour, exclusive)
 *  - Prep lead time (max of vendor.prepLeadHours, cart prep hours,
 *    largeOrderLeadHours if tray count crosses the threshold)
 *  - Same-day toggle (sameDayOrders=false rejects today's date)
 *  - Blackout dates (BlackoutDate rows for this vendor + date)
 *  - Daily caps (maxOrdersPerDay / maxTraysPerDay) computed from active
 *    orders already scheduled for the requested calendar day
 *  - Event-catering manual-quote toggle (rejects OrderType.event when on)
 *
 * Throws BadRequestException with a stable machine-readable `code` for
 * each failure mode so the checkout UI can map them to friendly copy.
 */
@Injectable()
export class OrderSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateSlot(
    vendorId: string,
    scheduledFor: Date,
    opts: ValidateSlotOptions = {},
  ): Promise<true> {
    if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_SCHEDULED_FOR',
        message: 'scheduledFor is not a valid date',
      });
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        openingDays: true,
        slotOpenHour: true,
        slotCloseHour: true,
        prepLeadHours: true,
        maxOrdersPerDay: true,
        maxTraysPerDay: true,
        sameDayOrders: true,
        largeOrderLeadHours: true,
        largeOrderTrayThreshold: true,
        eventCateringManualQuote: true,
      },
    });
    if (!vendor) {
      throw new BadRequestException({
        code: 'VENDOR_NOT_FOUND',
        message: 'Vendor does not exist',
      });
    }

    const trayCount = Math.max(0, opts.trayCount ?? 0);
    const orderType = opts.orderType ?? OrderType.standard;

    // Event-catering vendors who want to manually quote can't take
    // instant event bookings - guide the customer back to the enquiry
    // form instead of letting an unpriced order through.
    if (orderType === OrderType.event && vendor.eventCateringManualQuote) {
      throw new BadRequestException({
        code: 'EVENT_MANUAL_QUOTE_REQUIRED',
        message: 'This vendor takes event catering by manual quote. Please request an enquiry instead.',
      });
    }

    const now = new Date();
    const isLargeOrder =
      vendor.largeOrderTrayThreshold !== null &&
      vendor.largeOrderTrayThreshold !== undefined &&
      trayCount >= vendor.largeOrderTrayThreshold;
    const leadHours = Math.max(
      opts.requiredLeadHours ?? 0,
      vendor.prepLeadHours,
      isLargeOrder ? vendor.largeOrderLeadHours ?? 0 : 0,
    );
    const earliest = new Date(now.getTime() + leadHours * 3600_000);
    if (scheduledFor.getTime() < earliest.getTime()) {
      throw new BadRequestException({
        code: 'SLOT_TOO_SOON',
        message: `Order must be scheduled at least ${leadHours} hour(s) from now`,
      });
    }

    // Same-day toggle - if the vendor doesn't accept same-day orders,
    // reject any slot whose UTC calendar date matches today's. We do
    // the comparison in UTC to match how scheduledFor is stored.
    if (!vendor.sameDayOrders && sameUtcDay(scheduledFor, now)) {
      throw new BadRequestException({
        code: 'SAME_DAY_ORDERS_DISABLED',
        message: 'This vendor is not accepting same-day orders',
      });
    }

    const dow = scheduledFor.getUTCDay();
    if (!vendor.openingDays.includes(dow)) {
      throw new BadRequestException({
        code: 'SLOT_DAY_UNAVAILABLE',
        message: 'Vendor does not deliver on this day of the week',
      });
    }

    const hour = scheduledFor.getUTCHours();
    if (hour < vendor.slotOpenHour || hour >= vendor.slotCloseHour) {
      throw new BadRequestException({
        code: 'SLOT_OUTSIDE_WINDOW',
        message: `Slot must be between ${vendor.slotOpenHour}:00 and ${vendor.slotCloseHour}:00`,
      });
    }

    // Blackout - vendor has flagged this calendar date as closed.
    // `date` is a DATE column; Prisma returns it as a Date at midnight UTC,
    // so equality against the day-bucket of scheduledFor is exact.
    const dayStart = startOfUtcDay(scheduledFor);
    const blackout = await this.prisma.blackoutDate.findUnique({
      where: { vendorId_date: { vendorId, date: dayStart } },
    });
    if (blackout) {
      throw new BadRequestException({
        code: 'SLOT_BLACKED_OUT',
        message: blackout.reason ? `Vendor is closed: ${blackout.reason}` : 'Vendor is closed on this date',
      });
    }

    // Daily caps. We only count orders already accepted-or-better; a
    // pending order that never confirms still holds a soft reservation
    // because the customer is mid-checkout, but cancelled/refunded rows
    // have given their slot back.
    if (vendor.maxOrdersPerDay !== null && vendor.maxOrdersPerDay !== undefined) {
      const dayEnd = endOfUtcDay(scheduledFor);
      const orderCount = await this.prisma.order.count({
        where: {
          vendorId,
          status: { in: ACTIVE_ORDER_STATUSES },
          scheduledFor: { gte: dayStart, lt: dayEnd },
        },
      });
      if (orderCount >= vendor.maxOrdersPerDay) {
        throw new BadRequestException({
          code: 'DAILY_ORDER_CAP_REACHED',
          message: `Vendor is fully booked on this date (max ${vendor.maxOrdersPerDay} orders per day)`,
        });
      }
    }
    if (vendor.maxTraysPerDay !== null && vendor.maxTraysPerDay !== undefined && trayCount > 0) {
      const dayEnd = endOfUtcDay(scheduledFor);
      // Sum of tray-category quantities across all active orders for the
      // day. Done as a single grouped aggregate so we don't pull rows.
      const agg = await this.prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          order: {
            vendorId,
            status: { in: ACTIVE_ORDER_STATUSES },
            scheduledFor: { gte: dayStart, lt: dayEnd },
          },
          menuItem: { category: 'tray' },
        },
      });
      const trayedToday = agg._sum.quantity ?? 0;
      if (trayedToday + trayCount > vendor.maxTraysPerDay) {
        throw new BadRequestException({
          code: 'DAILY_TRAY_CAP_REACHED',
          message: `Adding ${trayCount} trays would exceed the vendor's daily limit of ${vendor.maxTraysPerDay}`,
        });
      }
    }

    return true;
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
