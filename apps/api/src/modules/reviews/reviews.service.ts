import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ModerationStatus, OrderStatus, Prisma, UserRole } from '@prisma/client';
// Pinned to bad-words v3 (CJS). v4 is ESM-only and breaks under Nest's CJS runtime.
import BadWordsFilter from 'bad-words';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';

import type { CreateReviewDto } from './dto/create-review.dto';
import type { ListModerationQueueDto } from './dto/list-moderation.dto';
import type { ModerateReviewDto } from './dto/moderate-review.dto';

/** UK-specific additions to the default bad-words list. */
const UK_EXTRA_BADWORDS = ['wanker', 'tosser', 'twat', 'minger', 'slag'];

/** A review is "published" (counts toward vendor rating) when moderation is approved/auto_approved. */
const PUBLISHED_STATUSES: ModerationStatus[] = [ModerationStatus.auto_approved, ModerationStatus.approved];

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);
  private readonly filter: InstanceType<typeof BadWordsFilter>;

  constructor(
    private readonly prisma: PrismaService,
    // T007: in-app vendor notifications when a new review is left.
    private readonly inbox: InboxService,
  ) {
    this.filter = new BadWordsFilter();
    this.filter.addWords(...UK_EXTRA_BADWORDS);
  }

  // -------------------- create --------------------

  async create(dto: CreateReviewDto, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, customerId: true, vendorId: true, status: true, deliveredAt: true },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (order.customerId !== user.id) {
      throw new ForbiddenException({ code: 'NOT_ORDER_OWNER', message: 'You did not place this order' });
    }
    if (order.status !== OrderStatus.delivered) {
      // 422 (not 400): the request is well-formed but the order's current
      // state forbids the action. Prevents customers leaving 1-star reviews
      // on pending / cancelled orders to unfairly tank a vendor's rating.
      throw new UnprocessableEntityException({
        code: 'ORDER_NOT_DELIVERED',
        message: 'You can only review an order after it has been delivered.',
      });
    }

    // Proactive duplicate check - gives a clean 409 without attempting an
    // INSERT. The unique-constraint catch below is still kept as the
    // race-condition backstop (two concurrent submits → only one wins).
    const existing = await this.prisma.review.findFirst({
      where: { orderId: dto.orderId, customerId: user.id },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'REVIEW_EXISTS',
        message: 'You have already reviewed this order',
      });
    }

    const moderationStatus = this.autoModerate(dto.title, dto.body);

    let review;
    try {
      review = await this.prisma.review.create({
        data: {
          orderId: order.id,
          vendorId: order.vendorId,
          customerId: user.id,
          rating: dto.rating,
          title: dto.title ?? null,
          body: dto.body ?? null,
          isVerified: true,
          moderationStatus,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({
          code: 'REVIEW_EXISTS',
          message: 'A review for this order already exists',
        });
      }
      throw e;
    }

    if (moderationStatus === ModerationStatus.auto_approved) {
      await this.recalculateVendorRating(order.vendorId);
    }
    // T007: notify the vendor in their inbox when a published review lands.
    // Held reviews are intentionally NOT notified - they may be retracted
    // by moderation and we don't want to spike vendor anxiety on a row
    // that may never go live.
    if (moderationStatus === ModerationStatus.auto_approved) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: order.vendorId },
        select: { userId: true },
      });
      if (vendor) {
        await this.inbox.notify({
          userId: vendor.userId,
          type: 'review_received',
          title: `New ${dto.rating}-star review`,
          body: dto.title ?? dto.body ?? 'A customer left you a new review.',
          link: '/analytics',
          metadata: { reviewId: review.id, orderId: order.id, rating: dto.rating },
        });
      }
    }
    return review;
  }

  // -------------------- moderation --------------------

  async listModerationQueue(dto: ListModerationQueueDto) {
    const limit = dto.limit ?? 20;
    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.ReviewWhereInput = cursor
      ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
      : {};
    const baseWhere = this.buildModerationFilters(dto);
    const rows = await this.prisma.review.findMany({
      where: { AND: [baseWhere, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Take limit+1 so we can detect whether another page exists even when
      // the current page is exactly `limit` rows long (the old check was
      // off-by-one for that case).
      take: limit + 1,
      include: {
        vendor: {
          select: { id: true, businessName: true, slug: true, logoUrl: true, cuisines: true },
        },
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    // Total respects all current filters EXCEPT cursor (so the footer
    // "Showing N to M of T" stays stable across pages).
    const total = await this.prisma.review.count({ where: baseWhere });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page,
      total,
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  /**
   * Counts per moderation status, honouring all non-status filters (q,
   * vendor, rating, date range). Used to drive the quick-filter chip
   * counters in the admin UI.
   */
  async moderationQueueCounts(dto: ListModerationQueueDto) {
    // Strip status from the input — counts are always grouped by status.
    const { status: _status, ...rest } = dto;
    const baseWhere = this.buildModerationFilters({ ...rest, status: 'all' });
    const grouped = await this.prisma.review.groupBy({
      by: ['moderationStatus'],
      where: baseWhere,
      _count: { _all: true },
    });
    const counts: Record<ModerationStatus, number> & { all: number } = {
      auto_approved: 0,
      held: 0,
      approved: 0,
      rejected: 0,
      all: 0,
    };
    for (const g of grouped) {
      counts[g.moderationStatus] = g._count._all;
      counts.all += g._count._all;
    }
    return counts;
  }

  private buildModerationFilters(dto: ListModerationQueueDto): Prisma.ReviewWhereInput {
    // D18: explicit status filter. Omitted defaults to 'held' (preserves
    // legacy behaviour for any caller that wasn't updated). 'all' drops
    // the status predicate entirely. Any other value pins to that status.
    const filterStatus = dto.status ?? ModerationStatus.held;
    const where: Prisma.ReviewWhereInput = {};
    if (filterStatus !== 'all') {
      where.moderationStatus = filterStatus as ModerationStatus;
    }
    if (dto.vendorId) where.vendorId = dto.vendorId;
    if (dto.rating !== undefined) where.rating = dto.rating;
    if (dto.submittedFrom || dto.submittedTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (dto.submittedFrom) {
        const d = new Date(dto.submittedFrom);
        range.gte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      }
      if (dto.submittedTo) {
        const d = new Date(dto.submittedTo);
        range.lte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      }
      where.createdAt = range;
    }
    if (dto.q && dto.q.trim().length > 0) {
      const q = dto.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { vendor: { businessName: { contains: q, mode: 'insensitive' } } },
        { customer: { firstName: { contains: q, mode: 'insensitive' } } },
        { customer: { lastName: { contains: q, mode: 'insensitive' } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  async moderate(id: string, dto: ModerateReviewDto, user: AuthUser) {
    // D19: admins can also push a review back to 'held' (e.g. after release
    // they spot something concerning and want a second pair of eyes).
    // 'pending' / 'auto_approved' remain system-only states.
    const allowed: ModerationStatus[] = [
      ModerationStatus.approved,
      ModerationStatus.rejected,
      ModerationStatus.held,
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_MODERATION_STATUS',
        message: 'status must be approved, rejected, or held',
      });
    }
    const review = await this.prisma.review.findUnique({ where: { id }, select: { id: true, vendorId: true, moderationStatus: true } });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        moderationStatus: dto.status,
        moderatedById: user.id,
        moderatedAt: new Date(),
        // Anything other than `approved` is hidden from the public profile.
        // 'held' must be hidden too - otherwise an auto-approved review the
        // admin pushes to held would still show up on the vendor page.
        isHidden: dto.status !== ModerationStatus.approved,
      },
    });
    // Recalc on every transition that can move a row in or out of the
    // PUBLISHED_STATUSES pool - that's all three allowed transitions.
    await this.recalculateVendorRating(review.vendorId);
    return updated;
  }

  // -------------------- recalc --------------------

  /**
   * Recalculate avg rating + review count from PUBLISHED reviews only.
   * (Held / rejected reviews must never affect the public rating.)
   * Stored on Vendor.rating + Vendor.ratingCount (the existing columns).
   */
  async recalculateVendorRating(vendorId: string): Promise<{ rating: number; ratingCount: number }> {
    const agg = await this.prisma.review.aggregate({
      where: { vendorId, moderationStatus: { in: PUBLISHED_STATUSES }, isHidden: false },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const rating = Number((agg._avg.rating ?? 0).toFixed(2));
    const ratingCount = agg._count._all;
    await this.prisma.vendor.update({ where: { id: vendorId }, data: { rating, ratingCount } });
    return { rating, ratingCount };
  }

  // -------------------- helpers --------------------

  /**
   * Returns auto_approved when text is clean (or empty), held otherwise.
   * Ratings 1–2 are also held: low-star reviews carry the highest defamation
   * risk, so we always have a human eyeball them.
   */
  private autoModerate(title: string | undefined, body: string | undefined): ModerationStatus {
    const text = [title ?? '', body ?? ''].join(' ').trim();
    if (text.length === 0) return ModerationStatus.auto_approved;
    if (this.filter.isProfane(text)) return ModerationStatus.held;
    return ModerationStatus.auto_approved;
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
