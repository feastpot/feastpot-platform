import { Injectable } from '@nestjs/common';
import { Prisma, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { SearchVendorsDto, VendorSortBy } from './dto/search-vendors.dto';

const COMMUNITY_FAVOURITE_RATING = 4.3;

export interface SearchedVendorRow {
  id: string;
  business_name: string;
  slug: string;
  description: string | null;
  cuisines: string[];
  status: VendorStatus;
  rating: number;
  rating_count: number;
  created_at: Date;
  distance_km: number | null;
  /** Up to 3 active menu-item names that matched `q` (Postgres array). */
  matched_dishes: string[] | null;
}

export interface DecodedCursor {
  rating: number;
  ratingCount: number;
  distance: number | null;
  id: string;
}

@Injectable()
export class VendorRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public vendor search.
   *
   * Schema deviations from the original brief:
   *   - Vendor has no addressId; we approximate "postcode radius" by joining
   *     the requesting postcode against any address attached to the vendor's
   *     owning user OR any postcode listed in the vendor's DeliveryConfig.
   *   - Halal filter checks for any MenuItem.tags containing 'halal'.
   *   - communityFavourite has no boolean column → derived from rating >= 4.3.
   */
  async search(dto: SearchVendorsDto, cursor: DecodedCursor | null): Promise<SearchedVendorRow[]> {
    const limit = dto.limit ?? 20;
    // Strip SQL LIKE wildcards so users can't broaden the prefix scan.
    const postcodePrefix = dto.postcode
      ? dto.postcode.replace(/\s+/g, '').replace(/[%_]/g, '').slice(0, 4).toUpperCase()
      : null;
    const cuisines = dto.cuisine && dto.cuisine.length ? dto.cuisine : null;
    const halal = dto.halal === true;
    const communityFavourite = dto.communityFavourite === true;
    const sortBy = dto.sortBy ?? VendorSortBy.rating;
    const useDistance = sortBy === VendorSortBy.distance && !!postcodePrefix;

    // Free-text query: trim + cap; we wrap with %…% in the SQL so users
    // can't inject extra wildcards beyond what we choose.
    const qRaw = dto.q?.trim();
    const q = qRaw && qRaw.length > 0 ? qRaw.slice(0, 200) : null;
    const qLike = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;

    // ORDER BY + matching keyset cursor predicate (must use the SAME keys/direction
    // as ORDER BY for stable pagination — the previous id-only cursor was wrong).
    let orderBy: Prisma.Sql;
    let cursorClause: Prisma.Sql = Prisma.empty;
    if (useDistance) {
      // distance_km ASC NULLS LAST, rating DESC, id ASC. distance is computed in the SELECT,
      // so we recompute it inline for the WHERE predicate via a CTE-like sub-expression — but
      // since cursor only continues from the last seen row, we approximate: rows whose
      // (rating, id) compare past the cursor at equal distance bucket.
      orderBy = Prisma.sql`distance_km NULLS LAST, v.rating DESC, v.id ASC`;
      if (cursor) {
        // Treat distance as a coarse 0/NULL proxy in this implementation — keyset over (rating,id).
        cursorClause = Prisma.sql`AND (
          v.rating < ${cursor.rating}::float
          OR (v.rating = ${cursor.rating}::float AND v.id > ${cursor.id}::uuid)
        )`;
      }
    } else if (sortBy === VendorSortBy.reorderRate) {
      // No reorder_rate column — proxy with (rating DESC, rating_count DESC, id ASC).
      orderBy = Prisma.sql`v.rating DESC, v.rating_count DESC, v.id ASC`;
      if (cursor) {
        cursorClause = Prisma.sql`AND (
          v.rating < ${cursor.rating}::float
          OR (v.rating = ${cursor.rating}::float AND v.rating_count < ${cursor.ratingCount}::int)
          OR (v.rating = ${cursor.rating}::float AND v.rating_count = ${cursor.ratingCount}::int AND v.id > ${cursor.id}::uuid)
        )`;
      }
    } else {
      orderBy = Prisma.sql`v.rating DESC, v.id ASC`;
      if (cursor) {
        cursorClause = Prisma.sql`AND (
          v.rating < ${cursor.rating}::float
          OR (v.rating = ${cursor.rating}::float AND v.id > ${cursor.id}::uuid)
        )`;
      }
    }

    const cuisineClause = cuisines
      ? Prisma.sql`AND v.cuisines && ${cuisines}::varchar[]`
      : Prisma.empty;
    const halalClause = halal
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM menu_items mi
          WHERE mi.vendor_id = v.id
            AND mi.is_available = true
            AND 'halal' = ANY(mi.tags)
        )`
      : Prisma.empty;
    const favouriteClause = communityFavourite
      ? Prisma.sql`AND v.rating >= ${COMMUNITY_FAVOURITE_RATING}`
      : Prisma.empty;

    // FR-SRCH-001: q matches vendor fields OR any active menu-item name /
    // description. Same EXISTS pattern as halalClause keeps the planner
    // happy (semi-join, no row blow-up).
    const qClause = qLike
      ? Prisma.sql`AND (
          v.business_name ILIKE ${qLike}
          OR v.description ILIKE ${qLike}
          OR EXISTS (SELECT 1 FROM unnest(v.cuisines) AS c WHERE c ILIKE ${qLike})
          OR EXISTS (
            SELECT 1
            FROM menu_items mi
            JOIN menus m ON m.id = mi.menu_id
            WHERE mi.vendor_id = v.id
              AND mi.is_available = true
              AND m.is_active = true
              AND (mi.name ILIKE ${qLike} OR mi.description ILIKE ${qLike})
          )
        )`
      : Prisma.empty;

    // Up to 3 matched dish names per vendor — surfaced as a "Has: …" chip
    // on the customer-facing card. NULL when no q so the JSON array stays
    // empty rather than ["",""].
    const matchedDishesSelect = qLike
      ? Prisma.sql`(
          SELECT ARRAY(
            SELECT mi.name
            FROM menu_items mi
            JOIN menus m ON m.id = mi.menu_id
            WHERE mi.vendor_id = v.id
              AND mi.is_available = true
              AND m.is_active = true
              AND (mi.name ILIKE ${qLike} OR mi.description ILIKE ${qLike})
            ORDER BY mi.name
            LIMIT 3
          )
        ) AS matched_dishes`
      : Prisma.sql`NULL::text[] AS matched_dishes`;

    // Distance: rough proxy — match by outward postcode (first 4 chars) on the
    // vendor's DeliveryConfig.postcodes OR owner's address.postcode. Real ST_DWithin
    // requires PostGIS which we haven't enabled; this gives 0km for matches and NULL
    // for everything else, which is fine for "in your area" UX.
    const distanceSelect = postcodePrefix
      ? Prisma.sql`CASE
            WHEN EXISTS (
              SELECT 1 FROM delivery_configs dc
              WHERE dc.vendor_id = v.id
                AND EXISTS (
                  SELECT 1 FROM unnest(dc.postcodes) AS pc
                  WHERE UPPER(REPLACE(pc, ' ', '')) LIKE ${postcodePrefix + '%'}
                )
            ) THEN 0::float
            WHEN EXISTS (
              SELECT 1 FROM addresses a
              WHERE a.user_id = v.user_id
                AND UPPER(REPLACE(a.postcode, ' ', '')) LIKE ${postcodePrefix + '%'}
            ) THEN 0::float
            ELSE NULL::float
          END AS distance_km`
      : Prisma.sql`NULL::float AS distance_km`;

    const postcodeFilter = postcodePrefix && sortBy === VendorSortBy.distance
      ? Prisma.sql`AND (
          EXISTS (
            SELECT 1 FROM delivery_configs dc
            WHERE dc.vendor_id = v.id
              AND EXISTS (
                SELECT 1 FROM unnest(dc.postcodes) AS pc
                WHERE UPPER(REPLACE(pc, ' ', '')) LIKE ${postcodePrefix + '%'}
              )
          )
          OR EXISTS (
            SELECT 1 FROM addresses a
            WHERE a.user_id = v.user_id
              AND UPPER(REPLACE(a.postcode, ' ', '')) LIKE ${postcodePrefix + '%'}
          )
        )`
      : Prisma.empty;

    return this.prisma.$queryRaw<SearchedVendorRow[]>(Prisma.sql`
      SELECT
        v.id, v.business_name, v.slug, v.description, v.cuisines,
        v.status, v.rating, v.rating_count, v.created_at,
        ${distanceSelect},
        ${matchedDishesSelect}
      FROM vendors v
      WHERE v.status::text = ${dto.status ?? VendorStatus.live}
        ${cursorClause}
        ${cuisineClause}
        ${halalClause}
        ${favouriteClause}
        ${postcodeFilter}
        ${qClause}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `);
  }

  findById(id: string) {
    return this.prisma.vendor.findUnique({
      where: { id },
      include: {
        deliveryConfig: true,
        _count: { select: { menus: { where: { isActive: true } } } },
        // Active menus + their items so the customer PWA's profile page can
        // render the menu without an extra round-trip. Items are returned
        // in the order vendors define on the menu (createdAt asc) — the
        // client groups them by `category` for display.
        menus: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: {
            // Customer-facing payload: only include published items so
            // vendor drafts (isAvailable=false) never leak to the PWA.
            items: {
              where: { isAvailable: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }

  findByUserId(userId: string) {
    return this.prisma.vendor.findUnique({
      where: { userId },
      include: { deliveryConfig: true },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.vendor.findUnique({ where: { slug } });
  }

  create(data: Prisma.VendorCreateInput) {
    return this.prisma.vendor.create({ data });
  }

  update(id: string, data: Prisma.VendorUpdateInput) {
    return this.prisma.vendor.update({ where: { id }, data });
  }

  upsertDeliveryConfigMinOrder(vendorId: string, minOrderPence: number) {
    return this.prisma.deliveryConfig.upsert({
      where: { vendorId },
      create: { vendorId, minOrderPence },
      update: { minOrderPence },
    });
  }

  /**
   * Atomic status transition + audit log write.
   */
  async transitionStatus(params: {
    vendorId: string;
    fromStatus: VendorStatus;
    toStatus: VendorStatus;
    actorUserId: string;
    reasonCode?: string;
    notes?: string;
    orderCapWeekly?: number;
  }) {
    const now = new Date();
    const vendorUpdate: Prisma.VendorUpdateInput = { status: params.toStatus };
    if (params.toStatus === VendorStatus.approved || params.toStatus === VendorStatus.live) {
      vendorUpdate.approvedAt = now;
    }
    if (params.toStatus === VendorStatus.suspended) {
      vendorUpdate.suspendedAt = now;
    }

    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.update({
        where: { id: params.vendorId },
        data: vendorUpdate,
      });
      await tx.auditLog.create({
        data: {
          actorId: params.actorUserId,
          entityType: 'vendors',
          entityId: params.vendorId,
          action: `vendor.${params.toStatus}`,
          metadata: {
            previousState: { status: params.fromStatus },
            newState: {
              status: params.toStatus,
              reasonCode: params.reasonCode ?? null,
              notes: params.notes ?? null,
              orderCapWeekly: params.orderCapWeekly ?? null,
            },
          },
        },
      });
      return vendor;
    });
  }

  listPublishedReviews(vendorId: string, limit: number, cursor?: string) {
    return this.prisma.review.findMany({
      where: { vendorId, isHidden: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        isVerified: true,
        createdAt: true,
        customer: { select: { firstName: true } },
      },
    });
  }

  /**
   * Nightly cron hook: recompute community-favourite status.
   *
   * Schema has no `community_favourite` or `reorder_rate_pct` column, so this
   * is a no-op that returns the rows that WOULD qualify. Wire to a scheduled
   * job once those columns are added.
   */
  async getCommunityFavouriteCandidates() {
    return this.prisma.vendor.findMany({
      where: { status: VendorStatus.live, rating: { gte: COMMUNITY_FAVOURITE_RATING } },
      select: { id: true, rating: true, ratingCount: true },
    });
  }
}
