import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModerationStatus, OrderStatus, Prisma, UserRole } from '@prisma/client';
// Pinned to bad-words v3 (CJS). v4 is ESM-only and breaks under Nest's CJS runtime.
import BadWordsFilter from 'bad-words';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {
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
      throw new BadRequestException({
        code: 'ORDER_NOT_DELIVERED',
        message: 'You can only review delivered orders',
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
    return review;
  }

  // -------------------- moderation --------------------

  async listModerationQueue(dto: ListModerationQueueDto) {
    const limit = dto.limit ?? 20;
    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.ReviewWhereInput = cursor
      ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
      : {};
    const rows = await this.prisma.review.findMany({
      where: { AND: [{ moderationStatus: ModerationStatus.held }, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { vendor: { select: { id: true, businessName: true } } },
    });
    const nextCursor = rows.length === limit ? this.encodeCursor(rows[rows.length - 1]!) : null;
    return { data: rows, nextCursor };
  }

  async moderate(id: string, dto: ModerateReviewDto, user: AuthUser) {
    const allowed: ModerationStatus[] = [ModerationStatus.approved, ModerationStatus.rejected];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_MODERATION_STATUS',
        message: 'status must be approved or rejected',
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
        isHidden: dto.status === ModerationStatus.rejected,
      },
    });
    // Recalc on EITHER outcome:
    //  - approved: a previously-held review enters the published pool.
    //  - rejected: a previously-published review (auto_approved → rejected by
    //    a moderator who later disagreed) must leave the published pool. If we
    //    only recalc on `approved`, the vendor's rating stays inflated until
    //    the nightly badge cron runs.
    if (dto.status === ModerationStatus.approved || dto.status === ModerationStatus.rejected) {
      await this.recalculateVendorRating(review.vendorId);
    }
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
