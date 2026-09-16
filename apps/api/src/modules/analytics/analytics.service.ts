import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CLIENT_EVENT_NAMES } from './dto/track-event.dto';

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
  applicationId?: string;
  userId?: string;
}

export const SERVER_EVENT_NAMES = [
  'application_phase_1_completed',
  'application_submitted',
  'application_approved',
  'terms_accepted',
  'stripe_connect_completed',
  'payouts_enabled',
  'document_supplied',
  'first_allergen_confirmed_item',
  'vendor_live',
  'first_order',
  'first_payout',
] as const;

const LEGACY_SERVER_EVENTS = ['order_attribution_source'] as const;
const PROPERTY_KEYS: Record<string, readonly string[]> = {
  become_a_vendor_landed: [],
  calculator_interaction: ['action'],
  application_phase_1_started: [],
  application_phase_1_completed: [],
  application_phase_2_started: [],
  application_menu_uploaded: ['method'],
  application_phase_2_submitted: [],
  application_field_abandoned: ['field', 'phase', 'step'],
  vendor_required_item_deferred: ['item'],
  vendor_required_item_resumed: ['item'],
  order_attribution_source: ['attributionSource', 'isFirstOrder', 'vendorId'],
};
// Legacy trusted server/client callers predate the public contract. Keep their
// narrow, documented fields working; this is deliberately separate from the
// public vocabulary and does not turn track() into an arbitrary JSON sink.
const LEGACY_PROPERTY_KEYS: Record<string, readonly string[]> = {
  vendor_page_view: [],
  application_start: [],
  application_complete: [],
  share_link_click: ['source'],
  qr_scan: ['source'],
  field_abandonment: ['field', 'phase', 'step'],
  terms_viewed: [],
  document_started: ['documentType'],
  // Server lifecycle dimensions emitted by current producers.
  document_supplied: ['item', 'step'],
  first_order: ['order_type'],
  first_payout: ['payout_state'],
  stripe_connect_completed: ['account_state'],
  payouts_enabled: ['account_state'],
  application_phase_1_completed: [],
  application_submitted: ['phase'],
  application_approved: [],
  terms_accepted: [],
  first_allergen_confirmed_item: [],
  vendor_live: [],
};
const PII_KEY = /email|phone|name|address|postcode|ip|message|note|text|description|content/i;
const ALL_EVENT_NAMES = new Set<string>([
  ...CLIENT_EVENT_NAMES,
  ...SERVER_EVENT_NAMES,
  ...LEGACY_SERVER_EVENTS,
  ...Object.keys(LEGACY_PROPERTY_KEYS),
]);
const SAFE_ANON_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// sendBeacon can be delayed by page suspension and arrive after the draft
// transaction. Cohort attribution is intentionally limited to one day so an
// anonymous id reused much later cannot join unrelated applications.

