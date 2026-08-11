import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../auth/decorators/public.decorator';

import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';

/**
 * Vendor-acquisition funnel analytics.
 *
 * POST /v1/analytics/events: accepts client-side events from apps/web and
 * apps/vendor.  The endpoint is public (no auth required) because:
 *   • vendor_page_view / calculator_interaction fire before any session exists
 *   • share_link_click fires from authenticated vendor portal but passing a
 *     Bearer token to an analytics endpoint adds complexity for no security gain
 *     (events are low-stakes, never grant access, and are append-only).
 *
 * Accepted event names are restricted at the DTO layer to the CLIENT_EVENT_NAMES
 * allowlist.  order_attribution_source is server-side only and is never accepted
 * from the client.
 *
 * There is intentionally NO GET endpoint.  Analytics reads are server-side only
 * (admin reporting via PrismaService), never exposed through this controller.
 */
@ApiTags('Analytics')
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Record a client-side analytics event.
   *
   * Rate-limited to 30 events per minute per IP to prevent trivial spam.
   * Returns 204 No Content: clients fire-and-forget and never inspect the body.
   */
  @Public()
  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ long: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a vendor-acquisition funnel event (public)' })
  record(@Body() dto: TrackEventDto): void {
    // Deliberately not awaited: the HTTP response returns immediately.
    // A DB failure is logged by AnalyticsService.track and never re-thrown.
    void this.analytics.track({
      eventName: dto.eventName,
      properties: dto.properties,
      anonVisitorId: dto.anonVisitorId,
      vendorId: dto.vendorId,
    });
  }
}
