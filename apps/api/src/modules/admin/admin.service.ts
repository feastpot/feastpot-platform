import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DisputeStatus,
  DocumentStatus,
  OrderStatus,
  Prisma,
  UserRole,
  VendorApplicationStatus,
  VendorStatus,
} from '@prisma/client';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { vendorApplicationInfoRequestedTemplate } from '../notifications/templates/vendor-application-info-requested.template';
import { vendorApplicationRejectedTemplate } from '../notifications/templates/vendor-application-rejected.template';
import { vendorPortalInviteTemplate } from '../notifications/templates/vendor-portal-invite.template';

import { ListAdminVendorsDto } from './dto/list-admin-vendors.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { UpdateVendorApplicationDto } from './dto/update-vendor-application.dto';

/**
 * Statuses an application can move OUT of. Once it's in approved/rejected,
 * no further admin transitions are allowed (the row is the permanent record).
 */
const IN_FLIGHT_APPLICATION_STATUSES: VendorApplicationStatus[] = [
  VendorApplicationStatus.pending,
  VendorApplicationStatus.under_review,
  VendorApplicationStatus.information_requested,
];

function slugifyForVendor(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Order statuses that count as "real revenue" - same set used by the vendor
 * analytics service. Pending/cancelled/refunded are excluded.
 */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.accepted,
  OrderStatus.preparing,
  OrderStatus.dispatched,
  OrderStatus.delivered,
];

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcWeek(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

interface DailyBucket {
  date: string; // YYYY-MM-DD
  gmvPence: number;
  ordersCount: number;
}

interface TopVendorRow {
  vendorId: string;
  businessName: string;
  gmvPence: number;
  ordersCount: number;
  rating: number;
  reorderRatePct: number;
  disputeRatePct: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly supabase: SupabaseService,
    private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- dashboard

  async getDashboard() {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const weekStart = startOfUtcWeek(now);
    const monthStart = startOfUtcMonth(now);
    // 30-day window ending today (inclusive). i=0 → 29 days ago, i=29 → today.
    const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

    // Pulled in parallel; everything below is read-only aggregation.
    const [todayAgg, weekAgg, monthAgg, activeVendors, ordersToday, monthOrders, repeatStats, last30] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: todayStart } },
          _sum: { totalPence: true },
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: weekStart } },
          _sum: { totalPence: true },
        }),
        this.prisma.order.aggregate({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: monthStart } },
          _sum: { totalPence: true, subtotalPence: true },
          _avg: { totalPence: true },
          _count: { _all: true },
        }),
        this.prisma.vendor.count({
          where: { status: { in: [VendorStatus.live, VendorStatus.probation] } },
        }),
        this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
        this.prisma.order.findMany({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: monthStart } },
          select: { vendorId: true, totalPence: true },
        }),
        // Repeat-order rate over the last 90 days: % of customers with ≥2 delivered orders.
        this.prisma.order.findMany({
          where: {
            status: OrderStatus.delivered,
            createdAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
          },
          select: { customerId: true },
        }),
        this.prisma.order.findMany({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: thirtyDaysAgo } },
          select: { totalPence: true, createdAt: true },
        }),
      ]);

    // ---- daily revenue (30 day window, oldest → newest, gap-filled) ----
    const dailyMap = new Map<string, DailyBucket>();
    for (let i = 0; i < 30; i += 1) {
      const day = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, gmvPence: 0, ordersCount: 0 });
    }
    for (const o of last30) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const bucket = dailyMap.get(key);
      if (!bucket) continue;
      bucket.gmvPence += o.totalPence;
      bucket.ordersCount += 1;
    }
    const dailyRevenue = Array.from(dailyMap.values());

    // ---- top vendors by GMV this month (with rating + dispute rate) ----
    const vendorTotals = new Map<string, { gmv: number; orders: number }>();
    for (const o of monthOrders) {
      const cur = vendorTotals.get(o.vendorId) ?? { gmv: 0, orders: 0 };
      cur.gmv += o.totalPence;
      cur.orders += 1;
      vendorTotals.set(o.vendorId, cur);
    }
    const topVendorIds = Array.from(vendorTotals.entries())
      .sort(([, a], [, b]) => b.gmv - a.gmv)
      .slice(0, 10)
      .map(([id]) => id);

    let topVendors: TopVendorRow[] = [];
    if (topVendorIds.length > 0) {
      const [vendorRows, disputeRows] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { id: { in: topVendorIds } },
          select: { id: true, businessName: true, rating: true, reorderRatePct: true },
        }),
        // Open/escalated disputes per vendor in the same month.
        this.prisma.dispute.findMany({
          where: {
            createdAt: { gte: monthStart },
            order: { vendorId: { in: topVendorIds } },
          },
          select: { order: { select: { vendorId: true } } },
        }),
      ]);
      const disputeCount = new Map<string, number>();
      for (const d of disputeRows) {
        const vid = d.order.vendorId;
        disputeCount.set(vid, (disputeCount.get(vid) ?? 0) + 1);
      }
      const byId = new Map(vendorRows.map((v) => [v.id, v]));
      topVendors = topVendorIds.map((id) => {
        const totals = vendorTotals.get(id)!;
        const v = byId.get(id);
        const disputes = disputeCount.get(id) ?? 0;
        return {
          vendorId: id,
          businessName: v?.businessName ?? 'Unknown',
          gmvPence: totals.gmv,
          ordersCount: totals.orders,
          rating: v?.rating ?? 0,
          reorderRatePct: v?.reorderRatePct ?? 0,
          disputeRatePct: totals.orders === 0 ? 0 : Number(((disputes / totals.orders) * 100).toFixed(2)),
        };
      });
    }

    // ---- repeat order rate ----
    const customerOrderCounts = new Map<string, number>();
    for (const r of repeatStats) {
      customerOrderCounts.set(r.customerId, (customerOrderCounts.get(r.customerId) ?? 0) + 1);
    }
    const totalCustomers = customerOrderCounts.size;
    const repeatCustomers = Array.from(customerOrderCounts.values()).filter((n) => n >= 2).length;
    const repeatOrderRatePct =
      totalCustomers === 0 ? 0 : Number(((repeatCustomers / totalCustomers) * 100).toFixed(2));

    return {
      gmvTodayPence: todayAgg._sum.totalPence ?? 0,
      gmvWeekPence: weekAgg._sum.totalPence ?? 0,
      gmvMonthPence: monthAgg._sum.totalPence ?? 0,
      activeVendors,
      ordersToday,
      ordersTodayCount: todayAgg._count._all,
      avgBasketPence: Math.round(monthAgg._avg.totalPence ?? 0),
      repeatOrderRatePct,
      dailyRevenue,
      topVendors,
    };
  }

  // ---------------------------------------------------------------- orders

  /**
   * Admin order browser (FR-ADM-002): search by order id / order number /
   * customer email substring, optionally filter by status + date range.
   *
   * When `withPiStatus` is set we enrich the FIRST 50 rows with the live
   * Stripe PaymentIntent status. The cap is deliberate - Stripe rate-limits
   * are per-account and a careless 200-row enrichment would torch the
   * checkout-flow budget. Stripe failures degrade to `pi_status: null` so
   * the table still renders.
   */
  async listAdminOrders(opts: {
    status?: OrderStatus;
    q?: string;
    range?: 'today' | 'week' | 'month';
    withPiStatus?: boolean;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const where: Prisma.OrderWhereInput = {};
    if (opts.status) where.status = opts.status;

    if (opts.range) {
      const now = new Date();
      const since =
        opts.range === 'today'
          ? startOfUtcDay(now)
          : opts.range === 'week'
            ? startOfUtcWeek(now)
            : startOfUtcMonth(now);
      where.createdAt = { gte: since };
    }

    const q = opts.q?.trim();
    if (q) {
      const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      where.OR = [
        ...(uuidLike ? [{ id: q }] : []),
        { orderNumber: { contains: q, mode: 'insensitive' as const } },
        { customer: { email: { contains: q, mode: 'insensitive' as const } } },
      ];
    }

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalPence: true,
        createdAt: true,
        // Stripe PI lives on the Payment row, not Order. Pick the most
        // recent capture-type payment that has a PI id (manual-capture
        // flows have at most one capture per order).
        payments: {
          where: { stripePaymentIntentId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { stripePaymentIntentId: true },
        },
        items: { select: { nameSnapshot: true, quantity: true } },
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        vendor: { select: { id: true, businessName: true } },
      },
    });

    const flattened = rows.map((r) => {
      const { payments, ...rest } = r;
      return { ...rest, stripePaymentIntentId: payments[0]?.stripePaymentIntentId ?? null };
    });

    if (!opts.withPiStatus) {
      return flattened.map((r) => ({ ...r, piStatus: null as string | null }));
    }

    // Cap PI lookups at 50 *and* throttle to 5 concurrent in-flight reads.
    // Stripe rate-limits are shared per-account-per-second; a 50-wide
    // burst from an admin browsing this view can starve the customer
    // checkout flow. We process the slice in serial chunks of 5.
    const head = flattened.slice(0, 50);
    const enrich: Array<string | null> = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < head.length; i += CONCURRENCY) {
      const chunk = head.slice(i, i + CONCURRENCY);
      // eslint-disable-next-line no-await-in-loop -- intentional: bounded concurrency
      const results = await Promise.all(
        chunk.map(async (r) => {
          if (!r.stripePaymentIntentId) return null;
          try {
            const pi = await this.stripe.retrieve(r.stripePaymentIntentId);
            return pi.status;
          } catch {
            // Stripe lookup failed - fall through with null so the row
            // still renders. This is a read-only admin view, never block.
            return null;
          }
        }),
      );
      enrich.push(...results);
    }

    return flattened.map((r, i) => ({ ...r, piStatus: i < enrich.length ? enrich[i] : null }));
  }

  // ---------------------------------------------------------------- audit log

  async listAuditLog(dto: ListAuditLogDto) {
    const limit = dto.limit ?? 50;
    const where = this.buildAuditWhere(dto);
    const cursor = dto.cursor ? this.decodeAuditCursor(dto.cursor) : null;
    const cursorWhere: Prisma.AuditLogWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.auditLog.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      },
    });
    const nextCursor =
      rows.length === limit
        ? this.encodeAuditCursor({ createdAt: rows[rows.length - 1]!.createdAt, id: rows[rows.length - 1]!.id })
        : null;
    return { data: rows, nextCursor };
  }

  /**
   * Streams up to 5 000 rows as CSV via the supplied writer callback. We
   * paginate the DB read in batches of 500 and emit each row as soon as it's
   * formatted so the response starts flowing without buffering the full set
   * in memory. The 5 000 hard cap protects the endpoint from runaway scans;
   * exporters who need more rows must narrow filters.
   */
  async exportAuditLogCsv(
    dto: ListAuditLogDto,
    write: (chunk: string) => void,
  ): Promise<void> {
    const HARD_CAP = 5000;
    const PAGE = 500;
    const where = this.buildAuditWhere(dto);

    write(
      [
        'timestamp',
        'actor_email',
        'actor_role',
        'actor_name',
        'action',
        'entity_type',
        'entity_id',
        'ip_address',
        'metadata',
      ].join(',') + '\n',
    );

    let cursor: { createdAt: Date; id: string } | null = null;
    let emitted = 0;
    while (emitted < HARD_CAP) {
      const remaining = HARD_CAP - emitted;
      const take = Math.min(PAGE, remaining);
      const cursorWhere: Prisma.AuditLogWhereInput = cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {};
      const rows = await this.prisma.auditLog.findMany({
        where: { AND: [where, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: {
          actor: { select: { firstName: true, lastName: true, email: true, role: true } },
        },
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        const name = r.actor ? `${r.actor.firstName ?? ''} ${r.actor.lastName ?? ''}`.trim() : '';
        const fields = [
          r.createdAt.toISOString(),
          r.actor?.email ?? '',
          r.actor?.role ?? '',
          name,
          r.action,
          r.entityType,
          r.entityId ?? '',
          r.ipAddress ?? '',
          r.metadata ? JSON.stringify(r.metadata) : '',
        ];
        write(fields.map((f) => csvCell(f)).join(',') + '\n');
      }
      emitted += rows.length;
      const last = rows[rows.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (rows.length < take) break;
    }
  }

  private buildAuditWhere(dto: ListAuditLogDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (dto.entityType) where.entityType = dto.entityType;
    if (dto.entityId) where.entityId = dto.entityId;
    if (dto.actorId) where.actorId = dto.actorId;
    if (dto.action) where.action = dto.action;
    if (dto.dateFrom || dto.dateTo) {
      where.createdAt = {};
      if (dto.dateFrom) where.createdAt.gte = new Date(dto.dateFrom);
      if (dto.dateTo) where.createdAt.lt = new Date(dto.dateTo);
    }
    return where;
  }

  private encodeAuditCursor(c: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ createdAt: c.createdAt.toISOString(), id: c.id })).toString('base64url');
  }

  private decodeAuditCursor(s: string): { createdAt: Date; id: string } | null {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as {
        createdAt?: string;
        id?: string;
      };
      if (!obj.createdAt || !obj.id) return null;
      return { createdAt: new Date(obj.createdAt), id: obj.id };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------- compliance expiry

  async listExpiringDocuments() {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Include both verified-but-soon-to-expire AND already-marked-expired so
    // staff can chase the latter for re-verification.
    const docs = await this.prisma.vendorDocument.findMany({
      where: {
        OR: [
          { status: DocumentStatus.verified, expiresAt: { not: null, lte: in30 } },
          { status: DocumentStatus.expired },
        ],
      },
      include: { vendor: { select: { id: true, businessName: true } } },
      orderBy: [{ expiresAt: 'asc' }],
      take: 500,
    });

    return docs.map((d) => {
      const daysRemaining = d.expiresAt
        ? Math.ceil((d.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        id: d.id,
        vendorId: d.vendorId,
        vendorName: d.vendor.businessName,
        type: d.type,
        status: d.status,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        expiresAt: d.expiresAt,
        daysRemaining,
        // Bucket helps the UI colour rows red/amber/normal without redoing date math.
        urgency:
          daysRemaining === null
            ? 'unknown'
            : daysRemaining < 0
              ? 'expired'
              : daysRemaining <= 7
                ? 'critical'
                : 'warning',
      };
    });
  }

  // ------------------------------------------------------------ admin vendors

  /**
   * Vendor application queue. Defaults to status=pending so the admin's
   * "what's new" tab is one click away. Limited to 100 rows - applications
   * are low-volume (handful per week) so cursor pagination is overkill.
   */
  async listVendorApplications(status?: VendorApplicationStatus) {
    const rows = await this.prisma.vendorApplication.findMany({
      where: status ? { status } : { status: { in: IN_FLIGHT_APPLICATION_STATUSES } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        vendor: { select: { id: true, slug: true, status: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      kitchenName: r.kitchenName,
      email: r.email,
      phone: r.phone,
      postcode: r.postcode,
      cuisineType: r.cuisineType,
      kitchenType: r.kitchenType,
      hasFsaRegistration: r.hasFsaRegistration,
      instagram: r.instagram,
      status: r.status,
      reviewedAt: r.reviewedAt,
      reviewedBy: r.reviewedBy,
      adminNotes: r.adminNotes,
      rejectionReason: r.rejectionReason,
      vendor: r.vendor,
      createdAt: r.createdAt,
    }));
  }

  async getVendorApplication(id: string) {
    const row = await this.prisma.vendorApplication.findUnique({
      where: { id },
      include: {
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        vendor: { select: { id: true, slug: true, status: true, businessName: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'VENDOR_APPLICATION_NOT_FOUND',
        message: 'Vendor application not found',
      });
    }
    return row;
  }

  /**
   * Admin review action on a VendorApplication. Side effects per status:
   *   under_review          → audit-stamp only
   *   information_requested → email applicant with adminNotes
   *   rejected              → email applicant with rejectionReason
   *   approved              → provision Supabase auth user + DB User +
   *                           Vendor row, link application, send portal
   *                           invite (magic link). Skippable with
   *                           sendInvite=false for "fix-up" re-runs.
   *
   * Concurrency: every branch uses an atomic updateMany gated on the
   * application still being in an in-flight status. The strong guarantee
   * this gives is that two concurrent transitions to a TERMINAL status
   * (approved/rejected) cannot both succeed - last writer is rejected
   * with VENDOR_APPLICATION_ALREADY_REVIEWED. Weaker case: two admins
   * working from stale UI could sequentially flip pending→under_review
   * then under_review→information_requested; we accept that as low-stakes
   * (no provisioning side effects until approved) and trade strict
   * If-Match semantics for a simpler API. The approval branch additionally
   * wraps the DB writes in a Prisma transaction with compensating
   * supabase.deleteUser if the tx fails after the auth user was created.
   */
  async updateVendorApplication(
    id: string,
    reviewerId: string,
    dto: UpdateVendorApplicationDto,
  ) {
    // Per-branch input guards - class-validator can't express "required
    // when status=X", so we check here.
    if (dto.status === 'rejected' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'rejectionReason is required when status="rejected"',
      });
    }
    if (dto.status === 'information_requested' && !dto.adminNotes?.trim()) {
      throw new BadRequestException({
        code: 'ADMIN_NOTES_REQUIRED',
        message: 'adminNotes is required when status="information_requested" - they are surfaced to the applicant verbatim',
      });
    }

    const app = await this.prisma.vendorApplication.findUnique({
      where: { id },
    });
    if (!app) {
      throw new NotFoundException({
        code: 'VENDOR_APPLICATION_NOT_FOUND',
        message: 'Vendor application not found',
      });
    }
    if (!IN_FLIGHT_APPLICATION_STATUSES.includes(app.status)) {
      throw new ForbiddenException({
        code: 'VENDOR_APPLICATION_ALREADY_REVIEWED',
        message: `Application already ${app.status}`,
      });
    }

    if (dto.status === 'approved') {
      return this.approveVendorApplication(app, reviewerId, dto);
    }

    // Non-approval transitions: simple atomic claim + audit + maybe email.
    const claim = await this.prisma.vendorApplication.updateMany({
      where: { id, status: { in: IN_FLIGHT_APPLICATION_STATUSES } },
      data: {
        status: dto.status,
        adminNotes: dto.adminNotes ?? undefined,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason!.trim() : undefined,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });
    if (claim.count === 0) {
      throw new ForbiddenException({
        code: 'VENDOR_APPLICATION_ALREADY_REVIEWED',
        message: 'Application was reviewed by another admin while you were editing',
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: reviewerId,
        action: `vendor_application.${dto.status}`,
        entityType: 'vendor_applications',
        entityId: id,
        metadata: {
          previousState: { status: app.status },
          newState: {
            status: dto.status,
            adminNotes: dto.adminNotes ?? null,
            rejectionReason: dto.status === 'rejected' ? dto.rejectionReason!.trim() : null,
          },
        } as Prisma.JsonObject,
      },
    });

    // Fire-and-forget email (persistence already succeeded). Timeboxed
    // and logged on failure so on-call sees provider outages.
    const firstName = (app.fullName.trim().split(/\s+/)[0] || app.fullName).trim();
    if (dto.status === 'rejected') {
      const tmpl = vendorApplicationRejectedTemplate({
        firstName,
        kitchenName: app.kitchenName,
        reason: dto.rejectionReason!.trim(),
      });
      await this.sendAdminEmail(tmpl, app.email, `rejection email for application ${id}`);
    } else if (dto.status === 'information_requested') {
      const tmpl = vendorApplicationInfoRequestedTemplate({
        firstName,
        kitchenName: app.kitchenName,
        question: dto.adminNotes!.trim(),
      });
      await this.sendAdminEmail(tmpl, app.email, `info-requested email for application ${id}`);
    }
    // under_review: no email - purely internal signal.

    return this.getVendorApplication(id);
  }

  /**
   * Approval flow. Ordering matters for compensation:
   *   1. Pre-flight checks (slug availability, email collision)
   *   2. Create Supabase auth user           (SIDE EFFECT, not in tx)
   *   3. Begin Prisma tx:
   *        a. Atomic claim (in-flight → approved)
   *        b. Create User (id = Supabase uid)
   *        c. Create Vendor
   *        d. Link application.vendor_id
   *        e. Write audit log
   *      Commit.
   *   4. If tx throws → compensate by deleting the Supabase auth user
   *   5. Generate magic link + send portal invite (best effort; failures
   *      logged but don't unwind - the admin can re-send manually).
   */
  private async approveVendorApplication(
    app: Prisma.VendorApplicationGetPayload<{}>,
    reviewerId: string,
    dto: UpdateVendorApplicationDto,
  ) {
    const shouldProvision = dto.sendInvite !== false;
    const normalisedEmail = app.email.trim().toLowerCase();
    const [firstNameRaw, ...rest] = app.fullName.trim().split(/\s+/);
    const firstName = (firstNameRaw || app.fullName).trim();
    const lastName = rest.join(' ').trim() || null;

    if (!shouldProvision) {
      // "Mark approved without provisioning" path - used when a previous
      // approval partially failed and the operator just wants to flip the
      // status without re-creating duplicate auth/vendor rows.
      const claim = await this.prisma.vendorApplication.updateMany({
        where: { id: app.id, status: { in: IN_FLIGHT_APPLICATION_STATUSES } },
        data: {
          status: VendorApplicationStatus.approved,
          adminNotes: dto.adminNotes ?? undefined,
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        },
      });
      if (claim.count === 0) {
        throw new ForbiddenException({
          code: 'VENDOR_APPLICATION_ALREADY_REVIEWED',
          message: 'Application was reviewed by another admin while you were editing',
        });
      }
      await this.prisma.auditLog.create({
        data: {
          actorId: reviewerId,
          action: 'vendor_application.approved_no_provision',
          entityType: 'vendor_applications',
          entityId: app.id,
          metadata: {
            previousState: { status: app.status },
            note: 'sendInvite=false - admin will provision manually',
          } as Prisma.JsonObject,
        },
      });
      return this.getVendorApplication(app.id);
    }

    // Email-collision guard: if a User row already exists for this email,
    // we'd hit a unique constraint inside the tx. Surface that as a 409
    // BEFORE creating the Supabase user so we don't need to compensate.
    const emailCollision = await this.prisma.user.findFirst({
      where: { email: normalisedEmail },
      select: { id: true },
    });
    if (emailCollision) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: `A user with email ${normalisedEmail} already exists - link the existing user manually or have them change their email before approving.`,
      });
    }

    const baseSlug = slugifyForVendor(app.kitchenName) || `vendor-${app.id.slice(0, 8)}`;
    const slug = await this.uniqueVendorSlug(baseSlug);

    // STEP 2: Create Supabase auth user.
    const supabaseAdmin = this.supabase.getClient().auth.admin;
    const { data: created, error: createErr } = await supabaseAdmin.createUser({
      email: normalisedEmail,
      email_confirm: true, // skip the click-to-confirm - the magic link is the confirmation
      user_metadata: {
        role: 'vendor',
        source: 'vendor_application',
        applicationId: app.id,
        fullName: app.fullName,
      },
    });
    if (createErr || !created?.user?.id) {
      // Common cause: email already exists in Supabase auth from a prior
      // failed approval whose DB writes never landed. Surface as 502 so
      // the admin knows to clean up in Supabase before retrying.
      this.logger.error(
        `Supabase createUser failed for application ${app.id}: ${createErr?.message ?? 'no user returned'}`,
      );
      throw new InternalServerErrorException({
        code: 'SUPABASE_CREATE_USER_FAILED',
        message: createErr?.message ?? 'Supabase did not return a user',
      });
    }
    const supabaseUserId = created.user.id;

    // STEP 3: DB tx. If anything throws, compensate by deleting the auth user.
    let vendorId: string;
    try {
      vendorId = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.vendorApplication.updateMany({
          where: { id: app.id, status: { in: IN_FLIGHT_APPLICATION_STATUSES } },
          data: {
            status: VendorApplicationStatus.approved,
            adminNotes: dto.adminNotes ?? undefined,
            reviewedAt: new Date(),
            reviewedById: reviewerId,
          },
        });
        if (claim.count === 0) {
          throw new ForbiddenException({
            code: 'VENDOR_APPLICATION_ALREADY_REVIEWED',
            message: 'Application was reviewed by another admin while you were editing',
          });
        }

        await tx.user.create({
          data: {
            id: supabaseUserId, // pin to Supabase uid - same convention as users.service.sync
            email: normalisedEmail,
            firstName,
            lastName,
            phone: app.phone,
            role: UserRole.vendor,
          },
        });

        const newVendor = await tx.vendor.create({
          data: {
            userId: supabaseUserId,
            businessName: app.kitchenName,
            slug,
            description: app.foodStory,
            cuisines: [app.cuisineType],
            status: VendorStatus.approved, // approved (not yet `live`) - vendor still has menu/Stripe setup ahead
            commissionBps: 1200,
            approvedAt: new Date(),
          },
        });

        await tx.vendorApplication.update({
          where: { id: app.id },
          data: { vendorId: newVendor.id },
        });

        await tx.auditLog.create({
          data: {
            actorId: reviewerId,
            action: 'vendor_application.approved',
            entityType: 'vendor_applications',
            entityId: app.id,
            metadata: {
              previousState: { status: app.status },
              newState: {
                status: VendorApplicationStatus.approved,
                vendorId: newVendor.id,
                userId: supabaseUserId,
                slug,
              },
            } as Prisma.JsonObject,
          },
        });

        return newVendor.id;
      });
    } catch (err) {
      // Compensation: undo the Supabase user creation so a retry can succeed.
      try {
        await this.supabase.getClient().auth.admin.deleteUser(supabaseUserId);
      } catch (delErr) {
        this.logger.error(
          `COMPENSATION FAILED: could not delete orphaned Supabase user ${supabaseUserId} after approval-tx failure for application ${app.id} - manual cleanup required: ${(delErr as Error).message}`,
        );
      }
      throw err;
    }

    // STEP 5: magic link + portal invite email. Best effort.
    const vendorPortalUrl =
      this.config.get<string>('VENDOR_PORTAL_URL') ?? 'https://vendor.feastpot.co.uk';
    try {
      const { data: linkData, error: linkErr } = await this.supabase
        .getClient()
        .auth.admin.generateLink({
          type: 'magiclink',
          email: normalisedEmail,
          options: { redirectTo: `${vendorPortalUrl}/onboarding` },
        });
      // Note: Supabase magic-link expiry is controlled by the project's
      // auth config (Dashboard → Authentication → Email Templates). The
      // "expires in 7 days" copy in the email is informational; set the
      // project-level JWT_EXP / mailer_otp_exp to 604800 to match.
      const magicLinkUrl = linkData?.properties?.action_link;
      if (linkErr || !magicLinkUrl) {
        this.logger.error(
          `Magic link generation failed for vendor application ${app.id}: ${linkErr?.message ?? 'no action_link in response'} - vendor was provisioned but did NOT receive an invite email; resend manually.`,
        );
      } else {
        const tmpl = vendorPortalInviteTemplate({
          firstName,
          kitchenName: app.kitchenName,
          magicLinkUrl,
          expiresInDays: 7,
        });
        await this.sendAdminEmail(
          tmpl,
          normalisedEmail,
          `portal invite for newly-provisioned vendor ${vendorId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Portal invite email pipeline threw for application ${app.id}: ${(err as Error).message}`,
      );
    }

    return this.getVendorApplication(app.id);
  }

  /**
   * Operator action: regenerate the magic-link portal invite for an already-
   * approved-and-provisioned vendor application. Use when the original
   * invite email failed delivery, expired, or the vendor lost it.
   *
   * Preconditions:
   *   - application.status === 'approved'
   *   - application.vendorId IS NOT NULL  (Vendor was actually provisioned)
   *
   * Side effects: generates a fresh Supabase magic link and emails it.
   * Writes an audit log entry. Does NOT create new users/vendors.
   */
  async resendVendorApplicationInvite(applicationId: string, actorId: string) {
    const app = await this.prisma.vendorApplication.findUnique({
      where: { id: applicationId },
      include: {
        vendor: { select: { id: true, userId: true, businessName: true } },
      },
    });
    if (!app) {
      throw new NotFoundException({
        code: 'VENDOR_APPLICATION_NOT_FOUND',
        message: 'Vendor application not found',
      });
    }
    if (app.status !== VendorApplicationStatus.approved || !app.vendor) {
      throw new BadRequestException({
        code: 'VENDOR_APPLICATION_NOT_PROVISIONED',
        message:
          'Can only resend invites for approved applications that have a provisioned vendor. Use PATCH /vendor-applications/:id with status=approved (sendInvite=true) to provision a vendor that was approved with sendInvite=false.',
      });
    }

    const normalisedEmail = app.email.trim().toLowerCase();
    const firstName = (app.fullName.trim().split(/\s+/)[0] || app.fullName).trim();
    const vendorPortalUrl =
      this.config.get<string>('VENDOR_PORTAL_URL') ?? 'https://vendor.feastpot.co.uk';

    const { data: linkData, error: linkErr } = await this.supabase
      .getClient()
      .auth.admin.generateLink({
        type: 'magiclink',
        email: normalisedEmail,
        options: { redirectTo: `${vendorPortalUrl}/onboarding` },
      });
    const magicLinkUrl = linkData?.properties?.action_link;
    if (linkErr || !magicLinkUrl) {
      this.logger.error(
        `Magic link regeneration failed for application ${applicationId}: ${linkErr?.message ?? 'no action_link'}`,
      );
      throw new InternalServerErrorException({
        code: 'MAGIC_LINK_GENERATION_FAILED',
        message: linkErr?.message ?? 'Supabase did not return an action link',
      });
    }

    const tmpl = vendorPortalInviteTemplate({
      firstName,
      kitchenName: app.kitchenName,
      magicLinkUrl,
      expiresInDays: 7,
    });
    // Send synchronously here (vs the fire-and-forget pattern in
    // updateVendorApplication) because the operator explicitly asked to
    // resend - they need to know if it failed.
    try {
      await Promise.race([
        this.email.send({ to: normalisedEmail, subject: tmpl.subject, html: tmpl.html }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('email timed out after 10s')), 10_000),
        ),
      ]);
    } catch (err) {
      throw new InternalServerErrorException({
        code: 'INVITE_EMAIL_SEND_FAILED',
        message: (err as Error).message,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'vendor_application.invite_resent',
        entityType: 'vendor_applications',
        entityId: applicationId,
        metadata: {
          vendorId: app.vendor.id,
          email: normalisedEmail,
        } as Prisma.JsonObject,
      },
    });

    return { ok: true, applicationId, email: normalisedEmail };
  }

  /**
   * Slug uniqueness probe. Same algorithm as VendorsService.uniqueSlug -
   * intentionally duplicated rather than crossing module boundaries
   * because the Vendors module doesn't currently export its repository.
   */
  private async uniqueVendorSlug(base: string): Promise<string> {
    let candidate = base;
    for (let attempt = 0; attempt <= 50; attempt += 1) {
      candidate = attempt === 0 ? base : `${base}-${attempt}`;
      const existing = await this.prisma.vendor.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new ConflictException({
      code: 'SLUG_CONFLICT',
      message: 'Could not generate unique vendor slug from kitchen name',
    });
  }

  /** Send a transactional email with a 10s timeout; log rejections. */
  private async sendAdminEmail(
    tmpl: { subject: string; html: string },
    to: string,
    contextLabel: string,
  ): Promise<void> {
    const withTimeout = <T>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`email timed out after 10s`)), 10_000),
        ),
      ]);
    try {
      await withTimeout(this.email.send({ to, subject: tmpl.subject, html: tmpl.html }));
    } catch (err) {
      this.logger.error(`[AdminService] ${contextLabel} failed: ${(err as Error).message}`);
    }
  }

  async listAdminVendors(dto: ListAdminVendorsDto) {
    const limit = dto.limit ?? 25;
    const cursor = dto.cursor ? this.decodeVendorCursor(dto.cursor) : null;

    // No status filter ⇒ "All" tab in the admin UI returns vendors of every
    // status. The client decides the default tab (currently "Pending"); the
    // service must not silently override that with its own default.
    const where: Prisma.VendorWhereInput = {};
    if (dto.status) where.status = dto.status;
    if (dto.search) {
      where.businessName = { contains: dto.search, mode: 'insensitive' };
    }
    const cursorWhere: Prisma.VendorWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.vendor.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        documents: { select: { type: true, status: true, expiresAt: true } },
      },
    });

    const data = rows.map((v) => {
      const documentStatusByType: Record<string, DocumentStatus> = {};
      for (const d of v.documents) {
        // Prefer "worst" status if multiple exist for the same type - rejected
        // beats expired beats pending beats verified for the queue summary.
        const cur = documentStatusByType[d.type];
        documentStatusByType[d.type] = pickWorstStatus(cur, d.status);
      }
      return {
        id: v.id,
        businessName: v.businessName,
        slug: v.slug,
        cuisines: v.cuisines,
        status: v.status,
        rating: v.rating,
        ratingCount: v.ratingCount,
        commissionBps: v.commissionBps,
        payoutsEnabled: v.payoutsEnabled,
        createdAt: v.createdAt,
        approvedAt: v.approvedAt,
        owner: v.user,
        documentStatusByType,
      };
    });
    const nextCursor =
      rows.length === limit
        ? this.encodeVendorCursor({ createdAt: rows[rows.length - 1]!.createdAt, id: rows[rows.length - 1]!.id })
        : null;
    return { data, nextCursor };
  }

  /**
   * Lifecycle-state counters for the admin Vendors page tab strip.
   * Returns every VendorStatus key (even when zero) so the UI can render a
   * stable set of pills without nullish checks, plus an `all` total.
   */
  async getVendorStatusCounts(): Promise<Record<VendorStatus | 'all', number>> {
    const grouped = await this.prisma.vendor.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const out: Record<VendorStatus | 'all', number> = {
      pending: 0,
      approved: 0,
      live: 0,
      probation: 0,
      suspended: 0,
      removed: 0,
      all: 0,
    };
    for (const row of grouped) {
      out[row.status] = row._count._all;
      out.all += row._count._all;
    }
    return out;
  }

  private encodeVendorCursor(c: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ createdAt: c.createdAt.toISOString(), id: c.id })).toString('base64url');
  }

  private decodeVendorCursor(s: string): { createdAt: Date; id: string } | null {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as {
        createdAt?: string;
        id?: string;
      };
      if (!obj.createdAt || !obj.id) return null;
      return { createdAt: new Date(obj.createdAt), id: obj.id };
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------- payout reconcile

  /**
   * Pull the Stripe transfer for a payout and report any pence-level
   * discrepancy between Stripe's recorded amount and our DB. This is a
   * read-only diagnostic - it never mutates the payout.
   */
  async reconcilePayoutWithStripe(payoutId: string, role: UserRole) {
    if (role !== UserRole.admin && role !== UserRole.finance) {
      throw new ForbiddenException({
        code: 'PAYOUT_RECONCILE_FORBIDDEN',
        message: 'Only finance/admin may reconcile payouts',
      });
    }
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) {
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
    }
    if (!payout.stripeTransferId) {
      return {
        payoutId,
        stripeTransferId: null,
        ourAmountPence: payout.amountPence,
        stripeAmountPence: null,
        discrepancyPence: null,
        status: 'no_transfer' as const,
      };
    }
    try {
      const transfer = await this.stripe.retrieveTransfer(payout.stripeTransferId);
      const stripeAmountPence = transfer.amount;
      return {
        payoutId,
        stripeTransferId: payout.stripeTransferId,
        ourAmountPence: payout.amountPence,
        stripeAmountPence,
        discrepancyPence: payout.amountPence - stripeAmountPence,
        status: payout.amountPence === stripeAmountPence ? ('match' as const) : ('mismatch' as const),
      };
    } catch (err) {
      return {
        payoutId,
        stripeTransferId: payout.stripeTransferId,
        ourAmountPence: payout.amountPence,
        stripeAmountPence: null,
        discrepancyPence: null,
        status: 'stripe_error' as const,
        error: (err as Error).message,
      };
    }
  }
}

// "rejected" is treated as the worst because it requires re-upload; "expired"
// is next; "pending" outranks "verified" so the queue surfaces incomplete
// vendors instead of falsely-clean ones.
const STATUS_PRIORITY: Record<DocumentStatus, number> = {
  rejected: 4,
  expired: 3,
  pending: 2,
  verified: 1,
};

function pickWorstStatus(a: DocumentStatus | undefined, b: DocumentStatus): DocumentStatus {
  if (!a) return b;
  return STATUS_PRIORITY[b] > STATUS_PRIORITY[a] ? b : a;
}

function csvCell(value: string): string {
  // CSV-injection guard: spreadsheet apps execute cells starting with =, +, -, or @
  // as formulas. Prefix a single quote so the value is shown verbatim.
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  // RFC 4180: quote when the cell contains a comma, quote, or newline; double up internal quotes.
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

// Ensures DisputeStatus import lint isn't dropped if we later add dispute helpers.
export const _DISPUTE_STATUSES: DisputeStatus[] = Object.values(DisputeStatus);