function allowlistedProperties(
  eventName: string,
  input: Record<string, unknown>,
  legacy = false,
): Record<string, unknown> | null {
  const keys = (legacy ? { ...PROPERTY_KEYS, ...LEGACY_PROPERTY_KEYS } : PROPERTY_KEYS)[eventName];
  if (!keys || Object.keys(input).some((key) => !keys.includes(key))) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value !== 'string' && typeof value !== 'boolean') return null;
    if (typeof value === 'string' && value.length > 128) return null;
    out[key] = value;
  }
  return out;
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
      if (!ALL_EVENT_NAMES.has(payload.eventName)) {
        this.logger.warn(`[analytics] rejected unknown event ${payload.eventName}`);
        return;
      }
      const anonVisitorId = payload.anonVisitorId;
      if (
        anonVisitorId !== undefined &&
        anonVisitorId !== null &&
        !SAFE_ANON_ID.test(anonVisitorId)
      ) {
        this.logger.warn(`[analytics] rejected invalid anonymous visitor id`);
        return;
      }
      const input = payload.properties ?? {};
      // Internal callers retain the legacy event contract, but still cannot
      // persist obvious PII or unbounded free-form keys.
      if (Object.keys(input).some((key) => PII_KEY.test(key))) {
        this.logger.warn(`[analytics] rejected PII property for ${payload.eventName}`);
        return;
      }
      const properties = allowlistedProperties(payload.eventName, input, true);
      if (!properties) {
        this.logger.warn(`[analytics] rejected properties for ${payload.eventName}`);
        return;
      }
      await this.prisma.analyticsEvent.create({
        data: {
          eventName: payload.eventName,
          properties: properties as Prisma.InputJsonValue,
          anonVisitorId: anonVisitorId ?? null,
          vendorId: payload.vendorId ?? null,
          ...(payload.applicationId ? { applicationId: payload.applicationId } : {}),
          ...(payload.userId ? { userId: payload.userId } : {}),
        },
      });
    } catch (err) {
      // Never let analytics failures surface. Log for observability only.
      this.logger.warn(`[analytics] track failed (event=${payload.eventName}): ${String(err)}`);
    }
  }

  /** Public boundary: only the current client vocabulary is accepted. */
  async trackPublic(payload: TrackPayload): Promise<void> {
    if (!CLIENT_EVENT_NAMES.includes(payload.eventName as (typeof CLIENT_EVENT_NAMES)[number])) {
      this.logger.warn(`[analytics] rejected public event ${payload.eventName}`);
      return;
    }
    const input = payload.properties ?? {};
    const properties = allowlistedProperties(payload.eventName, input);
    if (
      !properties ||
      (payload.anonVisitorId !== undefined && !SAFE_ANON_ID.test(payload.anonVisitorId))
    ) {
      this.logger.warn(`[analytics] rejected public analytics payload`);
      return;
    }
    return this.track({ ...payload, properties });
  }

  /** Server-side lifecycle event helper. Milestone events are first-only. */
  async trackServer(
    eventName: (typeof SERVER_EVENT_NAMES)[number],
    payload: Omit<TrackPayload, 'eventName'>,
  ) {
    // Preserve the acquisition cohort for post-approval milestones. The
    // application relation is the authoritative bridge; never infer identity
    // from email or other personal fields.
    if (payload.vendorId && !payload.applicationId && this.prisma.vendorApplication) {
      const application = await this.prisma.vendorApplication.findFirst({
        where: { vendorId: payload.vendorId },
        select: { id: true, anonVisitorId: true },
      });
      if (application) {
        payload = {
          ...payload,
          applicationId: application.id,
          anonVisitorId: payload.anonVisitorId ?? application.anonVisitorId ?? undefined,
        };
      }
    }
    if (SERVER_EVENT_NAMES.includes(eventName)) {
      // Milestones with a durable application/vendor identity must never be
      // deduped through a correlated user. A customer can place first orders
      // with multiple vendors, and user deletion must not collapse those
      // vendor/application milestones.
      const identityWhere = payload.applicationId
        ? { applicationId: payload.applicationId }
        : payload.vendorId
          ? { vendorId: payload.vendorId }
          : payload.userId
            ? { userId: payload.userId }
            : null;
      const existing = await this.prisma.analyticsEvent.findFirst({
        where: identityWhere ? { eventName, ...identityWhere } : { eventName },
        select: { id: true },
      });
      if (existing) return;
    }
    return this.track({ ...payload, eventName });
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
      // Do not display a UUID as a business name: an event whose vendor was
      // deleted/unavailable has no safe trading-name label.
      businessName: nameMap.get(r.vendorId) ?? 'Unknown vendor',
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

  async getLifecycleAggregates(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const funnel = await this.prisma.$queryRaw<{ eventName: string; count: bigint }[]>`
      WITH cohorts AS (
        SELECT COALESCE(e.application_id::text, linked.id::text, e.anon_visitor_id) AS cohort,
          MIN(e.created_at) FILTER (WHERE e.event_name IN ('become_a_vendor_landed','application_phase_1_started')) AS landing,
          MIN(e.created_at) FILTER (WHERE e.event_name = 'application_phase_1_completed') AS phase1,
          MIN(e.created_at) FILTER (WHERE e.event_name IN ('application_phase_2_submitted','application_submitted')) AS submitted,
          MIN(e.created_at) FILTER (WHERE e.event_name = 'application_approved') AS approved,
          MIN(e.created_at) FILTER (WHERE e.event_name = 'vendor_live') AS live,
          MIN(e.created_at) FILTER (WHERE e.event_name = 'first_order') AS first_order,
          MIN(e.created_at) FILTER (WHERE e.event_name = 'first_payout') AS payout
        FROM analytics_events e
        LEFT JOIN LATERAL (
          SELECT id FROM vendor_applications
          WHERE anon_visitor_id = e.anon_visitor_id
            AND created_at BETWEEN e.created_at - INTERVAL '24 hours'
                               AND e.created_at + INTERVAL '24 hours'
          ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - e.created_at))), created_at
          LIMIT 1
        ) linked ON true
        WHERE e.created_at >= ${since} AND COALESCE(e.application_id::text, linked.id::text, e.anon_visitor_id) IS NOT NULL
        GROUP BY 1
      ), stages AS (
        SELECT 'application_start' AS event_name, cohort, landing AS at FROM cohorts
        UNION ALL SELECT 'application_phase_1_completed', cohort,
          CASE WHEN phase1 >= landing THEN phase1 END FROM cohorts
        UNION ALL SELECT 'application_submitted', cohort,
          CASE WHEN submitted >= phase1 THEN submitted END FROM cohorts
        UNION ALL SELECT 'application_approved', cohort,
          CASE WHEN approved >= submitted THEN approved END FROM cohorts
        UNION ALL SELECT 'vendor_live', cohort,
          CASE WHEN live >= approved THEN live END FROM cohorts
        UNION ALL SELECT 'first_order', cohort,
          CASE WHEN first_order >= live THEN first_order END FROM cohorts
        UNION ALL SELECT 'first_payout', cohort,
          CASE WHEN payout >= first_order THEN payout END FROM cohorts
      )
      SELECT event_name AS "eventName", COUNT(*) FILTER (WHERE at IS NOT NULL)::bigint AS count
      FROM stages GROUP BY event_name
      ORDER BY array_position(ARRAY['application_start','application_phase_1_completed','application_submitted','application_approved','vendor_live','first_order','first_payout'], event_name)`;
    const times = await this.prisma.$queryRaw<{ p50: number | null; p90: number | null }[]>`
      WITH firsts AS (
        SELECT COALESCE(e.application_id::text, linked.id::text, e.anon_visitor_id) key, MIN(e.created_at) landing
        FROM analytics_events e
        LEFT JOIN LATERAL (
          SELECT id FROM vendor_applications
          WHERE anon_visitor_id = e.anon_visitor_id
            AND created_at BETWEEN e.created_at - INTERVAL '24 hours'
                               AND e.created_at + INTERVAL '24 hours'
          ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - e.created_at))), created_at
          LIMIT 1
        ) linked ON true
        WHERE e.event_name IN ('become_a_vendor_landed','application_phase_1_started')
          AND e.created_at >= ${since}
        GROUP BY 1
      ),
      lives AS (
        SELECT COALESCE(e.application_id::text, app.id::text, e.anon_visitor_id) key, MIN(e.created_at) live
        FROM analytics_events e
        LEFT JOIN vendor_applications app ON app.vendor_id = e.vendor_id
        WHERE e.event_name='vendor_live' AND e.created_at >= ${since} GROUP BY 1
      )
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lives.live-firsts.landing))) AS p50,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lives.live-firsts.landing))) AS p90
      FROM firsts JOIN lives USING (key)`;
    const sessions = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT anon_visitor_id)::bigint AS count FROM analytics_events
      WHERE created_at >= ${new Date(Date.now() - 30 * 86_400_000)} AND anon_visitor_id IS NOT NULL`;
    const recovery = await this.prisma.$queryRaw<
      { stage: string; sent: bigint; recovered: bigint }[]
    >`
      WITH supplied AS (
        SELECT i.vendor_id, i.name, i.supplied_at
        FROM vendor_required_onboarding_items i
        WHERE i.supplied_at IS NOT NULL
      ), attributed AS (
        SELECT s.id, s.stage, s.sent_at,
          EXISTS (
            SELECT 1 FROM supplied i
            WHERE i.vendor_id = rs.vendor_id AND i.name = rs.targeted_item
              AND i.supplied_at > s.sent_at
              AND s.sent_at = (
                SELECT MAX(previous.sent_at)
                FROM vendor_recovery_stages previous
                WHERE previous.schedule_id = s.schedule_id
                  AND previous.sent_at IS NOT NULL
                  AND previous.sent_at < i.supplied_at
              )
          ) AS recovered
        FROM vendor_recovery_stages s
        JOIN vendor_recovery_schedules rs ON rs.id = s.schedule_id
        WHERE s.sent_at >= ${since}
      )
      SELECT stage::text AS stage,
             COUNT(*) FILTER (WHERE s.sent_at IS NOT NULL)::bigint AS sent,
             COUNT(*) FILTER (WHERE recovered)::bigint AS recovered
      FROM attributed s
      GROUP BY stage ORDER BY MIN(sent_at)`;
    const rows = funnel ?? [];
    const funnelOut = rows.map((r, i) => ({
      eventName: r.eventName,
      count: Number(r.count),
      dropOffFromPrevious:
        i === 0 ? null : Math.max(0, Number(rows[i - 1].count) - Number(r.count)),
    }));
    return {
      funnel: funnelOut,
      applicationStartRate:
        funnelOut[0] && Number(sessions?.[0]?.count ?? 0) > 0
          ? funnelOut[0].count / Number(sessions[0].count)
          : 0,
      monthlySessions: Number(sessions?.[0]?.count ?? 0),
      monthlySessionsCaution: Number(sessions?.[0]?.count ?? 0) < 100,
      recoveryRates: (recovery ?? []).map((r) => ({
        stage: r.stage,
        sent: Number(r.sent),
        recovered: Number(r.recovered),
        rate: Number(r.sent) === 0 ? null : Number(r.recovered) / Number(r.sent),
      })),
      timeToLiveSeconds: { p50: times[0]?.p50 ?? null, p90: times[0]?.p90 ?? null },
    };
  }

  async getStuckLeads(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    return this.prisma.$queryRaw<
      { applicationId: string; createdAt: Date; currentStep: string; status: string }[]
    >`
      SELECT COALESCE(e.application_id, linked.id) AS "applicationId",
             e.created_at AS "createdAt",
             COALESCE(linked.current_step, app.current_step) AS "currentStep",
             COALESCE(linked.status, app.status)::text AS status
      FROM analytics_events e
      LEFT JOIN vendor_applications app ON app.id = e.application_id
      LEFT JOIN LATERAL (
        SELECT id, current_step, status
        FROM vendor_applications
        WHERE anon_visitor_id = e.anon_visitor_id
          AND created_at BETWEEN e.created_at - INTERVAL '24 hours'
                             AND e.created_at + INTERVAL '24 hours'
        ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - e.created_at))), created_at
        LIMIT 1
      ) linked ON true
      WHERE e.event_name = 'application_phase_1_started'
        AND e.created_at >= ${since}
        AND COALESCE(e.application_id, linked.id) IS NOT NULL
        AND COALESCE(linked.status, app.status)::text NOT IN ('approved', 'rejected')
      ORDER BY e.created_at ASC
      LIMIT 200`;
  }
}
