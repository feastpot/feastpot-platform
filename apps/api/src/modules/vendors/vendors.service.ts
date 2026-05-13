import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, UserRole, VendorStatus } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

import { CreateVendorDto } from './dto/create-vendor.dto';
import { CursorPaginationDto } from './dto/pagination.dto';
import { SearchVendorsDto } from './dto/search-vendors.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpsertDeliveryConfigDto } from './dto/upsert-delivery-config.dto';
import {
  HourlyOrdersBucketDto,
  StripeConnectLinkResponseDto,
  TopDishDto,
  VendorAnalyticsResponseDto,
  WeeklyRevenueBucketDto,
} from './dto/vendor-analytics.dto';
import { VendorStatsResponseDto } from './dto/vendor-stats.dto';
import { VendorRepository, type DecodedCursor, type SearchedVendorRow } from './vendors.repository';

const REVENUE_STATUSES_LIST: OrderStatus[] = [
  OrderStatus.accepted,
  OrderStatus.preparing,
  OrderStatus.dispatched,
  OrderStatus.delivered,
];

function utcWeekStart(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

function encodeCursor(row: SearchedVendorRow): string {
  const payload: DecodedCursor = {
    rating: row.rating,
    ratingCount: row.rating_count,
    distance: row.distance_km,
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(s: string | undefined): DecodedCursor | null {
  if (!s) return null;
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8');
    const obj = JSON.parse(json) as Partial<DecodedCursor>;
    if (
      typeof obj.rating !== 'number' ||
      typeof obj.ratingCount !== 'number' ||
      typeof obj.id !== 'string'
    ) {
      return null;
    }
    return {
      rating: obj.rating,
      ratingCount: obj.ratingCount,
      distance: typeof obj.distance === 'number' ? obj.distance : null,
      id: obj.id,
    };
  } catch {
    return null;
  }
}

/**
 * Allowed status transitions and which roles may perform each, per the
 * security spec (Step 5):
 *   approved      → compliance or admin (compliance signs off the docs;
 *                    admin can override).
 *   live          → admin only (post-menu-review go-live decision).
 *   suspended     → admin or compliance (either can pull a vendor offline).
 *   probation     → admin only.
 *   removed       → admin only.
 */
const TRANSITIONS: Record<VendorStatus, Partial<Record<VendorStatus, UserRole[]>>> = {
  pending: {
    approved: [UserRole.compliance, UserRole.admin],
    removed: [UserRole.admin],
  },
  approved: {
    live: [UserRole.admin],
    removed: [UserRole.admin],
  },
  live: {
    suspended: [UserRole.admin, UserRole.compliance],
    removed: [UserRole.admin],
  },
  suspended: {
    probation: [UserRole.admin],
    removed: [UserRole.admin],
  },
  probation: {
    live: [UserRole.admin],
    removed: [UserRole.admin],
  },
  removed: {},
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly repo: VendorRepository,
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------
  // Analytics, delivery-config and Stripe Connect — all gated to the
  // authenticated vendor's own profile via VendorRepository.findByUserId.
  // None of these expose a vendorId path param; the vendor is always
  // resolved from the JWT, which prevents IDOR-style cross-vendor reads.
  // ------------------------------------------------------------------

  async getMyAnalytics(userId: string): Promise<VendorAnalyticsResponseDto> {
    const vendor = await this.repo.findByUserId(userId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile' });
    }
    const vendorId = vendor.id;

    const now = new Date();
    const thisWeekStart = utcWeekStart(now);
    // 8-week window starts at the Monday 7 weeks before this one (inclusive).
    const eightWeekStart = new Date(thisWeekStart);
    eightWeekStart.setUTCDate(eightWeekStart.getUTCDate() - 7 * 7);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Three independent reads run in parallel.
    const [weeklyOrders, hourlyOrders, topItems, aov] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          vendorId,
          status: { in: REVENUE_STATUSES_LIST },
          createdAt: { gte: eightWeekStart },
        },
        select: { totalPence: true, vendorPayoutPence: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { vendorId, createdAt: { gte: ninetyDaysAgo } },
        select: { createdAt: true },
      }),
      // Top dishes: aggregate orderItems for revenue-counting orders in last 90d.
      this.prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: {
            vendorId,
            status: { in: REVENUE_STATUSES_LIST },
            createdAt: { gte: ninetyDaysAgo },
          },
        },
        _sum: { quantity: true, totalPence: true },
        _count: { _all: true },
        orderBy: { _sum: { totalPence: 'desc' } },
        take: 10,
      }),
      this.prisma.order.aggregate({
        where: {
          vendorId,
          status: { in: REVENUE_STATUSES_LIST },
          createdAt: { gte: ninetyDaysAgo },
        },
        _avg: { totalPence: true },
      }),
    ]);

    // Bucket weekly orders into 8 ISO-week slots (oldest→newest).
    const weeklyMap = new Map<string, WeeklyRevenueBucketDto>();
    for (let i = 0; i < 8; i += 1) {
      const ws = new Date(eightWeekStart);
      ws.setUTCDate(ws.getUTCDate() + i * 7);
      weeklyMap.set(ws.toISOString(), { weekStart: ws.toISOString(), ordersCount: 0, revenuePence: 0 });
    }
    for (const o of weeklyOrders) {
      const key = utcWeekStart(o.createdAt).toISOString();
      const bucket = weeklyMap.get(key);
      if (!bucket) continue;
      bucket.ordersCount += 1;
      // Use vendor payout (net of commission) so the vendor sees what they earned.
      bucket.revenuePence += o.vendorPayoutPence;
    }
    const weeklyRevenue = Array.from(weeklyMap.values());

    // Bucket hourly into 24 slots.
    const hourly: HourlyOrdersBucketDto[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      ordersCount: 0,
    }));
    for (const o of hourlyOrders) hourly[o.createdAt.getUTCHours()]!.ordersCount += 1;

    // Resolve menu item names for the top dishes (single batched read).
    const itemIds = topItems.map((t) => t.menuItemId).filter((x): x is string => !!x);
    const items = itemIds.length
      ? await this.prisma.menuItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(items.map((i) => [i.id, i.name]));
    const topDishes: TopDishDto[] = topItems
      .filter((t): t is typeof t & { menuItemId: string } => !!t.menuItemId)
      .map((t) => ({
        menuItemId: t.menuItemId,
        name: nameById.get(t.menuItemId) ?? 'Deleted item',
        ordersCount: t._count._all,
        unitsSold: t._sum.quantity ?? 0,
        revenuePence: t._sum.totalPence ?? 0,
      }));

    return {
      weeklyRevenue,
      topDishes,
      hourlyDistribution: hourly,
      averageOrderValuePence: Math.round(aov._avg.totalPence ?? 0),
      reorderRatePct: vendor.reorderRatePct,
    };
  }

  async getMyDeliveryConfig(userId: string) {
    const vendor = await this.repo.findByUserId(userId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile' });
    }
    return this.prisma.deliveryConfig.findUnique({ where: { vendorId: vendor.id } });
  }

  async upsertMyDeliveryConfig(userId: string, dto: UpsertDeliveryConfigDto) {
    const vendor = await this.repo.findByUserId(userId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile' });
    }
    return this.prisma.deliveryConfig.upsert({
      where: { vendorId: vendor.id },
      create: {
        vendorId: vendor.id,
        types: dto.types,
        localRadiusMiles: dto.localRadiusMiles ?? 5,
        localFeePence: dto.localFeePence ?? 0,
        collectionAddress: dto.collectionAddress ?? null,
        nationwideEnabled: dto.nationwideEnabled ?? false,
        nationwideFeePence: dto.nationwideFeePence ?? 0,
        minOrderPence: dto.minOrderPence ?? 0,
        freeDeliveryOverPence: dto.freeDeliveryOverPence ?? null,
        postcodes: dto.postcodes ?? [],
      },
      update: {
        types: dto.types,
        ...(dto.localRadiusMiles !== undefined ? { localRadiusMiles: dto.localRadiusMiles } : {}),
        ...(dto.localFeePence !== undefined ? { localFeePence: dto.localFeePence } : {}),
        ...(dto.collectionAddress !== undefined ? { collectionAddress: dto.collectionAddress } : {}),
        ...(dto.nationwideEnabled !== undefined ? { nationwideEnabled: dto.nationwideEnabled } : {}),
        ...(dto.nationwideFeePence !== undefined ? { nationwideFeePence: dto.nationwideFeePence } : {}),
        ...(dto.minOrderPence !== undefined ? { minOrderPence: dto.minOrderPence } : {}),
        ...(dto.freeDeliveryOverPence !== undefined
          ? { freeDeliveryOverPence: dto.freeDeliveryOverPence }
          : {}),
        ...(dto.postcodes !== undefined ? { postcodes: dto.postcodes } : {}),
      },
    });
  }

  /**
   * Lazy-create a Stripe Express account for this vendor (idempotent: if one
   * already exists on the Vendor row, we just refresh the onboarding link).
   * Returns the hosted onboarding URL.
   *
   * Failure modes:
   *   - STRIPE_SECRET_KEY missing → throws BadRequestException so the UI can
   *     show a friendly "payouts not configured" message instead of 500.
   *   - Stripe API errors → bubbled as BadRequestException with the original
   *     message (no retry; the vendor can re-click the button).
   */
  async createStripeConnectLink(userId: string): Promise<StripeConnectLinkResponseDto> {
    const vendor = await this.repo.findByUserId(userId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile' });
    }
    if (!this.config.get<string>('STRIPE_SECRET_KEY')) {
      throw new BadRequestException({
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe is not configured on this environment yet',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      throw new BadRequestException({ code: 'USER_EMAIL_MISSING', message: 'User has no email on file' });
    }

    let accountId = vendor.stripeAccountId;
    if (!accountId) {
      try {
        const account = await this.stripe.createConnectAccount({
          email: user.email,
          vendorId: vendor.id,
        });
        accountId = account.id;
        await this.prisma.vendor.update({
          where: { id: vendor.id },
          data: { stripeAccountId: accountId },
        });
      } catch (e) {
        throw new BadRequestException({
          code: 'STRIPE_ACCOUNT_CREATE_FAILED',
          message: (e as Error).message,
        });
      }
    } else {
      // Pragmatic Stripe sync: every time the vendor opens the onboarding
      // link we re-read the account state from Stripe and persist
      // payoutsEnabled. This covers the "user finished onboarding and came
      // back" path without needing the full account.updated webhook (which
      // is still the right long-term solution but is out of scope here —
      // tracked in the summary).
      try {
        const account = await this.stripe.retrieveAccount(accountId);
        const enabled =
          (account.payouts_enabled ?? false) && (account.charges_enabled ?? false);
        if (enabled !== vendor.payoutsEnabled) {
          await this.prisma.vendor.update({
            where: { id: vendor.id },
            data: { payoutsEnabled: enabled },
          });
        }
      } catch {
        // Non-fatal — surface the onboarding URL even if status sync fails.
      }
    }

    // Use the vendor portal URL the request came from. We can't rely on the
    // Origin header here (this runs server-side); fall back to a configured
    // env var, then a sensible localhost default for dev.
    const portalBase =
      this.config.get<string>('VENDOR_PORTAL_URL') ?? 'http://localhost:3002';
    try {
      const link = await this.stripe.createOnboardingLink({
        accountId,
        refreshUrl: `${portalBase}/onboarding?stripe=refresh`,
        returnUrl: `${portalBase}/onboarding?stripe=return`,
      });
      return { url: link.url, accountId };
    } catch (e) {
      throw new BadRequestException({
        code: 'STRIPE_LINK_FAILED',
        message: (e as Error).message,
      });
    }
  }

  /**
   * Aggregated stats for the vendor's dashboard. Three Prisma queries run in
   * parallel: today's bucket, this week's bucket, and a pending-now count.
   *
   * "Today" and "this week" are computed from server-local UTC midnight /
   * Monday respectively — close enough for a vendor dashboard, and avoids
   * needing the vendor's TZ. We intentionally exclude cancelled/refunded
   * orders from revenue (a refunded order has zero net revenue for the
   * vendor) by filtering on a positive-status whitelist.
   */
  async getMyStats(userId: string): Promise<VendorStatsResponseDto> {
    const vendor = await this.repo.findByUserId(userId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile for this user' });
    }
    const vendorId = vendor.id;

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // ISO week starts Monday. getUTCDay(): Sun=0..Sat=6 → shift to Mon=0..Sun=6.
    const dow = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(todayStart.getTime() - dow * 24 * 60 * 60 * 1000);

    const REVENUE_STATUSES = [
      OrderStatus.accepted,
      OrderStatus.preparing,
      OrderStatus.dispatched,
      OrderStatus.delivered,
    ];

    const [todayAgg, weekAgg, pendingNow] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          vendorId,
          createdAt: { gte: todayStart },
          status: { in: REVENUE_STATUSES },
        },
        _count: { _all: true },
        _sum: { totalPence: true },
      }),
      this.prisma.order.aggregate({
        where: {
          vendorId,
          createdAt: { gte: weekStart },
          status: { in: REVENUE_STATUSES },
        },
        _count: { _all: true },
        _sum: { totalPence: true },
      }),
      this.prisma.order.count({
        where: { vendorId, status: OrderStatus.pending },
      }),
    ]);

    return {
      today: {
        orders: todayAgg._count._all,
        revenuePence: todayAgg._sum.totalPence ?? 0,
      },
      week: {
        orders: weekAgg._count._all,
        revenuePence: weekAgg._sum.totalPence ?? 0,
      },
      pendingNow,
    };
  }

  async search(dto: SearchVendorsDto) {
    const limit = dto.limit ?? 20;
    const cursor = decodeCursor(dto.cursor);
    const rows = await this.repo.search(dto, cursor);
    const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1]!) : null;

    // FR-SRCH-001: log every free-text search anonymously. Fire-and-forget —
    // logging must never slow down the response or fail the request. Only
    // log when the user actually typed something (avoids polluting the
    // analytics table with empty pass-throughs from the cuisine carousel).
    const q = dto.q?.trim();
    if (q && q.length > 0) {
      void this.prisma.searchLog
        .create({
          data: {
            query: q.slice(0, 200),
            postcode: dto.postcode?.slice(0, 10) ?? null,
            resultsCount: rows.length,
          },
        })
        .catch(() => {
          /* analytics is non-critical — swallow */
        });
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        businessName: r.business_name,
        slug: r.slug,
        description: r.description,
        cuisines: r.cuisines,
        status: r.status,
        rating: r.rating,
        ratingCount: r.rating_count,
        createdAt: r.created_at,
        distanceKm: r.distance_km,
        // Empty array (not null) so the client can `.length` without a guard.
        matchedDishes: r.matched_dishes ?? [],
      })),
      nextCursor,
    };
  }

  async findById(id: string) {
    const vendor = await this.repo.findById(id);
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    return vendor;
  }

  /**
   * Slug → public profile lookup. Used by the customer PWA which addresses
   * vendors by `/vendors/<slug>` rather than UUID. Two-hop (`findBySlug`
   * for the id, then `findById` for the full payload) so the response
   * shape stays identical to GET /v1/vendors/:id without us having to
   * duplicate the Prisma include tree across two repository methods.
   *
   * SECURITY: this is a public, unauthenticated route addressed by
   * human-readable slug, which is trivially guessable. We therefore return
   * 404 for anything not in `live` status — pending/suspended/draft vendor
   * profiles must NOT be enumerable from the customer-facing surface. Use
   * the UUID `:id` route (admin/vendor surfaces) for non-live access.
   */
  async findBySlug(slug: string) {
    const lite = await this.repo.findBySlug(slug);
    if (!lite || lite.status !== 'live') {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }
    return this.findById(lite.id);
  }

  async findMyVendor(userId: string) {
    const vendor = await this.repo.findByUserId(userId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile for this user' });
    }
    return vendor;
  }

  async create(user: AuthUser, dto: CreateVendorDto) {
    const existing = await this.repo.findByUserId(user.id);
    if (existing) {
      throw new ConflictException({
        code: 'VENDOR_EXISTS',
        message: 'A vendor profile already exists for this user',
      });
    }
    const baseSlug = slugify(dto.businessName) || `vendor-${user.id.slice(0, 8)}`;
    const slug = await this.uniqueSlug(baseSlug);
    return this.repo.create({
      user: { connect: { id: user.id } },
      businessName: dto.businessName,
      slug,
      description: dto.description ?? null,
      cuisines: dto.cuisineTypes,
      status: VendorStatus.pending,
    });
  }

  async update(vendorId: string, user: AuthUser, dto: UpdateVendorDto) {
    const vendor = await this.repo.findById(vendorId);
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    if (vendor.userId !== user.id && user.role !== UserRole.admin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot edit another vendor' });
    }

    const data: Record<string, unknown> = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.cuisineTypes !== undefined) data.cuisines = dto.cuisineTypes;

    const updated = Object.keys(data).length
      ? await this.repo.update(vendorId, data)
      : vendor;

    if (dto.minOrderPence !== undefined) {
      await this.repo.upsertDeliveryConfigMinOrder(vendorId, dto.minOrderPence);
    }
    return updated;
  }

  async updateStatus(vendorId: string, dto: UpdateVendorStatusDto, actor: AuthUser) {
    const vendor = await this.repo.findById(vendorId);
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });

    if (vendor.status === dto.status) {
      throw new BadRequestException({
        code: 'STATUS_UNCHANGED',
        message: `Vendor is already ${dto.status}`,
      });
    }

    const allowed = TRANSITIONS[vendor.status][dto.status];
    if (!allowed) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition vendor from ${vendor.status} to ${dto.status}`,
      });
    }
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_TRANSITION',
        message: `Role ${actor.role} cannot transition vendor from ${vendor.status} to ${dto.status}`,
      });
    }

    return this.repo.transitionStatus({
      vendorId,
      fromStatus: vendor.status,
      toStatus: dto.status,
      actorUserId: actor.id,
      reasonCode: dto.reasonCode,
      notes: dto.notes,
      orderCapWeekly: dto.orderCapWeekly,
    });
  }

  async getVendorReviews(vendorId: string, pagination: CursorPaginationDto) {
    const limit = pagination.limit ?? 20;
    const reviews = await this.repo.listPublishedReviews(vendorId, limit, pagination.cursor);
    const nextCursor = reviews.length === limit ? reviews[reviews.length - 1]!.id : null;
    return { data: reviews, nextCursor };
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    while (await this.repo.findBySlug(candidate)) {
      attempt += 1;
      candidate = `${base}-${attempt}`;
      if (attempt > 50) {
        throw new ConflictException({
          code: 'SLUG_CONFLICT',
          message: 'Could not generate unique vendor slug',
        });
      }
    }
    return candidate;
  }
}
