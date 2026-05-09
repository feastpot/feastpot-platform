import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Schema gap: DeliveryConfig has no slot_open_time, slot_close_time, available_days,
 * or lead_time_hours columns. Until they are added, we apply pragmatic defaults:
 *   - available all days of the week
 *   - delivery window 09:00–21:00 (UTC) of the scheduled day
 *   - lead time = MAX(menu_items.preparation_hours) for the selected items, with a
 *     conservative floor of {@link DEFAULT_LEAD_HOURS}.
 * The constants below can be overridden once the columns ship without changing
 * the public surface of validateSlot().
 */
export const DEFAULT_SLOT_OPEN_HOUR = 9; // 09:00
export const DEFAULT_SLOT_CLOSE_HOUR = 21; // 21:00
export const DEFAULT_LEAD_HOURS = 2;
export const DEFAULT_AVAILABLE_DAYS = [0, 1, 2, 3, 4, 5, 6];

@Injectable()
export class OrderSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateSlot(vendorId: string, scheduledFor: Date, leadHoursOverride?: number): Promise<true> {
    if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException({ code: 'INVALID_SCHEDULED_FOR', message: 'scheduledFor is not a valid date' });
    }

    const config = await this.prisma.deliveryConfig.findUnique({ where: { vendorId } });
    if (!config) {
      throw new BadRequestException({
        code: 'NO_DELIVERY_CONFIG',
        message: 'Vendor has not configured delivery yet',
      });
    }

    const now = new Date();
    const leadHours = Math.max(DEFAULT_LEAD_HOURS, leadHoursOverride ?? DEFAULT_LEAD_HOURS);
    const earliest = new Date(now.getTime() + leadHours * 3600_000);
    if (scheduledFor.getTime() < earliest.getTime()) {
      throw new BadRequestException({
        code: 'SLOT_TOO_SOON',
        message: `Order must be scheduled at least ${leadHours} hour(s) from now`,
      });
    }

    const dow = scheduledFor.getUTCDay();
    if (!DEFAULT_AVAILABLE_DAYS.includes(dow)) {
      throw new BadRequestException({
        code: 'SLOT_DAY_UNAVAILABLE',
        message: `Vendor does not deliver on day ${dow}`,
      });
    }

    const hour = scheduledFor.getUTCHours();
    if (hour < DEFAULT_SLOT_OPEN_HOUR || hour >= DEFAULT_SLOT_CLOSE_HOUR) {
      throw new BadRequestException({
        code: 'SLOT_OUTSIDE_WINDOW',
        message: `Slot must be between ${DEFAULT_SLOT_OPEN_HOUR}:00 and ${DEFAULT_SLOT_CLOSE_HOUR}:00 UTC`,
      });
    }

    return true;
  }
}
