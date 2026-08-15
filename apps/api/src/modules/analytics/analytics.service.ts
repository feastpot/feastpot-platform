import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// ── Admin aggregate shapes ────────────────────────────────────────────────

export interface FunnelStat {
  eventName: string;
  uniqueSessions: number;
  totalEvents: number;
}

export interface ShareActivityRow {
  vendorId: string;
  businessName: string;
  linkClicks: number;
  qrScans: number;
}

export interface AttributionBreakdownRow {
  attributionSource: string;
  count: number;
  firstOrders: number;
  repeatOrders: number;
}

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

  // ── Public write API ─────────────────────────────────────────────────────

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
      this.logger.warn(`[analytics] track failed (event=${payload.eventName}): ${String(err)}`);
    }
  }

  // ── Admin aggregate reads ─────────────────────────────────────────────────
  // These are called only from the admin controller (staff-gated) and never
  // exposed on the public POST endpoint.

  /**
   * Funnel step counts for the vendor-acquisition flow.
   * Excludes order_attribution_source (server-side, not session-correlated).
   *
   * Returns one row per event_name ordered by total volume descending.
   * uniqueSessions = COUNT(DISTINCT anonVisitorId) so rapid-fire events from
   * the same session (e.g. calculator_interaction) don't inflate the number.
   */
  async getFunnelStats(days: number): Promise<FunnelStat[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const rows = await this.prisma.$queryRaw<
      { eventName: string; uniqueSessions: string; totalEvents: string }[]
    >`
      SELECT event_name AS "eventName",
             COUNT(DISTINCT COALESCE(anon_visitor_id, id))::text AS "uniqueSessions",
             COUNT(*)::text AS "totalEvents"
      FROM analytics_events
      WHERE created_at >= ${since}
        AND event_name != 'order_attribution_source'
      GROUP BY event_name
      ORDER BY COUNT(*) DESC
    `;
    return rows.map((r) => ({
      eventName: r.eventName,
      uniqueSessions: parseInt(r.uniqueSessions, 10),
      totalEvents: parseInt(r.totalEvents, 10),
    }));
  }

  /**
   * Top-N vendors ranked by share + QR activity within the window.
   * Joins with Vendor to supply businessName for display.
   */
  async getShareActivity(days: number, topN: number): Promise<ShareActivityRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    // Use $queryRawUnsafe so LIMIT can be injected as a literal (topN is
    // already validated + clamped by the controller before this call).
    const rows = await this.prisma.$queryRawUnsafe<
      { vendorId: string; linkClicks: string; qrScans: string }[]
    >(
      `SELECT vendor_id AS "vendorId",
              SUM(CASE WHEN event_name = 'share_link_click' THEN 1 ELSE 0 END)::text AS "linkClicks",
              SUM(CASE WHEN event_name = 'qr_scan' THEN 1 ELSE 0 END)::text AS "qrScans"
       FROM analytics_events
       WHERE created_at >= $1
         AND event_name IN ('share_link_click', 'qr_scan')
         AND vendor_id IS NOT NULL
       GROUP BY vendor_id
       ORDER BY (SUM(CASE WHEN event_name = 'share_link_click' THEN 1 ELSE 0 END)
                 + SUM(CASE WHEN event_name = 'qr_scan' THEN 1 ELSE 0 END)) DESC
       LIMIT $2`,
      since,
      topN,
    );

    const vendorIds = rows.map((r) => r.vendorId);
    const vendors =
      vendorIds.length > 0
        ? await this.prisma.vendor.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, businessName: true },
          })
        : [];
    const nameMap = new Map(vendors.map((v) => [v.id, v.businessName]));

    return rows.map((r) => ({
      vendorId: r.vendorId,
      businessName: nameMap.get(r.vendorId) ?? r.vendorId,
      linkClicks: parseInt(r.linkClicks, 10),
      qrScans: parseInt(r.qrScans, 10),
    }));
  }

  /**
   * order_attribution_source breakdown: how orders arrived (marketplace vs
   * vendor-referred) and whether they were first-time or repeat.
   */
  async getAttributionBreakdown(days: number): Promise<AttributionBreakdownRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const rows = await this.prisma.$queryRaw<
      { attributionSource: string; count: string; firstOrders: string }[]
    >`
      SELECT properties->>'attributionSource' AS "attributionSource",
             COUNT(*)::text AS "count",
             SUM(CASE WHEN (properties->>'isFirstOrder')::boolean THEN 1 ELSE 0 END)::text AS "firstOrders"
      FROM analytics_events
      WHERE event_name = 'order_attribution_source'
        AND created_at >= ${since}
        AND properties->>'attributionSource' IS NOT NULL
      GROUP BY properties->>'attributionSource'
      ORDER BY COUNT(*) DESC
    `;
    return rows.map((r) => {
      const total = parseInt(r.count, 10);
      const first = parseInt(r.firstOrders, 10);
      return {
        attributionSource: r.attributionSource,
        count: total,
        firstOrders: first,
        repeatOrders: total - first,
      };
    });
  }
}
