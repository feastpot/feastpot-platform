import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface TrackPayload {
  eventName: string;
  properties?: Record<string, unknown>;
  anonVisitorId?: string;
  vendorId?: string;
}

/**
 * Analytics event persistence.
 *
 * All writes are fire-and-forget: callers must NOT await track() where
 * failure would block business logic. The method swallows its own errors
 * and logs a warning so a DB hiccup never surfaces as a 500 to the user.
 *
 * PII policy: properties must never contain email, phone, name, address,
 * IP address, or any other personal data. Use anonVisitorId for anonymous
 * cross-event correlation.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist an analytics event.
   *
   * Fire-and-forget: wrap in `void this.analytics.track(...)` at call sites
   * so failures never propagate. This method itself swallows all exceptions.
   */
  async track(payload: TrackPayload): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          eventName: payload.eventName,
          properties: (payload.properties ?? {}) as Prisma.InputJsonValue,
          anonVisitorId: payload.anonVisitorId ?? null,
          vendorId: payload.vendorId ?? null,
        },
      });
    } catch (err) {
      // Never let analytics failures surface. Log for observability only.
      this.logger.warn(
        `[analytics] track failed (event=${payload.eventName}): ${String(err)}`,
      );
    }
  }
}
