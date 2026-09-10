import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
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
import { randomBytes } from 'node:crypto';
import {
  DisputeStatus,
  DocumentStatus,
  OrderStatus,
  PaymentType,
  Prisma,
  UserRole,
  VendorApplicationStatus,
  VendorOnboardingStepName,
  RecoveryNudgeStage,
  NotificationChannel,
  VendorStatus,
} from '@prisma/client';

import { SupabaseService } from '../../auth/supabase.service';
import { csvCell } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueueSnapshot } from '../../queues/queue-snapshot.service';
import { StripeService } from '../../stripe/stripe.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { vendorApplicationInfoRequestedTemplate } from '../notifications/templates/vendor-application-info-requested.template';
import { vendorApplicationRejectedTemplate } from '../notifications/templates/vendor-application-rejected.template';
import { vendorPortalInviteTemplate } from '../notifications/templates/vendor-portal-invite.template';

import { ListAdminVendorsDto } from './dto/list-admin-vendors.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { ListCoverageInterestDto } from './dto/list-coverage-interest.dto';
import {
  BulkRequestVendorApplicationInformationDto,
  RequestVendorApplicationInformationDto,
} from './dto/request-vendor-application-information.dto';
import { UpdateVendorApplicationDto } from './dto/update-vendor-application.dto';
import { VendorRecoveryChaseDto } from './dto/vendor-recovery-chase.dto';

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
  reorderCustomers: number;
  deliveredCustomers: number;
  disputeRatePct: number;
  disputesCount: number;
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
    private readonly analytics: AnalyticsService,
    private readonly notifications?: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- dashboard

  /**
   * Operational metrics exclude data whose provenance is explicitly marked as
   * fixture data. This deliberately uses only persisted flags/relations, never
   * user identity attributes such as contact details or ownership names.
   */
  private operationalOrderWhere(where: Prisma.OrderWhereInput = {}): Prisma.OrderWhereInput {
    return {
      ...where,
      isSeedData: false,
      customer: { isTestData: false },
      vendor: { isSeedData: false, user: { isTestData: false } },
    };
  }

  private operationalVendorWhere(where: Prisma.VendorWhereInput = {}): Prisma.VendorWhereInput {
    return { ...where, isSeedData: false, user: { isTestData: false } };
  }

  async getDashboard() {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const weekStart = startOfUtcWeek(now);
    const monthStart = startOfUtcMonth(now);
    // 30-day window ending today (inclusive). i=0 → 29 days ago, i=29 → today.
    const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

    // Pulled in parallel; everything below is read-only aggregation.
    const [
      todayAgg,
      weekAgg,
      monthAgg,
      activeVendors,
      ordersToday,
      monthOrders,
      repeatStats,
      last30,
      deliveredOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: this.operationalOrderWhere({
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: todayStart },
        }),
        _sum: { totalPence: true },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: this.operationalOrderWhere({
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: weekStart },
        }),
        _sum: { totalPence: true },
      }),
      this.prisma.order.aggregate({
        where: this.operationalOrderWhere({
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: monthStart },
        }),
        _sum: { totalPence: true, subtotalPence: true },
        _avg: { totalPence: true },
        _count: { _all: true },
      }),
      this.prisma.vendor.count({
        where: this.operationalVendorWhere({
          status: { in: [VendorStatus.live, VendorStatus.probation] },
        }),
      }),
      this.prisma.order.count({
        where: this.operationalOrderWhere({ createdAt: { gte: todayStart } }),
      }),
      this.prisma.order.findMany({
        where: this.operationalOrderWhere({
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: monthStart },
        }),
        select: { vendorId: true, totalPence: true },
      }),
      // Repeat-order rate over the last 90 days: % of customers with ≥2 delivered orders.
      this.prisma.order.findMany({
        where: this.operationalOrderWhere({
          status: OrderStatus.delivered,
          createdAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
        }),
        select: { customerId: true },
      }),
      this.prisma.order.findMany({
        where: this.operationalOrderWhere({
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: thirtyDaysAgo },
        }),
        select: { totalPence: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: this.operationalOrderWhere({ status: OrderStatus.delivered }),
        select: { vendorId: true, customerId: true },
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
          where: this.operationalVendorWhere({ id: { in: topVendorIds } }),
          select: { id: true, businessName: true, rating: true },
        }),
        // Open/escalated disputes per vendor in the same month.
        this.prisma.dispute.findMany({
          where: {
            createdAt: { gte: monthStart },
            order: this.operationalOrderWhere({ vendorId: { in: topVendorIds } }),
          },
          select: { order: { select: { vendorId: true } } },
        }),
      ]);
      const disputeCount = new Map<string, number>();
      for (const d of disputeRows) {
        const vid = d.order.vendorId;
        disputeCount.set(vid, (disputeCount.get(vid) ?? 0) + 1);
      }
      const deliveredCustomerCounts = new Map<string, Map<string, number>>();
      for (const order of deliveredOrders) {
        if (!topVendorIds.includes(order.vendorId)) continue;
        const customers = deliveredCustomerCounts.get(order.vendorId) ?? new Map<string, number>();
        customers.set(order.customerId, (customers.get(order.customerId) ?? 0) + 1);
        deliveredCustomerCounts.set(order.vendorId, customers);
      }
      const byId = new Map(vendorRows.map((v) => [v.id, v]));
      topVendors = topVendorIds.map((id) => {
        const totals = vendorTotals.get(id)!;
        const v = byId.get(id);
        const disputes = disputeCount.get(id) ?? 0;
        const customerCounts = deliveredCustomerCounts.get(id) ?? new Map<string, number>();
        const deliveredCustomers = customerCounts.size;
        const reorderCustomers = Array.from(customerCounts.values()).filter(
          (count) => count >= 2,
        ).length;
        return {
          vendorId: id,
          businessName: v?.businessName ?? 'Unknown',
          gmvPence: totals.gmv,
          ordersCount: totals.orders,
          rating: v?.rating ?? 0,
          reorderRatePct:
            deliveredCustomers === 0
              ? 0
              : Number(((reorderCustomers / deliveredCustomers) * 100).toFixed(2)),
          reorderCustomers,
          deliveredCustomers,
          disputeRatePct:
            totals.orders === 0 ? 0 : Number(((disputes / totals.orders) * 100).toFixed(2)),
          disputesCount: disputes,
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
      repeatCustomers,
      totalCustomers,
      dailyRevenue,
      topVendors,
    };
  }

  // ----------------------------------------------------------- work queue/search

  /**
   * These are permissions for data *shown*, rather than just route guards.  In
   * particular support must never receive payout or chargeback metadata which
   * it cannot act on.
   */
  private workQueueCapabilities(role: UserRole) {
    return {
      operations: ([UserRole.admin, UserRole.support] as UserRole[]).includes(role),
      compliance: ([UserRole.admin, UserRole.compliance] as UserRole[]).includes(role),
      finance: ([UserRole.admin, UserRole.finance] as UserRole[]).includes(role),
      system: role === UserRole.admin,
    };
  }

  async getWorkQueue(role: UserRole, snapshots: QueueSnapshot[]) {
    const now = new Date();
    const inThirtyDays = new Date(now.getTime() + 30 * 86_400_000);
    const inSeventyTwoHours = new Date(now.getTime() + 72 * 3_600_000);
    const sla = new Date(now.getTime() - 48 * 3_600_000);
    const caps = this.workQueueCapabilities(role);
    type Item = {
      kind: string;
      title: string;
      href: string;
      deadline: string | null;
      consequence: number;
    };
    const items: Item[] = [];
    const counts: Record<string, number> = {
      catering: 0,
      applications: 0,
      disputes: 0,
      chargebacks: 0,
      payouts: 0,
      compliance: 0,
      menuModeration: 0,
      terms: 0,
      jobs: 0,
    };

    if (caps.operations) {
      const [enquiries, bookings, disputes] = await Promise.all([
        this.prisma.cateringEnquiry.findMany({
          where: {
            status: { in: ['NEW', 'UNASSIGNED'] },
            createdAt: { lt: sla },
            isTestData: false,
          },
          select: { id: true, contactName: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
        this.prisma.cateringBooking.findMany({
          where: {
            eventDate: { lt: now },
            status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
            enquiry: { isTestData: false },
            customer: { is: { isTestData: false } },
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
          select: { id: true, customerName: true, eventDate: true },
          orderBy: { eventDate: 'asc' },
          take: 50,
        }),
        this.prisma.dispute.findMany({
          where: {
            status: {
              in: [DisputeStatus.open, DisputeStatus.vendor_contacted, DisputeStatus.escalated],
            },
            order: this.operationalOrderWhere(),
            OR: [
              { vendorRespondBy: { lte: inSeventyTwoHours } },
              { platformRespondBy: { lte: inSeventyTwoHours } },
            ],
          },
          select: { id: true, vendorRespondBy: true, platformRespondBy: true },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
      ]);
      for (const row of enquiries) {
        items.push({
          kind: 'overdue_catering_enquiry',
          title: `Catering enquiry from ${row.contactName} is overdue`,
          href: `/catering-enquiries?status=NEW`,
          deadline: new Date(row.createdAt.getTime() + 48 * 3_600_000).toISOString(),
          consequence: 70,
        });
      }
      for (const row of bookings) {
        items.push({
          kind: 'unresolved_catering_event',
          title: `Catering event for ${row.customerName} is unresolved`,
          href: `/catering-bookings`,
          deadline: row.eventDate.toISOString(),
          consequence: 75,
        });
      }
      for (const row of disputes) {
        const deadline =
          row.vendorRespondBy &&
          (!row.platformRespondBy || row.vendorRespondBy < row.platformRespondBy)
            ? row.vendorRespondBy
            : row.platformRespondBy;
        const overdue = !!deadline && deadline < now;
        items.push({
          kind: overdue ? 'dispute_response_overdue' : 'dispute_response_due',
          title: overdue
            ? 'Dispute response deadline is overdue'
            : 'Dispute response deadline is near',
          href: `/disputes/${row.id}`,
          deadline: deadline?.toISOString() ?? null,
          consequence: overdue ? 90 : 80,
        });
      }
      const [enquiryCount, bookingCount, disputeCount] = await Promise.all([
        this.prisma.cateringEnquiry.count({
          where: {
            status: { in: ['NEW', 'UNASSIGNED'] },
            createdAt: { lt: sla },
            isTestData: false,
          },
        }),
        this.prisma.cateringBooking.count({
          where: {
            eventDate: { lt: now },
            status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
            enquiry: { isTestData: false },
            customer: { is: { isTestData: false } },
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
        }),
        this.prisma.dispute.count({
          where: {
            status: {
              in: [DisputeStatus.open, DisputeStatus.vendor_contacted, DisputeStatus.escalated],
            },
            order: this.operationalOrderWhere(),
            OR: [
              { vendorRespondBy: { lte: inSeventyTwoHours } },
              { platformRespondBy: { lte: inSeventyTwoHours } },
            ],
          },
        }),
      ]);
      counts.catering = enquiryCount + bookingCount;
      counts.disputes = disputeCount;
    }

    if (caps.compliance) {
      const [applications, documents, menuItems, currentTerms] = await Promise.all([
        this.prisma.vendorApplication.findMany({
          where: {
            status: { in: IN_FLIGHT_APPLICATION_STATUSES },
            submittedAt: { not: null, lt: sla },
          },
          select: { id: true, kitchenName: true, submittedAt: true },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
        this.prisma.vendorDocument.findMany({
          where: {
            expiresAt: { lte: inThirtyDays },
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
          select: { id: true, vendorId: true, type: true, expiresAt: true },
          orderBy: { expiresAt: 'asc' },
          take: 50,
        }),
        this.prisma.menuItem.findMany({
          where: {
            moderationStatus: 'auto_approved',
            moderatedById: null,
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
          select: { id: true, name: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
        this.prisma.termsVersion.findFirst({
          where: { documentType: 'VENDOR_TERMS', effectiveAt: { lte: now }, supersededAt: null },
          orderBy: { effectiveAt: 'desc' },
          select: { id: true },
        }),
      ]);
      for (const row of applications) {
        items.push({
          kind: 'vendor_application_past_sla',
          title: `${row.kitchenName} application is past SLA`,
          href: `/vendor-applications/${row.id}`,
          deadline: row.submittedAt
            ? new Date(row.submittedAt.getTime() + 48 * 3_600_000).toISOString()
            : null,
          consequence: 85,
        });
      }
      for (const row of documents) {
        items.push({
          kind: 'document_expiring',
          title: `${row.type} document requires review`,
          href: `/compliance?vendorId=${row.vendorId}`,
          deadline: row.expiresAt?.toISOString() ?? null,
          consequence: 95,
        });
      }
      for (const row of menuItems) {
        items.push({
          kind: 'auto_approved_menu_item',
          title: `${row.name} was auto-approved and needs review`,
          href: `/menus/queue?itemId=${row.id}`,
          deadline: row.createdAt.toISOString(),
          consequence: 90,
        });
      }
      if (currentTerms) {
        const outdatedTermsWhere = this.operationalVendorWhere({
          termsAcceptances: { none: { termsVersionId: currentTerms.id } },
        });
        const [vendors, termsCount] = await Promise.all([
          this.prisma.vendor.findMany({
            where: outdatedTermsWhere,
            select: { id: true, businessName: true },
            orderBy: { businessName: 'asc' },
            take: 50,
          }),
          this.prisma.vendor.count({ where: outdatedTermsWhere }),
        ]);
        for (const row of vendors) {
          items.push({
            kind: 'vendor_terms_outdated',
            title: `${row.businessName} has not accepted current terms`,
            href: `/vendors/${row.id}`,
            deadline: null,
            consequence: 65,
          });
        }
        counts.terms = termsCount;
      }
      const [applicationCount, documentCount, menuCount] = await Promise.all([
        this.prisma.vendorApplication.count({
          where: {
            status: { in: IN_FLIGHT_APPLICATION_STATUSES },
            submittedAt: { not: null, lt: sla },
          },
        }),
        this.prisma.vendorDocument.count({
          where: {
            expiresAt: { lte: inThirtyDays },
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
        }),
        this.prisma.menuItem.count({
          where: {
            moderationStatus: 'auto_approved',
            moderatedById: null,
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
        }),
      ]);
      counts.applications = applicationCount;
      // Compliance navigation deliberately badges document action only.
      counts.compliance = documentCount;
      counts.menuModeration = menuCount;
    }

    if (caps.finance) {
      const [chargebacks, payouts] = await Promise.all([
        this.prisma.chargeback.findMany({
          where: {
            evidenceDueBy: { gte: now, lte: inSeventyTwoHours },
            closedAt: null,
            OR: [{ order: null }, { order: this.operationalOrderWhere() }],
          },
          select: { id: true, amountPence: true, evidenceDueBy: true },
          orderBy: { evidenceDueBy: 'asc' },
          take: 50,
        }),
        this.prisma.payout.findMany({
          where: {
            status: { in: ['held', 'failed'] },
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
          select: { id: true, status: true, amountPence: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
      ]);
      for (const row of chargebacks) {
        items.push({
          kind: 'chargeback_evidence_due',
          title: `Chargeback evidence due (£${(row.amountPence / 100).toFixed(2)})`,
          href: `/chargebacks?status=needs_response`,
          deadline: row.evidenceDueBy!.toISOString(),
          consequence: 100,
        });
      }
      for (const row of payouts) {
        items.push({
          kind: `payout_${row.status}`,
          title: `${row.status === 'held' ? 'Held' : 'Failed'} payout (£${(row.amountPence / 100).toFixed(2)})`,
          href: `/payouts?id=${row.id}`,
          deadline: row.createdAt.toISOString(),
          consequence: 100,
        });
      }
      const [chargebackCount, payoutCount] = await Promise.all([
        this.prisma.chargeback.count({
          where: {
            evidenceDueBy: { gte: now, lte: inSeventyTwoHours },
            closedAt: null,
            OR: [{ order: null }, { order: this.operationalOrderWhere() }],
          },
        }),
        this.prisma.payout.count({
          where: {
            status: { in: ['held', 'failed'] },
            vendor: { isSeedData: false, user: { isTestData: false } },
          },
        }),
      ]);
      counts.chargebacks = chargebackCount;
      counts.payouts = payoutCount;
    }

    if (caps.system) {
      for (const queue of snapshots) {
        if (
          queue.failed === 0 &&
          !(queue.oldestWaitingAgeMs && queue.oldestWaitingAgeMs > 30 * 60_000)
        )
          continue;
        counts.jobs += queue.failed || 1;
        items.push({
          kind: queue.failed ? 'failed_jobs' : 'stalled_jobs',
          title: queue.failed
            ? `${queue.failed} failed job(s) in ${queue.queue}`
            : `Stalled job in ${queue.queue}`,
          href: `/dead-letters?queue=${encodeURIComponent(queue.queue)}`,
          deadline: null,
          consequence: 85,
        });
      }
    }
    items.sort(
      (a, b) =>
        b.consequence - a.consequence ||
        (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
        a.title.localeCompare(b.title),
    );
    return {
      observedAt: now.toISOString(),
      counts,
      items: items.map((item) => ({
        id: `${item.kind}:${item.href}:${item.deadline ?? 'none'}`,
        type: item.kind,
        title: item.title,
        detail: item.deadline ? `Action due ${item.deadline}` : undefined,
        severity:
          item.consequence >= 100
            ? 'critical'
            : item.consequence >= 85
              ? 'high'
              : item.consequence >= 70
                ? 'medium'
                : 'low',
        href: item.href,
        deadline: item.deadline ?? undefined,
        ageDays: item.deadline
          ? Math.max(
              0,
              Math.floor((now.getTime() - new Date(item.deadline).getTime()) / 86_400_000),
            )
          : undefined,
      })),
    };
  }

  /** Post-approval recovery queue; deliberately does not use application actors. */
  async listVendorRecoveryQueue() {
    const now = new Date();
    const rows = await this.prisma.vendorRecoverySchedule.findMany({
      where: {
        cancelledAt: null,
        stages: { some: { stage: RecoveryNudgeStage.admin_chase, dueAt: { lte: now } } },
      },
      include: {
        vendor: { select: { id: true, businessName: true, user: { select: { email: true } } } },
        stages: { orderBy: { dueAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const nowMs = now.getTime();
    return rows.map((row) => ({
      vendorId: row.vendor.id,
      businessName: row.vendor.businessName,
      email: row.vendor.user.email,
      vendorPortalUrl: `https://vendor.feastpot.co.uk/onboarding?item=${encodeURIComponent(row.targetedItem)}`,
      missingItem: row.targetedItem,
      ageHours: Math.max(0, Math.floor((nowMs - row.createdAt.getTime()) / 3_600_000)),
      chaseHistory: row.stages.map((stage) => ({
        stage: stage.stage,
        channel: stage.channel,
        dueAt: stage.dueAt.toISOString(),
        sentAt: stage.sentAt?.toISOString() ?? null,
      })),
    }));
  }

  async chaseVendorRecovery(vendorId: string, actorId: string, dto: VendorRecoveryChaseDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            phone: true,
            phoneVerified: true,
            notificationPreferences: {
              where: { key: 'vendor_onboarding_recovery', channel: 'sms' },
              select: { enabled: true },
            },
          },
        },
        application: { select: { marketingConsent: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (dto.channel === NotificationChannel.sms) {
      const smsPreference = vendor.user.notificationPreferences[0];
      if (
        !vendor.user.phone ||
        !vendor.user.phoneVerified ||
        vendor.application?.marketingConsent !== true ||
        smsPreference?.enabled === false
      ) {
        throw new BadRequestException(
          'SMS chase requires verified phone, positive consent and SMS preference',
        );
      }
    }
    const since = new Date(Date.now() - 7 * 86_400_000);
    const recent = await this.prisma.vendorRecoveryChase.findFirst({
      where: { vendorId, item: dto.item, status: 'delivered', createdAt: { gte: since } },
    });
    if (recent) throw new ConflictException('This item was chased within the last 7 days');
    const chase = await this.prisma.vendorRecoveryChase.create({
      data: {
        vendorId,
        actorId,
        item: dto.item,
        channel: dto.channel,
        message: dto.message?.trim() || 'Please complete this required onboarding item.',
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        entityType: 'vendor_recovery_chase',
        entityId: chase.id,
        action: 'vendor_recovery.chase',
        metadata: { vendorId, item: dto.item, channel: dto.channel },
      },
    });
    if (!this.notifications) throw new InternalServerErrorException('Notifications unavailable');
    await this.notifications.enqueue(
      NotificationEvent.vendor_onboarding_recovery,
      {
        userId: vendor.userId,
        requiredItem: dto.item,
        recoveryStage: 'admin_chase',
        recoveryChaseId: chase.id,
        deliveryChannel: dto.channel,
        portalUrl: `https://vendor.feastpot.co.uk/onboarding?item=${encodeURIComponent(dto.item)}`,
        supportEmail: PLATFORM_FACTS.support.email,
      },
      { jobId: `vendor-recovery-chase:${chase.id}` },
    );
    await this.prisma.vendorRecoveryChase.update({
      where: { id: chase.id },
      data: { queuedAt: new Date() },
    });
    return chase;
  }

  async bulkChaseVendorRecovery(
    actorId: string,
    requests: Array<{ vendorId: string; dto: VendorRecoveryChaseDto }>,
  ) {
    if (requests.length > 100) throw new BadRequestException('Maximum 100 recovery chases');
    const results: Array<{ vendorId: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const request of requests) {
      try {
        results.push({
          vendorId: request.vendorId,
          ok: true,
          result: await this.chaseVendorRecovery(request.vendorId, actorId, request.dto),
        });
      } catch (error) {
        results.push({ vendorId: request.vendorId, ok: false, error: (error as Error).message });
      }
    }
    return results;
  }

  async commandSearch(q: string | undefined, role: UserRole) {
    const query = q?.trim();
    if (!query) throw new BadRequestException('Query parameter "q" is required');
    if (query.length < 2)
      throw new BadRequestException('Query parameter "q" must be at least 2 characters');
    if (query.length > 100)
      throw new BadRequestException('Query parameter "q" must be at most 100 characters');
    const caps = this.workQueueCapabilities(role);
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
    const results: Array<{
      type: string;
      id: string;
      title: string;
      subtitle?: string;
      href: string;
    }> = [];
    const [orders, vendors, users, catering] = await Promise.all([
      caps.operations || caps.finance
        ? this.prisma.order.findMany({
            where: this.operationalOrderWhere({
              OR: [
                { orderNumber: { startsWith: query, mode: 'insensitive' } },
                ...(uuidLike ? [{ id: query }] : []),
              ],
            }),
            select: { id: true, orderNumber: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 10,
          })
        : [],
      caps.operations || caps.compliance
        ? this.prisma.vendor.findMany({
            where: this.operationalVendorWhere({
              OR: [
                { businessName: { startsWith: query, mode: 'insensitive' } },
                ...(uuidLike ? [{ id: query }] : []),
              ],
            }),
            select: { id: true, businessName: true },
            orderBy: [{ businessName: 'asc' }, { id: 'asc' }],
            take: 10,
          })
        : [],
      role === UserRole.admin || role === UserRole.support
        ? this.prisma.user.findMany({
            where: { email: { startsWith: query, mode: 'insensitive' }, isTestData: false },
            select: { id: true, email: true },
            orderBy: { email: 'asc' },
            take: 10,
          })
        : [],
      caps.operations
        ? this.prisma.cateringEnquiry.findMany({
            where: {
              isTestData: false,
              OR: [
                { contactName: { startsWith: query, mode: 'insensitive' } },
                ...(uuidLike ? [{ id: query }] : []),
              ],
            },
            select: { id: true, contactName: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 10,
          })
        : [],
    ]);
    results.push(
      ...orders.map((r) => ({
        type: 'order',
        id: r.id,
        title: r.orderNumber,
        subtitle: `Order ID: ${r.id}`,
        href: `/orders?ids=${r.id}`,
      })),
    );
    results.push(
      ...vendors.map((r) => ({
        type: 'vendor',
        id: r.id,
        title: r.businessName,
        subtitle: `Vendor ID: ${r.id}`,
        href: `/vendors/${r.id}`,
      })),
    );
    results.push(
      ...users.map((r) => ({
        type: 'user',
        id: r.id,
        title: r.email,
        subtitle: `User ID: ${r.id}`,
        href: `/users?q=${encodeURIComponent(r.email)}`,
      })),
    );
    results.push(
      ...catering.map((r) => ({
        type: 'catering_enquiry',
        id: r.id,
        title: r.contactName,
        subtitle: `Enquiry ID: ${r.id}`,
        href: `/catering-enquiries`,
      })),
    );
    return { results: results.slice(0, 25) };
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
    createdFrom?: string;
    createdTo?: string;
    paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    ids?: string;
    withPiStatus?: boolean;
    includeTestData?: boolean;
    limit?: number;
    page?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);
    const where = await this.buildAdminOrdersWhere(opts);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalPence: true,
          createdAt: true,
          // Stripe PI lives on the Payment row, not Order. Pick the most
          // recent capture-type payment that has a PI id (manual-capture
          // flows have at most one capture per order). We also pull the
          // latest payment status (any type) for the new "Payment" column.
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { stripePaymentIntentId: true, status: true },
          },
          items: { select: { nameSnapshot: true, quantity: true } },
          isSeedData: true,
          customer: {
            select: { id: true, email: true, firstName: true, lastName: true, isTestData: true },
          },
          vendor: {
            select: {
              id: true,
              businessName: true,
              isSeedData: true,
              user: { select: { isTestData: true } },
            },
          },
          adminTags: { select: { tag: true }, orderBy: { tag: 'asc' } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const flattened = rows.map((r) => {
      const { payments, adminTags, ...rest } = r;
      return {
        ...rest,
        adminTags: adminTags.map((t) => t.tag),
        isTestData:
          r.isSeedData || r.customer.isTestData || r.vendor.isSeedData || r.vendor.user.isTestData,
        testDataProvenance: [
          ...(r.isSeedData ? ['Order seed data'] : []),
          ...(r.customer.isTestData ? ['Customer test data'] : []),
          ...(r.vendor.isSeedData ? ['Vendor seed data'] : []),
          ...(r.vendor.user.isTestData ? ['Vendor owner test data'] : []),
        ],
        stripePaymentIntentId: payments[0]?.stripePaymentIntentId ?? null,
        paymentStatus: payments[0]?.status ?? null,
      };
    });

    if (!opts.withPiStatus) {
      return {
        data: flattened.map((r) => ({ ...r, piStatus: null as string | null })),
        total,
        page,
        limit,
      };
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

    return {
      data: flattened.map((r, i) => ({ ...r, piStatus: i < enrich.length ? enrich[i] : null })),
      total,
      page,
      limit,
    };
  }

  /**
   * Filter envelope shared by `listAdminOrders` and `adminOrdersStats` so
   * the KPI tiles always reflect the same scope as the table view above.
   */
  private async buildAdminOrdersWhere(opts: {
    status?: OrderStatus;
    q?: string;
    range?: 'today' | 'week' | 'month';
    createdFrom?: string;
    createdTo?: string;
    paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    ids?: string;
    includeTestData?: boolean;
  }): Promise<Prisma.OrderWhereInput> {
    const where: Prisma.OrderWhereInput = {};
    if (!opts.includeTestData) {
      where.isSeedData = false;
      where.customer = { isTestData: false };
      where.vendor = { isSeedData: false, user: { isTestData: false } };
    }
    if (opts.status) where.status = opts.status;

    // Explicit ID list (bulk "export selected"). Applied via AND so it can't
    // be widened by the OR search clause below. Capped at 100 to match the
    // bulk-action limit and the DTO's 4000-char query-string budget.
    if (opts.ids) {
      const ids = opts.ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100);
      where.id = { in: ids };
    }

    // Explicit createdFrom/To takes precedence over the `range` preset so
    // a custom date picker in the UI doesn't get silently overridden.
    if (opts.createdFrom || opts.createdTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (opts.createdFrom) createdAt.gte = new Date(opts.createdFrom);
      if (opts.createdTo) {
        const d = new Date(opts.createdTo);
        createdAt.lte = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
        );
      }
      where.createdAt = createdAt;
    } else if (opts.range) {
      const now = new Date();
      const since =
        opts.range === 'today'
          ? startOfUtcDay(now)
          : opts.range === 'week'
            ? startOfUtcWeek(now)
            : startOfUtcMonth(now);
      where.createdAt = { gte: since };
    }

    if (opts.paymentStatus) {
      // Filter must match the *latest* payment row per order so the
      // returned set is consistent with the "Payment" column (which
      // also reads `payments[0]` after `orderBy createdAt desc`).
      // A naive `payments: { some: { status } }` would match stale
      // intermediate rows (e.g. failed -> succeeded) and the UI would
      // show a different status than the filter implied.
      const latestMatching = await this.prisma.$queryRaw<Array<{ order_id: string }>>(
        Prisma.sql`
          SELECT order_id FROM (
            SELECT DISTINCT ON (p.order_id) p.order_id, p.status
            FROM payments p
            ORDER BY p.order_id, p.created_at DESC
          ) latest
          WHERE latest.status = ${opts.paymentStatus}::"PaymentStatus"
        `,
      );
      const ids = latestMatching.map((r) => r.order_id);
      // Empty match -> impossible filter; short-circuit with a sentinel
      // that returns no rows without breaking other filter clauses.
      where.id = ids.length === 0 ? { in: [] } : { in: ids };
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

    return where;
  }

  /**
   * Footer/header KPI tiles for the admin Orders page: total orders matching
   * the current filter, today's orders, completed (delivered), exceptions
   * (cancelled + refunded) and success rate (delivered / non-pending total).
   */
  async adminOrdersStats(opts: {
    status?: OrderStatus;
    q?: string;
    range?: 'today' | 'week' | 'month';
    createdFrom?: string;
    createdTo?: string;
    paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    includeTestData?: boolean;
  }) {
    const scope = await this.buildAdminOrdersWhere(opts);
    const startOfToday = startOfUtcDay(new Date());
    const [total, today, completed, exceptions, finalised] = await this.prisma.$transaction([
      this.prisma.order.count({ where: scope }),
      this.prisma.order.count({
        where: { AND: [scope, { createdAt: { gte: startOfToday } }] },
      }),
      this.prisma.order.count({
        where: { AND: [scope, { status: OrderStatus.delivered }] },
      }),
      this.prisma.order.count({
        where: {
          AND: [scope, { status: { in: [OrderStatus.cancelled, OrderStatus.refunded] } }],
        },
      }),
      // Denominator for success rate: orders that have left "pending" - i.e.
      // the merchant has acted on them. Excludes still-pending orders so a
      // fresh queue doesn't dilute the rate.
      this.prisma.order.count({
        where: { AND: [scope, { status: { not: OrderStatus.pending } }] },
      }),
    ]);
    const successRatePct = finalised === 0 ? null : Math.round((completed / finalised) * 100);
    return {
      total,
      today,
      completed,
      exceptions,
      successRatePct,
      successfulCount: completed,
      finalisedCount: finalised,
    };
  }

  /**
   * CSV export of the admin order browser using the same filter envelope as
   * `listAdminOrders`. Bounded at 5,000 rows - large enough for any
   * reasonable single-day audit, small enough to stream without blowing the
   * Node heap.
   */
  async adminOrdersCsv(opts: {
    status?: OrderStatus;
    q?: string;
    range?: 'today' | 'week' | 'month';
    createdFrom?: string;
    createdTo?: string;
    paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    ids?: string;
    includeTestData?: boolean;
  }): Promise<string> {
    const where = await this.buildAdminOrdersWhere(opts);
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalPence: true,
        createdAt: true,
        isSeedData: true,
        customer: {
          select: { email: true, firstName: true, lastName: true, isTestData: true },
        },
        vendor: {
          select: {
            businessName: true,
            isSeedData: true,
            user: { select: { isTestData: true } },
          },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
        items: { select: { nameSnapshot: true, quantity: true } },
        adminTags: { select: { tag: true } },
      },
    });
    const header = [
      'Created (UTC)',
      'Order ID',
      'Order Number',
      'Customer Name',
      'Customer Email',
      'Vendor',
      'Items',
      'Total (GBP)',
      'Status',
      'Payment',
      'Tags',
      'is_test_data',
      'provenance',
    ];
    const esc = (s: string): string => {
      // Defuse spreadsheet formula injection on user-controlled text.
      let v = s;
      if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      const name =
        `${r.customer.firstName ?? ''} ${r.customer.lastName ?? ''}`.trim() || r.customer.email;
      const items = r.items.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join('; ');
      lines.push(
        [
          esc(r.createdAt.toISOString()),
          esc(r.id),
          esc(r.orderNumber),
          esc(name),
          esc(r.customer.email),
          esc(r.vendor.businessName),
          esc(items),
          (r.totalPence / 100).toFixed(2),
          esc(r.status),
          esc(r.payments[0]?.status ?? ''),
          esc(r.adminTags.map((t) => t.tag).join('; ')),
          String(
            r.isSeedData ||
              r.customer.isTestData ||
              r.vendor.isSeedData ||
              r.vendor.user.isTestData,
          ),
          esc(
            [
              ...(r.isSeedData ? ['Order seed data'] : []),
              ...(r.customer.isTestData ? ['Customer test data'] : []),
              ...(r.vendor.isSeedData ? ['Vendor seed data'] : []),
              ...(r.vendor.user.isTestData ? ['Vendor owner test data'] : []),
            ].join('; '),
          ),
        ].join(','),
      );
    }
    return lines.join('\n');
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
        ? this.encodeAuditCursor({
            createdAt: rows[rows.length - 1]!.createdAt,
            id: rows[rows.length - 1]!.id,
          })
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
  async exportAuditLogCsv(dto: ListAuditLogDto, write: (chunk: string) => void): Promise<void> {
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
        'is_test_data',
        'provenance',
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
          String(r.isTestData),
          r.provenance ?? '',
        ];
        write(fields.map((f) => csvCell(f)).join(',') + '\n');
      }
      emitted += rows.length;
      const last = rows[rows.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (rows.length < take) break;
    }
  }

  // ------------------------------------------------------------------
  // Coverage waitlist (ops read/export - capture is public via /coverage-interest)
  // ------------------------------------------------------------------

  async listCoverageInterest(dto: ListCoverageInterestDto) {
    const limit = dto.limit ?? 50;
    const where = this.buildCoverageInterestWhere(dto);
    const [rows, total] = await Promise.all([
      this.prisma.coverageInterest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      }),
      this.prisma.coverageInterest.count({ where }),
    ]);
    const page = rows.slice(0, limit);
    return {
      data: page,
      total,
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  async exportCoverageInterestCsv(
    dto: ListCoverageInterestDto,
    write: (chunk: string) => void,
  ): Promise<void> {
    const HARD_CAP = 5000;
    const PAGE = 500;
    const where = this.buildCoverageInterestWhere(dto);

    write(
      ['created_at', 'email', 'postcode', 'name', 'marketing_consent', 'notified', 'source'].join(
        ',',
      ) + '\n',
    );

    let cursor: string | null = null;
    let emitted = 0;
    while (emitted < HARD_CAP) {
      const take = Math.min(PAGE, HARD_CAP - emitted);
      const rows: Array<{
        id: string;
        createdAt: Date;
        email: string;
        postcode: string;
        name: string | null;
        marketingConsent: boolean | null;
        notified: boolean;
        source: string | null;
      }> = await this.prisma.coverageInterest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        const fields = [
          r.createdAt.toISOString(),
          r.email,
          r.postcode,
          r.name ?? '',
          r.marketingConsent == null ? '' : String(r.marketingConsent),
          String(r.notified),
          r.source ?? '',
        ];
        write(fields.map((f) => csvCell(f)).join(',') + '\n');
      }
      emitted += rows.length;
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < take) break;
    }
  }

  private buildCoverageInterestWhere(
    dto: ListCoverageInterestDto,
  ): Prisma.CoverageInterestWhereInput {
    const where: Prisma.CoverageInterestWhereInput = {};
    if (dto.postcode?.trim()) {
      where.postcode = { startsWith: dto.postcode.trim(), mode: 'insensitive' };
    }
    if (dto.notified != null) where.notified = dto.notified === 'true';
    return where;
  }

  private buildAuditWhere(dto: ListAuditLogDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = dto.includeTestData ? {} : { isTestData: false };
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
    return Buffer.from(JSON.stringify({ createdAt: c.createdAt.toISOString(), id: c.id })).toString(
      'base64url',
    );
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
  async listVendorApplications(status?: VendorApplicationStatus, includeTestData = false) {
    const rows = await this.prisma.vendorApplication.findMany({
      where: {
        ...(status ? { status } : { status: { in: IN_FLIGHT_APPLICATION_STATUSES } }),
        submittedAt: { not: null },
        ...(includeTestData ? {} : { isTestData: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        vendor: { select: { id: true, slug: true, status: true } },
        informationRequests: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    return rows.map((r) => {
      const missingItems = this.missingApplicationInformation(r);
      return {
        id: r.id,
        fullName: r.fullName,
        kitchenName: r.kitchenName,
        email: r.email,
        phone: r.phone,
        postcode: r.postcode,
        cuisineType: r.cuisineType,
        cuisineTypes: r.cuisineTypes,
        kitchenType: r.kitchenType,
        hasFsaRegistration: r.hasFsaRegistration,
        hygieneRegNumber: r.hygieneRegNumber,
        instagram: r.instagram,
        status: r.status,
        reviewedAt: r.reviewedAt,
        reviewedBy: r.reviewedBy,
        adminNotes: r.adminNotes,
        rejectionReason: r.rejectionReason,
        vendor: r.vendor,
        lastChasedAt: r.informationRequests[0]?.createdAt ?? null,
        missingItems,
        missingItemLinks: missingItems.map((item) => ({
          item,
          href: `/vendor/onboarding?item=${encodeURIComponent(item)}`,
        })),
        ageingDays: r.submittedAt
          ? Math.max(0, Math.floor((Date.now() - r.submittedAt.getTime()) / 86_400_000))
          : 0,
        createdAt: r.createdAt,
      };
    });
  }

  async getVendorApplication(id: string) {
    const row = await this.prisma.vendorApplication.findFirst({
      where: { id, submittedAt: { not: null } },
      include: {
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        vendor: { select: { id: true, slug: true, status: true, businessName: true } },
        informationRequests: {
          include: {
            actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
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

  private missingApplicationInformation(app: {
    fullName: string;
    kitchenName: string;
    email: string;
    phone: string;
    postcode: string;
    cuisineTypes: string[];
    occasionSlugs: string[];
    menuPhotoPath: string | null;
  }): string[] {
    const items: string[] = [];
    const required: Array<[string, string]> = [
      ['full name', app.fullName],
      ['kitchen name', app.kitchenName],
      ['email address', app.email],
      ['phone number', app.phone],
      ['postcode', app.postcode],
    ];
    for (const [label, value] of required) if (!value?.trim()) items.push(label);
    if (app.cuisineTypes.length === 0) items.push('cuisine type');
    if (app.occasionSlugs.length === 0) items.push('occasions');
    if (!app.menuPhotoPath) items.push('menu photo');
    return items;
  }

  async requestVendorApplicationInformation(
    id: string,
    actorId: string,
    dto: RequestVendorApplicationInformationDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const app = await tx.vendorApplication.findUnique({ where: { id } });
      if (!app)
        throw new NotFoundException({
          code: 'VENDOR_APPLICATION_NOT_FOUND',
          message: 'Vendor application not found',
        });
      if (!app.submittedAt)
        throw new NotFoundException({
          code: 'VENDOR_APPLICATION_NOT_FOUND',
          message: 'Vendor application not found',
        });
      if (!IN_FLIGHT_APPLICATION_STATUSES.includes(app.status)) {
        throw new ForbiddenException({
          code: 'VENDOR_APPLICATION_NOT_ACTIONABLE',
          message: `Application is ${app.status} and cannot be chased`,
        });
      }
      const last = await tx.vendorApplicationInfoRequest.findFirst({
        where: { applicationId: id },
        orderBy: { createdAt: 'desc' },
      });
      const nextAllowedAt = last && new Date(last.createdAt.getTime() + 7 * 86_400_000);
      if (nextAllowedAt && nextAllowedAt > new Date()) {
        throw new ConflictException({
          code: 'VENDOR_APPLICATION_CHASE_COOLDOWN',
          message: `Information was last requested on ${last.createdAt.toISOString()}; another request is allowed after ${nextAllowedAt.toISOString()}`,
          nextAllowedAt: nextAllowedAt.toISOString(),
        });
      }
      const requestedItems = [
        ...new Set([...(dto.requestedItems ?? []), ...this.missingApplicationInformation(app)]),
      ]
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20);
      const message =
        dto.message?.trim() ||
        (requestedItems.length
          ? `Please provide ${requestedItems.join(', ')} so we can continue reviewing your application.`
          : 'Please send the remaining information needed to continue reviewing your application.');
      const now = new Date();
      const request = await tx.vendorApplicationInfoRequest.create({
        data: { applicationId: id, actorId, requestedItems, message, createdAt: now },
      });
      await tx.vendorApplication.update({
        where: { id },
        data: {
          status: VendorApplicationStatus.information_requested,
          adminNotes: message,
          reviewedAt: now,
          reviewedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'vendor_application.information_requested',
          entityType: 'vendor_applications',
          entityId: id,
          metadata: {
            requestId: request.id,
            requestedItems,
            message,
            previousStatus: app.status,
          } as Prisma.JsonObject,
        },
      });
      return { app, request, requestedItems, message };
    });
    const firstName = (result.app.fullName.trim().split(/\s+/)[0] || result.app.fullName).trim();
    const template = vendorApplicationInfoRequestedTemplate({
      firstName,
      kitchenName: result.app.kitchenName,
      question: result.message,
    });
    await this.sendAdminEmail(
      template,
      result.app.email,
      `info-requested email for application ${id}`,
    );
    return {
      applicationId: id,
      requestId: result.request.id,
      requestedItems: result.requestedItems,
      message: result.message,
      requestedAt: result.request.createdAt,
    };
  }

  async bulkRequestVendorApplicationInformation(
    dto: BulkRequestVendorApplicationInformationDto,
    actorId: string,
  ) {
    const ids = [...new Set(dto.applicationIds)];
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const requested = await this.requestVendorApplicationInformation(id, actorId, dto);
          return { ok: true, outcome: 'success' as const, ...requested };
        } catch (error) {
          const response = error instanceof Error ? error.message : 'Unable to request information';
          const code =
            error instanceof ConflictException
              ? (error.getResponse() as { code?: string }).code
              : undefined;
          return {
            applicationId: id,
            ok: false,
            outcome:
              code === 'VENDOR_APPLICATION_CHASE_COOLDOWN'
                ? ('skipped' as const)
                : ('error' as const),
            error: response,
          };
        }
      }),
    );
    return {
      results,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  }

  async listSupplyPipeline(status: string | undefined, includeTestData = false) {
    const lifecycle = new Set([
      'Applied',
      'Under review',
      'Info requested',
      'Approved',
      'Onboarding',
      'Live',
      'Probation',
      'Suspended',
      'Removed',
      'Rejected',
    ]);
    if (status && !lifecycle.has(status))
      throw new BadRequestException('Invalid supply pipeline status');
    const applicationStatus: Record<VendorApplicationStatus, string> = {
      pending: 'Applied',
      under_review: 'Under review',
      information_requested: 'Info requested',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    const vendorStatus: Record<VendorStatus, string> = {
      pending: 'Onboarding',
      approved: 'Approved',
      live: 'Live',
      probation: 'Probation',
      suspended: 'Suspended',
      removed: 'Removed',
    };
    const [applications, vendors, applicationGroups, vendorGroups] = await Promise.all([
      this.prisma.vendorApplication.findMany({
        where: {
          submittedAt: { not: null },
          ...(includeTestData ? {} : { isTestData: false }),
          ...(status
            ? {
                status: {
                  in: Object.entries(applicationStatus)
                    .filter(([, value]) => value === status)
                    .map(([key]) => key as VendorApplicationStatus),
                },
              }
            : {}),
        },
        include: {
          vendor: { select: { id: true } },
          informationRequests: {
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.vendor.findMany({
        where: includeTestData
          ? status
            ? {
                status: {
                  in: Object.entries(vendorStatus)
                    .filter(([, value]) => value === status)
                    .map(([key]) => key as VendorStatus),
                },
              }
            : {}
          : this.operationalVendorWhere(
              status
                ? {
                    status: {
                      in: Object.entries(vendorStatus)
                        .filter(([, value]) => value === status)
                        .map(([key]) => key as VendorStatus),
                    },
                  }
                : {},
            ),
        select: {
          id: true,
          businessName: true,
          status: true,
          createdAt: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.vendorApplication.groupBy({
        by: ['status'],
        where: {
          ...(includeTestData ? {} : { isTestData: false }),
          vendorId: null,
          submittedAt: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.vendor.groupBy({
        by: ['status'],
        where: includeTestData ? {} : this.operationalVendorWhere(),
        _count: { _all: true },
      }),
    ]);
    const rows = [
      ...applications
        .filter((app) => !app.vendorId)
        .map((app) => ({
          id: `application:${app.id}`,
          recordType: 'application',
          recordId: app.id,
          lifecycle: applicationStatus[app.status],
          name: app.kitchenName,
          contact: app.email,
          submittedAt: app.createdAt,
          lastChasedAt: app.informationRequests[0]?.createdAt ?? null,
          href: `/vendor-applications/${app.id}`,
        })),
      ...vendors.map((vendor) => ({
        id: `vendor:${vendor.id}`,
        recordType: 'vendor',
        recordId: vendor.id,
        lifecycle: vendorStatus[vendor.status],
        name: vendor.businessName,
        contact: vendor.user.email,
        submittedAt: vendor.createdAt,
        lastChasedAt: null,
        href: `/vendors/${vendor.id}`,
      })),
    ].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
    const counts = Object.fromEntries([...lifecycle].map((state) => [state, 0])) as Record<
      string,
      number
    >;
    for (const group of applicationGroups)
      counts[applicationStatus[group.status]] += group._count._all;
    for (const group of vendorGroups) counts[vendorStatus[group.status]] += group._count._all;
    // Counts are aggregated without the display cap, so tab pills and total
    // remain exact even if a lifecycle has more than 500 records.
    return { rows, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
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
  async updateVendorApplication(id: string, reviewerId: string, dto: UpdateVendorApplicationDto) {
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
        message:
          'adminNotes is required when status="information_requested" - they are surfaced to the applicant verbatim',
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
    if (!app.submittedAt) {
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

    // Preserve the legacy PATCH contract while routing its request-information
    // side effect through the durable chase record and server-enforced cooldown.
    if (dto.status === 'information_requested') {
      await this.requestVendorApplicationInformation(id, reviewerId, {
        message: dto.adminNotes,
      });
      return this.getVendorApplication(id);
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
    app: Prisma.VendorApplicationGetPayload<Record<string, never>>,
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

    // STEP 1b: Resolve the referring vendor captured at application time.
    // Validated here (outside the tx) so slow lookups do not hold locks.
    // Rules:
    //  - referrerVendorId must still exist and be in an operational status
    //    (approved or live); suspended / pending / unknown => null + log.
    //  - Belt-and-suspenders self-referral guard: skip if the referrer's
    //    userId matches the incoming supabaseUserId (impossible in normal
    //    flow because the email-collision guard fires first, but guarded
    //    anyway so the invariant is machine-enforced).
    //  - If the column is null the whole block is a no-op.
    let validatedReferrerVendorId: string | null = null;
    const storedReferrerId = app.referrerVendorId ?? null;
    if (storedReferrerId) {
      const referrer = await this.prisma.vendor.findUnique({
        where: { id: storedReferrerId },
        select: { id: true, userId: true, status: true, businessName: true },
      });
      if (!referrer) {
        this.logger.warn(
          `approveVendorApplication: referrer vendor ${storedReferrerId} not found for application ${app.id} - referred_by_vendor_id will be null`,
        );
      } else if (
        referrer.status !== VendorStatus.approved &&
        referrer.status !== VendorStatus.live &&
        referrer.status !== VendorStatus.probation
      ) {
        this.logger.warn(
          `approveVendorApplication: referrer vendor ${storedReferrerId} (${referrer.businessName}) has status ${referrer.status} for application ${app.id} - referred_by_vendor_id will be null`,
        );
      } else {
        // Self-referral guard (belt-and-suspenders; email guard fires first).
        // We don't yet have supabaseUserId at this point, so check by email.
        const referrerUser = await this.prisma.user.findUnique({
          where: { id: referrer.userId },
          select: { email: true },
        });
        if (referrerUser?.email.toLowerCase() === normalisedEmail) {
          this.logger.warn(
            `approveVendorApplication: self-referral detected for email=${normalisedEmail}, referrer vendor ${storedReferrerId} - referred_by_vendor_id will be null`,
          );
        } else {
          validatedReferrerVendorId = referrer.id;
        }
      }
    }

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
            description:
              app.foodStory ||
              `Independent ${
                app.cuisineTypes.length > 0 ? app.cuisineTypes.join(', ') : app.cuisineType
              } kitchen.`,
            cuisines: app.cuisineTypes.length > 0 ? app.cuisineTypes : [app.cuisineType],
            coverImageUrl: app.menuPhotoUrl,
            status: VendorStatus.approved, // approved (not yet `live`) - vendor still has menu/Stripe setup ahead
            commissionBps: Math.round(COMMISSION_RATES.marketplaceFirst.percent * 100),
            approvedAt: new Date(),
            // Write once: the referrer stored on the application at submission
            // time. validatedReferrerVendorId is resolved before the tx (see
            // below) so it is never null when a valid referrer exists.
            referredByVendorId: validatedReferrerVendorId,
          },
        });

        // Seed the post-approval recovery projection and clock at approval,
        // never when a vendor later opens the readiness page.
        const recoveryStart = newVendor.approvedAt ?? newVendor.createdAt;
        await tx.vendorRequiredOnboardingItem.createMany({
          data: Object.values(VendorOnboardingStepName).map((name) => ({
            vendorId: newVendor.id,
            name,
            state: 'outstanding' as const,
          })),
          skipDuplicates: true,
        });
        const schedule = await tx.vendorRecoverySchedule.create({
          data: {
            vendorId: newVendor.id,
            targetedItem: VendorOnboardingStepName.food_business_registration,
          },
        });
        await tx.vendorRecoveryStage.createMany({
          data: (
            [
              [RecoveryNudgeStage.sms_2h, 2, NotificationChannel.sms],
              [RecoveryNudgeStage.email_24h, 24, NotificationChannel.email],
              [RecoveryNudgeStage.email_3d_help, 72, NotificationChannel.email],
              [RecoveryNudgeStage.email_7d_final, 168, NotificationChannel.email],
              [RecoveryNudgeStage.admin_chase, 168, NotificationChannel.email],
            ] as const
          ).map(([stage, hours, channel]) => ({
            scheduleId: schedule.id,
            stage,
            channel,
            dueAt: new Date(recoveryStart.getTime() + Number(hours) * 3600000),
          })),
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

        void this.analytics.trackServer('application_approved', {
          applicationId: app.id,
          vendorId: newVendor.id,
          userId: supabaseUserId,
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
          options: {
            redirectTo: `${vendorPortalUrl}/onboarding?item=${VendorOnboardingStepName.food_business_registration}`,
          },
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
        options: {
          redirectTo: `${vendorPortalUrl}/onboarding?item=${VendorOnboardingStepName.food_business_registration}`,
        },
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
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`email timed out after 10s`)), 10_000);
        this.email
          .send({ to, subject: tmpl.subject, html: tmpl.html })
          .then(() => {
            clearTimeout(timer);
            resolve();
          })
          .catch((error: unknown) => {
            clearTimeout(timer);
            reject(error);
          });
      });
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
    const where: Prisma.VendorWhereInput = dto.includeTestData
      ? {}
      : { isSeedData: false, user: { isTestData: false } };
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
        user: { select: { firstName: true, lastName: true, email: true, isTestData: true } },
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
        isTestData: v.isSeedData || v.user.isTestData,
        testDataProvenance: [
          ...(v.isSeedData ? ['Vendor seed data'] : []),
          ...(v.user.isTestData ? ['Vendor owner test data'] : []),
        ],
        documentStatusByType,
      };
    });
    const nextCursor =
      rows.length === limit
        ? this.encodeVendorCursor({
            createdAt: rows[rows.length - 1]!.createdAt,
            id: rows[rows.length - 1]!.id,
          })
        : null;
    return { data, nextCursor };
  }

  /**
   * Per-status counters for the admin Vendor Applications page tab strip.
   * Returns every VendorApplicationStatus key (even when zero) plus an `all`
   * total so the UI can render stable count pills without nullish checks.
   */
  async getVendorApplicationCounts(
    includeTestData = false,
  ): Promise<Record<VendorApplicationStatus | 'all', number>> {
    const grouped = await this.prisma.vendorApplication.groupBy({
      where: {
        submittedAt: { not: null },
        ...(includeTestData ? {} : { isTestData: false }),
      },
      by: ['status'],
      _count: { _all: true },
    });
    const out: Record<VendorApplicationStatus | 'all', number> = {
      pending: 0,
      under_review: 0,
      information_requested: 0,
      approved: 0,
      rejected: 0,
      all: 0,
    };
    for (const row of grouped) {
      out[row.status] = row._count._all;
      out.all += row._count._all;
    }
    return out;
  }

  /**
   * Lifecycle-state counters for the admin Vendors page tab strip.
   * Returns every VendorStatus key (even when zero) so the UI can render a
   * stable set of pills without nullish checks, plus an `all` total.
   */
  async getVendorStatusCounts(
    includeTestData = false,
  ): Promise<Record<VendorStatus | 'all', number>> {
    const grouped = await this.prisma.vendor.groupBy({
      by: ['status'],
      where: includeTestData ? {} : { isSeedData: false, user: { isTestData: false } },
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
    return Buffer.from(JSON.stringify({ createdAt: c.createdAt.toISOString(), id: c.id })).toString(
      'base64url',
    );
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
   * Reconcile a payout on two independent axes; read-only, never mutates.
   *
   * 1. STRIPE: pull the Stripe transfer and report any pence-level
   *    discrepancy between Stripe's recorded amount and our DB.
   * 2. LEDGER: recompute every stored component from source-of-truth rows -
   *    gross/commission/net from the period's delivered orders (using each
   *    order's STORED vendorPayoutPence, which excludes the platform service
   *    fee) and refunds by netting refund rows against Feastpot-absorbed
   *    credit rows - and diff against what the batch persisted.
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

    const ledger = await this.reconcilePayoutLedger(payout);

    if (!payout.stripeTransferId) {
      return {
        payoutId,
        stripeTransferId: null,
        ourAmountPence: payout.amountPence,
        stripeAmountPence: null,
        discrepancyPence: null,
        status: 'no_transfer' as const,
        ledger,
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
        status:
          payout.amountPence === stripeAmountPence ? ('match' as const) : ('mismatch' as const),
        ledger,
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
        ledger,
      };
    }
  }

  /**
   * Recompute a payout's components from the same source rows the weekly
   * batch reads (delivered orders in [periodStart, periodEnd) + payment
   * refund/credit netting) and diff them against the stored payout. Any
   * non-zero delta means either the underlying orders/payments changed after
   * the batch ran (late refund, order edit) or a batch bug - both worth a
   * finance look. Per-order payouts (orderId set, no period) skip the check.
   */
  private async reconcilePayoutLedger(payout: {
    vendorId: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    grossPence: number;
    commissionPence: number;
    refundsPence: number;
    amountPence: number;
    orderCount: number;
  }) {
    if (!payout.periodStart || !payout.periodEnd) {
      return { status: 'not_applicable' as const };
    }
    const orders = await this.prisma.order.findMany({
      where: {
        vendorId: payout.vendorId,
        status: {
          in: [OrderStatus.delivered, OrderStatus.partially_refunded, OrderStatus.refunded],
        },
        deliveredAt: { gte: payout.periodStart, lt: payout.periodEnd },
      },
      select: { id: true, totalPence: true, vendorPayoutPence: true, commissionPence: true },
    });
    const orderIds = orders.map((o) => o.id);
    const [refundRows, creditRows] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          orderId: { in: orderIds },
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
        },
        _sum: { amountPence: true },
      }),
      this.prisma.payment.aggregate({
        where: { orderId: { in: orderIds }, type: PaymentType.credit },
        _sum: { amountPence: true },
      }),
    ]);

    const expectedGrossPence = orders.reduce((s, o) => s + o.totalPence, 0);
    const expectedCommissionPence = orders.reduce((s, o) => s + o.commissionPence, 0);
    // Vendor clawback = customer refunds (negative rows) net of the
    // Feastpot-absorbed credit rows - mirrors aggregateVendorBatch exactly.
    const expectedRefundsPence = Math.max(
      0,
      -(refundRows._sum.amountPence ?? 0) - (creditRows._sum.amountPence ?? 0),
    );
    // Zero-floor exactly like aggregateVendorBatch: a high-refund period
    // stores netPence = 0, never negative - mirror that or we'd report false
    // mismatches on such payouts.
    const expectedNetPence = Math.max(
      0,
      orders.reduce((s, o) => s + o.vendorPayoutPence, 0) - expectedRefundsPence,
    );

    const deltas = {
      grossDeltaPence: payout.grossPence - expectedGrossPence,
      commissionDeltaPence: payout.commissionPence - expectedCommissionPence,
      refundsDeltaPence: payout.refundsPence - expectedRefundsPence,
      netDeltaPence: payout.amountPence - expectedNetPence,
      orderCountDelta: payout.orderCount - orders.length,
    };
    const clean = Object.values(deltas).every((d) => d === 0);
    return {
      status: clean ? ('match' as const) : ('mismatch' as const),
      expected: {
        grossPence: expectedGrossPence,
        commissionPence: expectedCommissionPence,
        refundsPence: expectedRefundsPence,
        netPence: expectedNetPence,
        orderCount: orders.length,
      },
      ...deltas,
    };
  }

  /**
   * Creates deliberately marked fixtures used by production smoke tests. The
   * password is returned exactly once and is never written to Prisma.
   */
  async createTestVendorPersonas(confirmation: string, actorId: string) {
    const phrase = 'CREATE PRODUCTION TEST VENDORS';
    if (confirmation !== phrase) {
      throw new BadRequestException({
        code: 'TEST_PERSONA_CONFIRMATION_REQUIRED',
        message: `confirmation must exactly equal "${phrase}"`,
      });
    }

    const specs = [
      {
        key: 'nigerian-live',
        email: 'test-vendor-nigerian@feastpot.test',
        slug: 'test-nigerian-kitchen',
      },
      {
        key: 'caribbean-live',
        email: 'test-vendor-caribbean@feastpot.test',
        slug: 'test-caribbean-kitchen',
      },
      {
        key: 'applicant-under-review',
        email: 'test-vendor-applicant@feastpot.test',
        slug: 'test-applicant-kitchen',
      },
      {
        key: 'cape-verdean-live',
        email: 'test-vendor-cape-verdean@feastpot.test',
        slug: 'test-cape-verdean-kitchen',
      },
    ] as const;
    const createdAuth: string[] = [];
    const personas: Array<{
      key: string;
      email: string;
      slug: string;
      userId: string;
      password: string;
    }> = [];
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-test-vendor-personas-v1'))`;
          const existing = await tx.user.findMany({
            where: { email: { in: specs.map((s) => s.email) } },
            select: { email: true },
          });
          const existingSlugs = await tx.vendor.findMany({
            where: { slug: { in: specs.map((s) => s.slug) } },
            select: { slug: true },
          });
          const existingApplications = await tx.vendorApplication.findMany({
            where: { email: { in: specs.map((s) => s.email) } },
            select: { email: true },
          });
          if (existing.length || existingSlugs.length || existingApplications.length) {
            throw new ConflictException({
              code: 'TEST_PERSONAS_ALREADY_EXIST',
              message: 'One or more deterministic test persona emails or slugs already exists',
              emails: [
                ...existing.map((u) => u.email),
                ...existingApplications.map((a) => a.email),
              ],
              slugs: existingSlugs.map((v) => v.slug),
            });
          }
          const currentTerms = await tx.termsVersion.findFirst({
            where: { documentType: 'VENDOR_TERMS', effectiveAt: { lte: new Date() } },
            orderBy: { effectiveAt: 'desc' },
          });
          if (!currentTerms)
            throw new BadRequestException({
              code: 'CURRENT_VENDOR_TERMS_REQUIRED',
              message: 'Current VENDOR_TERMS is required',
            });
          const reserved = new Set<string>(specs.map((s) => s.email));
          for (let page = 1; ; page++) {
            const listed = await this.supabase
              .getClient()
              .auth.admin.listUsers({ page, perPage: 1000 });
            if (listed.error)
              throw new InternalServerErrorException({
                code: 'TEST_PERSONA_ORPHAN_SCAN_FAILED',
                message: `Could not inspect reserved Auth users: ${listed.error.message}`,
              });
            const users = listed.data?.users ?? [];
            for (const user of users.filter(
              (u) => u.email && reserved.has(u.email.toLowerCase()),
            )) {
              const deleted = await this.supabase.getClient().auth.admin.deleteUser(user.id);
              if (deleted.error)
                throw new InternalServerErrorException({
                  code: 'TEST_PERSONA_ORPHAN_DELETE_FAILED',
                  message: `Could not remove an orphaned reserved Auth user; retry after cleanup: ${deleted.error.message}`,
                });
            }
            if (users.length < 1000) break;
          }
          for (const spec of specs) {
            const password = randomBytes(30).toString('base64url');
            const { data, error } = await this.supabase.getClient().auth.admin.createUser({
              email: spec.email,
              password,
              email_confirm: true,
              app_metadata: { role: 'vendor', testPersona: true },
              user_metadata: { role: 'vendor', testPersona: true, personaKey: spec.key },
            });
            if (error || !data.user?.id)
              throw new InternalServerErrorException({
                code: 'TEST_PERSONA_AUTH_CREATE_FAILED',
                message: error?.message ?? 'Supabase did not return a user',
              });
            createdAuth.push(data.user.id);
            personas.push({ ...spec, userId: data.user.id, password });
          }
          const now = new Date();
          const live = async (
            p: (typeof personas)[number],
            businessName: string,
            cuisines: string[],
            images: string[],
            withImport = false,
            cape = false,
          ) => {
            const user = await tx.user.create({
              data: {
                id: p.userId,
                email: p.email,
                firstName: 'Production',
                lastName: 'Test Vendor',
                role: UserRole.vendor,
                emailVerified: true,
                isTestData: true,
                provenance: 'admin-test-persona',
              },
            });
            const vendor = await tx.vendor.create({
              data: {
                userId: user.id,
                businessName,
                slug: p.slug,
                cuisines,
                status: VendorStatus.live,
                isSeedData: true,
                approvedAt: now,
                termsActivatedAt: now,
                complianceStatus: 'RATED',
                fsaHygieneRating: 4,
                fsaRegistrationNumber: 'ADMIN-TEST-FSA-0001',
                fsaRatingDate: now,
                stripeAccountId: `acct_admin_test_${p.key.replace(/[^a-z0-9]/g, '_')}`,
                payoutsEnabled: true,
                stripeChargesEnabled: true,
                stripePayoutsEnabled: true,
                stripeRequirementsCurrentlyDue: [],
                stripeRequirementsEventuallyDue: [],
                stripeRequirementsPastDue: [],
                stripeRequirementsPendingVerification: [],
                description: `Test persona for ${businessName}`,
                coverImageUrl: images[0],
                logoUrl: images[0],
                specialities: cuisines,
                ...(cape
                  ? { maxTraysPerDay: 80, eventCateringManualQuote: true, largeOrderLeadHours: 48 }
                  : {}),
              },
            });
            await tx.vendorDocument.createMany({
              data: (['insurance', 'hygiene_cert', 'photo_id'] as const).map((type) => ({
                vendorId: vendor.id,
                type,
                status: 'verified' as const,
                fileUrl: `https://fixtures.feastpot.test/admin-test-persona/${p.key}/${type}.pdf`,
                fileName: `admin-test-persona-${type}.pdf`,
                reviewedBy: actorId,
                reviewedAt: now,
              })),
            });
            await tx.vendorTaxProfile.create({
              data: {
                vendorId: vendor.id,
                entityType: 'SOLE_TRADER',
                legalName: `Admin Test Persona ${p.key}`,
                tradingName: businessName,
                addressLine1: 'Synthetic test address',
                city: 'London',
                postcode: 'ZZ1 1ZZ',
                country: 'GB',
                taxIdentifier: `TEST-${p.key.toUpperCase()}`,
                taxIdCountry: 'GB',
                dateOfBirth: new Date('1980-01-01T00:00:00.000Z'),
                financialAccountId: `fa_admin_test_${p.key.replace(/[^a-z0-9]/g, '_')}`,
                verificationStatus: 'VERIFIED',
                verificationMethod: 'admin-test-persona',
                verifiedAt: now,
                lastReviewedAt: now,
              },
            });
            await tx.vendorRequiredOnboardingItem.createMany({
              data: Object.values(VendorOnboardingStepName).map((name) => ({
                vendorId: vendor.id,
                name,
                state: 'supplied' as const,
                suppliedAt: now,
              })),
              skipDuplicates: true,
            });
            const menu = await tx.menu.create({
              data: { vendorId: vendor.id, name: 'Production test menu', isActive: true },
            });
            const itemNames = cape
              ? ['Cachupa', 'Pastéis de milho']
              : cuisines[0] === 'Caribbean'
                ? ['Jerk chicken', 'Rice and peas']
                : ['Jollof rice', 'Egusi soup'];
            const items = await Promise.all(
              itemNames.map((name, i) =>
                tx.menuItem.create({
                  data: {
                    vendorId: vendor.id,
                    menuId: menu.id,
                    name,
                    category: 'Mains',
                    pricePence: 1200 + i * 300,
                    imageUrls: [images[i % images.length]],
                    allergens: [],
                    tags: ['test-persona'],
                    isAvailable: true,
                    moderationStatus: 'approved',
                    submittedAt: now,
                    decidedAt: now,
                    allergensFreeFrom: true,
                  },
                }),
              ),
            );
            let applicationId: string;
            const app = await tx.vendorApplication.create({
              data: {
                fullName: 'Production Test Vendor',
                kitchenName: businessName,
                email: p.email,
                phone: '+440000000000',
                postcode: 'SE15 4ST',
                cuisineType: cuisines[0],
                cuisineTypes: cuisines,
                kitchenType: 'commercial',
                hasFsaRegistration: true,
                foodStory: 'Admin-created production test persona.',
                status: VendorApplicationStatus.approved,
                submittedAt: now,
                reviewedAt: now,
                vendorId: vendor.id,
                isTestData: true,
              },
            });
            applicationId = app.id;
            await tx.termsAcceptance.create({
              data: {
                vendorId: vendor.id,
                termsVersionId: currentTerms.id,
                ipAddress: '127.0.0.1',
                userAgent: 'Feastpot admin test persona generator',
                acceptanceText: `I accept the currently effective vendor terms (${currentTerms.version}) [admin-test-persona]`,
                contentHash: currentTerms.contentHash,
                scrolledToEnd: true,
                method: 'CLICKWRAP',
              },
            });
            await tx.vendorVerification.create({
              data: {
                vendorId: vendor.id,
                registrationNumber: 'ADMIN-TEST-FSA-0001',
                registrationAuthority: 'Synthetic Food Standards Agency fixture',
                registrationConfirmedAt: now,
                fhrsRating: 4,
                fhrsRatingCheckedAt: now,
                fhrsInspectionStatus: 'RATED',
                insuranceProvider: 'Synthetic test insurer',
                insuranceCoverPence: 500000000,
                insuranceValidUntil: new Date(now.getTime() + 365 * 86400000),
                allergenTrainingHeld: true,
                allergenTrainingUntil: new Date(now.getTime() + 365 * 86400000),
                idVerifiedAt: now,
                overallState: 'VERIFIED',
              },
            });
            if (withImport) {
              await tx.menuImport.create({
                data: {
                  vendorId: vendor.id,
                  status: 'applied',
                  sourceFiles: [
                    {
                      kind: 'instagram-screenshot',
                      label: 'Synthetic Instagram menu reference (no API access)',
                      source: 'admin-test-persona',
                    },
                    {
                      kind: 'whatsapp-export',
                      label: 'Synthetic WhatsApp menu reference (no API access)',
                      source: 'admin-test-persona',
                    },
                  ],
                  items: {
                    create: items.map((item) => ({
                      menuItemId: item.id,
                      name: item.name,
                      pricePence: item.pricePence,
                      status: 'applied',
                      allergens: [],
                      allergensFreeFrom: true,
                      allergenConfirmedAt: now,
                    })),
                  },
                },
              });
            }
            if (cape) {
              const enquiry = await tx.cateringEnquiry.create({
                data: {
                  occasionType: 'Corporate event',
                  guestCountBand: '50-100',
                  postcode: 'SE15 4ST',
                  outwardCode: 'SE15',
                  contactName: 'Production Test Customer',
                  email: 'test-catering-customer@feastpot.test',
                  status: 'ASSIGNED',
                  source: 'admin-test-persona',
                  isTestData: true,
                  provenance: 'admin-test-persona',
                  eventDate: '2035-06-15',
                  preferredTime: '12:00-14:00',
                  notes: 'Synthetic admin-test-persona request.',
                },
              });
              await tx.vendorCapacity.create({
                data: {
                  vendorId: vendor.id,
                  serviceDate: new Date(Date.now() + 30 * 86400000),
                  capacityType: 'event_catering',
                  totalSlots: 80,
                },
              });
              await tx.cateringBooking.create({
                data: {
                  enquiryId: enquiry.id,
                  vendorId: vendor.id,
                  customerEmail: enquiry.email,
                  customerName: enquiry.contactName,
                  eventDate: new Date('2035-06-15T12:00:00Z'),
                  preferredTime: '12:00-14:00',
                  eventAddress: 'Synthetic event address, SE15 4ST',
                  guestCount: 60,
                  totalPence: 0,
                  depositPence: 0,
                  balancePence: 0,
                  commissionPercent: 0,
                  commissionPence: 0,
                  status: 'ASSIGNED',
                  quoteExpiresAt: new Date(Date.now() + 86400000),
                  assignNote: 'admin-test-persona received request; no quote issued',
                },
              });
            }
            return {
              key: p.key,
              email: p.email,
              password: p.password,
              vendorId: vendor.id,
              applicationId,
              summary: `${businessName} live test persona`,
            };
          };
          const nigerian = await live(
            personas[0],
            'Test Lagos Kitchen',
            ['Nigerian'],
            ['https://images.unsplash.com/photo-1604329760661-e71dc83f8f26'],
          );
          const caribbean = await live(
            personas[1],
            'Test Caribbean Kitchen',
            ['Caribbean'],
            ['https://images.unsplash.com/photo-1601050690597-df0568f70950'],
            true,
          );
          await tx.user.create({
            data: {
              id: personas[2].userId,
              email: personas[2].email,
              firstName: 'Production',
              lastName: 'Test Applicant',
              role: UserRole.vendor,
              emailVerified: true,
              isTestData: true,
              provenance: 'admin-test-persona',
            },
          });
          const applicant = await tx.vendorApplication.create({
            data: {
              fullName: 'Production Test Applicant',
              kitchenName: 'Test Applicant Kitchen',
              email: personas[2].email,
              phone: '+440000000001',
              postcode: 'M1 1AE',
              cuisineType: 'West African',
              cuisineTypes: ['West African'],
              kitchenType: 'home',
              hasFsaRegistration: false,
              foodStory: 'Awaiting FSA registration and hygiene rating.',
              status: VendorApplicationStatus.under_review,
              submittedAt: now,
              isTestData: true,
            },
          });
          const cape = await live(
            personas[3],
            'Test Cape Verde Kitchen',
            ['Cape Verdean'],
            ['https://images.unsplash.com/photo-1547592180-85f173990554'],
            false,
            true,
          );
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'admin.test_personas.vendors_created',
              entityType: 'vendor_personas',
              entityId: applicant.id,
              metadata: { personaKeys: personas.map((p) => p.key) } as Prisma.JsonObject,
            },
          });
          return [
            nigerian,
            caribbean,
            {
              key: personas[2].key,
              email: personas[2].email,
              password: personas[2].password,
              applicationId: applicant.id,
              summary: 'Applicant under review; awaiting FSA registration and hygiene rating',
            },
            cape,
          ];
        },
        { maxWait: 10_000, timeout: 120_000 },
      );
      return { personas: result };
    } catch (error) {
      const cleanup = await Promise.allSettled(
        createdAuth.map((id) => this.supabase.getClient().auth.admin.deleteUser(id)),
      );
      cleanup.forEach((outcome) => {
        if (outcome.status === 'rejected' || outcome.value?.error) {
          this.logger.error(
            `Failed to clean up test persona auth user: ${outcome.status === 'rejected' ? String(outcome.reason) : outcome.value.error?.message}`,
          );
        }
      });
      throw error;
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

// Ensures DisputeStatus import lint isn't dropped if we later add dispute helpers.
export const _DISPUTE_STATUSES: DisputeStatus[] = Object.values(DisputeStatus);
