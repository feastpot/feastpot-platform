import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

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

  // ── Admin read endpoints ────────────────────────────────────────────────────
  // Staff-gated; all queries run server-side via PrismaService.
  // Never exposed on the public POST endpoint above.

  /** Funnel step counts (unique sessions + total events) over the given window. */
  @Get('admin/funnel')
  @Roles(UserRole.admin, UserRole.finance, UserRole.support)
  @ApiOperation({ summary: 'Admin: vendor-acquisition funnel step counts' })
  adminFunnel(@Query('days') days?: string) {
    const d = clampDays(days);
    return this.analytics.getFunnelStats(d);
  }

  /** Top-N vendors by share link + QR activity over the given window. */
  @Get('admin/shares')
  @Roles(UserRole.admin, UserRole.finance, UserRole.support)
  @ApiOperation({ summary: 'Admin: top vendors by share and QR activity' })
  adminShares(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d = clampDays(days);
    const n = Math.min(Math.max(parseInt(limit ?? '20', 10) || 20, 1), 100);
    return this.analytics.getShareActivity(d, n);
  }

  /** order_attribution_source breakdown (VENDOR_REFERRED / MARKETPLACE / etc). */
  @Get('admin/attribution')
  @Roles(UserRole.admin, UserRole.finance, UserRole.support)
  @ApiOperation({ summary: 'Admin: order attribution source breakdown' })
  adminAttribution(@Query('days') days?: string) {
    const d = clampDays(days);
    return this.analytics.getAttributionBreakdown(d);
  }
}

/** Clamp a query-param "days" value to [1, 365] with a 30-day default. */
function clampDays(raw: string | undefined): number {
  const n = parseInt(raw ?? '30', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 365) : 30;
}
