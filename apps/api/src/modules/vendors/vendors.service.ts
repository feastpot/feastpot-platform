import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, UserRole, VendorStatus } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

import { CreateVendorDto } from './dto/create-vendor.dto';
import { CursorPaginationDto } from './dto/pagination.dto';
import { SearchVendorsDto } from './dto/search-vendors.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorStatsResponseDto } from './dto/vendor-stats.dto';
import { VendorRepository, type DecodedCursor, type SearchedVendorRow } from './vendors.repository';

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
 * Allowed status transitions and which roles may perform each.
 */
const TRANSITIONS: Record<VendorStatus, Partial<Record<VendorStatus, UserRole[]>>> = {
  pending: {
    approved: [UserRole.compliance],
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
  ) {}

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
      })),
      nextCursor,
    };
  }

  async findById(id: string) {
    const vendor = await this.repo.findById(id);
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    return vendor;
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
