import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_LEAD_HOURS,
  DEFAULT_SLOT_CLOSE_HOUR,
  DEFAULT_SLOT_OPEN_HOUR,
  OrderSlotsService,
} from './order-slots.service';

describe('OrderSlotsService.validateSlot', () => {
  const findUnique = jest.fn();
  const prisma = { deliveryConfig: { findUnique } } as unknown as PrismaService;
  const svc = new OrderSlotsService(prisma);

  beforeEach(() => findUnique.mockReset());

  const futureHour = (hoursFromNow: number, hourOfDay: number): Date => {
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    d.setUTCHours(hourOfDay, 0, 0, 0);
    return d;
  };

  it('rejects when the vendor has no DeliveryConfig', async () => {
    findUnique.mockResolvedValue(null);
    await expect(svc.validateSlot('v-1', new Date(Date.now() + 86_400_000))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when scheduledFor is sooner than the lead time', async () => {
    findUnique.mockResolvedValue({ vendorId: 'v-1' });
    const tooSoon = new Date(Date.now() + (DEFAULT_LEAD_HOURS - 1) * 3600_000);
    await expect(svc.validateSlot('v-1', tooSoon)).rejects.toMatchObject({ response: { code: 'SLOT_TOO_SOON' } });
  });

  it('rejects when scheduledFor falls before the open hour', async () => {
    findUnique.mockResolvedValue({ vendorId: 'v-1' });
    const target = futureHour(48, DEFAULT_SLOT_OPEN_HOUR - 1);
    await expect(svc.validateSlot('v-1', target)).rejects.toMatchObject({ response: { code: 'SLOT_OUTSIDE_WINDOW' } });
  });

  it('rejects when scheduledFor is at or after the close hour', async () => {
    findUnique.mockResolvedValue({ vendorId: 'v-1' });
    const target = futureHour(48, DEFAULT_SLOT_CLOSE_HOUR);
    await expect(svc.validateSlot('v-1', target)).rejects.toMatchObject({ response: { code: 'SLOT_OUTSIDE_WINDOW' } });
  });

  it('accepts a slot well into the future, inside the window', async () => {
    findUnique.mockResolvedValue({ vendorId: 'v-1' });
    const target = futureHour(48, DEFAULT_SLOT_OPEN_HOUR + 1);
    await expect(svc.validateSlot('v-1', target)).resolves.toBe(true);
  });

  it('respects an explicit higher lead-time override (from menu item prep hours)', async () => {
    findUnique.mockResolvedValue({ vendorId: 'v-1' });
    // Want 5 hours from now at 14:00 - but we override lead to 24h, so it should fail.
    const target = futureHour(5, 14);
    await expect(svc.validateSlot('v-1', target, 24)).rejects.toMatchObject({ response: { code: 'SLOT_TOO_SOON' } });
  });

  it('rejects an obviously invalid date input', async () => {
    findUnique.mockResolvedValue({ vendorId: 'v-1' });
    await expect(svc.validateSlot('v-1', new Date('not-a-date'))).rejects.toMatchObject({
      response: { code: 'INVALID_SCHEDULED_FOR' },
    });
  });
});
