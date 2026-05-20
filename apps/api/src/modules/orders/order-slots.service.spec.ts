import { BadRequestException } from '@nestjs/common';
import { OrderType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { OrderSlotsService } from './order-slots.service';

/**
 * Unit tests for the T002 OrderSlotsService. We mock the four Prisma
 * surfaces the validator hits (vendor.findUnique, blackoutDate.findUnique,
 * order.count, orderItem.aggregate) and exercise each rejection branch
 * by its stable error `code`.
 */
describe('OrderSlotsService.validateSlot', () => {
  const vendorFindUnique = jest.fn();
  const blackoutFindUnique = jest.fn();
  const orderCount = jest.fn();
  const itemAggregate = jest.fn();
  const prisma = {
    vendor: { findUnique: vendorFindUnique },
    blackoutDate: { findUnique: blackoutFindUnique },
    order: { count: orderCount },
    orderItem: { aggregate: itemAggregate },
  } as unknown as PrismaService;
  const svc = new OrderSlotsService(prisma);

  const VENDOR_DEFAULTS = {
    id: 'v-1',
    openingDays: [0, 1, 2, 3, 4, 5, 6],
    slotOpenHour: 9,
    slotCloseHour: 21,
    prepLeadHours: 2,
    maxOrdersPerDay: null,
    maxTraysPerDay: null,
    sameDayOrders: true,
    largeOrderLeadHours: null,
    largeOrderTrayThreshold: null,
    eventCateringManualQuote: false,
  };

  beforeEach(() => {
    vendorFindUnique.mockReset();
    blackoutFindUnique.mockReset().mockResolvedValue(null);
    orderCount.mockReset().mockResolvedValue(0);
    itemAggregate.mockReset().mockResolvedValue({ _sum: { quantity: 0 } });
  });

  const futureHour = (hoursFromNow: number, hourOfDay: number): Date => {
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    d.setUTCHours(hourOfDay, 0, 0, 0);
    return d;
  };

  it('rejects when the vendor does not exist', async () => {
    vendorFindUnique.mockResolvedValue(null);
    await expect(svc.validateSlot('v-1', futureHour(48, 12))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an obviously invalid date input', async () => {
    vendorFindUnique.mockResolvedValue(VENDOR_DEFAULTS);
    await expect(svc.validateSlot('v-1', new Date('not-a-date'))).rejects.toMatchObject({
      response: { code: 'INVALID_SCHEDULED_FOR' },
    });
  });

  it('rejects when scheduledFor is sooner than the vendor prep lead time', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, prepLeadHours: 24 });
    const tooSoon = futureHour(1, 12);
    await expect(svc.validateSlot('v-1', tooSoon)).rejects.toMatchObject({
      response: { code: 'SLOT_TOO_SOON' },
    });
  });

  it('honours a cart-driven lead override above the vendor default', async () => {
    vendorFindUnique.mockResolvedValue(VENDOR_DEFAULTS);
    const target = futureHour(5, 14);
    await expect(
      svc.validateSlot('v-1', target, { requiredLeadHours: 24 }),
    ).rejects.toMatchObject({ response: { code: 'SLOT_TOO_SOON' } });
  });

  it('rejects a day of the week the vendor is closed', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, openingDays: [1, 2, 3, 4, 5] });
    // Pick a Sunday well in the future.
    const sunday = new Date(Date.UTC(2030, 5, 2, 12, 0, 0));
    await expect(svc.validateSlot('v-1', sunday)).rejects.toMatchObject({
      response: { code: 'SLOT_DAY_UNAVAILABLE' },
    });
  });

  it('rejects a slot outside the configured open/close hours', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, slotOpenHour: 10, slotCloseHour: 18 });
    const target = futureHour(48, 9);
    await expect(svc.validateSlot('v-1', target)).rejects.toMatchObject({
      response: { code: 'SLOT_OUTSIDE_WINDOW' },
    });
  });

  it('rejects same-day orders when sameDayOrders=false', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, sameDayOrders: false, prepLeadHours: 0 });
    const target = new Date();
    target.setUTCHours(target.getUTCHours() + 1, 0, 0, 0);
    if (target.getUTCHours() < 9) target.setUTCHours(12, 0, 0, 0);
    if (target.getUTCHours() >= 21) target.setUTCHours(20, 0, 0, 0);
    await expect(svc.validateSlot('v-1', target)).rejects.toMatchObject({
      response: { code: 'SAME_DAY_ORDERS_DISABLED' },
    });
  });

  it('rejects a blackout date with the reason in the message', async () => {
    vendorFindUnique.mockResolvedValue(VENDOR_DEFAULTS);
    blackoutFindUnique.mockResolvedValue({ reason: 'Bank holiday' });
    await expect(svc.validateSlot('v-1', futureHour(48, 12))).rejects.toMatchObject({
      response: { code: 'SLOT_BLACKED_OUT' },
    });
  });

  it('rejects when the daily order cap is already reached', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, maxOrdersPerDay: 3 });
    orderCount.mockResolvedValue(3);
    await expect(svc.validateSlot('v-1', futureHour(48, 12))).rejects.toMatchObject({
      response: { code: 'DAILY_ORDER_CAP_REACHED' },
    });
  });

  it('rejects when adding trays would breach the daily tray cap', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, maxTraysPerDay: 10 });
    itemAggregate.mockResolvedValue({ _sum: { quantity: 8 } });
    await expect(
      svc.validateSlot('v-1', futureHour(48, 12), { trayCount: 5 }),
    ).rejects.toMatchObject({ response: { code: 'DAILY_TRAY_CAP_REACHED' } });
  });

  it('escalates lead time for large orders crossing the threshold', async () => {
    vendorFindUnique.mockResolvedValue({
      ...VENDOR_DEFAULTS,
      prepLeadHours: 2,
      largeOrderLeadHours: 72,
      largeOrderTrayThreshold: 20,
    });
    const target = futureHour(24, 12);
    await expect(
      svc.validateSlot('v-1', target, { trayCount: 25 }),
    ).rejects.toMatchObject({ response: { code: 'SLOT_TOO_SOON' } });
  });

  it('rejects an instant event booking when the vendor flips on manual quote', async () => {
    vendorFindUnique.mockResolvedValue({ ...VENDOR_DEFAULTS, eventCateringManualQuote: true });
    await expect(
      svc.validateSlot('v-1', futureHour(48, 12), { orderType: OrderType.event }),
    ).rejects.toMatchObject({ response: { code: 'EVENT_MANUAL_QUOTE_REQUIRED' } });
  });

  it('accepts a slot well into the future, inside every constraint', async () => {
    vendorFindUnique.mockResolvedValue(VENDOR_DEFAULTS);
    await expect(svc.validateSlot('v-1', futureHour(48, 14))).resolves.toBe(true);
  });
});
