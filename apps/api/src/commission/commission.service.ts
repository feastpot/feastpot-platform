import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderSource } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedRate {
  id: string;
  source: OrderSource;
  isFirstOrder: boolean | null;
  ratePercent: Decimal;
}

export interface CommissionResult {
  commissionPence: number;
  vendorPayoutPence: number;
  /** null when rate lookup failed and a legacy fallback was used. */
  rateId: string | null;
  ratePercent: Decimal;
}

export interface EarningsSummary {
  blendedRatePct: number;
  savedPence: number;
  bySource: Array<{
    source: OrderSource;
    orderCount: number;
    foodSubtotalPence: number;
    commissionPence: number;
    effectiveRatePct: number;
  }>;
}

const FLAT_RATE_PCT = 12; // legacy baseline used for savings calculation

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Rate resolution ────────────────────────────────────────────────────────

  /**
   * Look up the active CommissionRate row for the given source + isFirstOrder
   * at the given point in time.
   * Never returns a hardcoded constant - always reads from the DB.
   * Throws NotFoundException when no matching rate exists (seed data prevents this).
   */
  async resolveRate(source: OrderSource, isFirstOrder: boolean, at: Date): Promise<ResolvedRate> {
    // isFirstOrder=null on a CommissionRate means "applies to all isFirstOrder values"
    // (used for VENDOR_REFERRED). Build an explicit OR to handle the nullable column.
    const rate = await this.prisma.commissionRate.findFirst({
      where: {
        source,
        AND: [
          { OR: [{ isFirstOrder: isFirstOrder }, { isFirstOrder: null }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
        ],
        effectiveFrom: { lte: at },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!rate) {
      throw new NotFoundException({
        code: 'COMMISSION_RATE_NOT_FOUND',
        message: `No active commission rate for source=${source} isFirstOrder=${String(isFirstOrder)} at ${at.toISOString()}`,
      });
    }

    return { id: rate.id, source: rate.source, isFirstOrder: rate.isFirstOrder, ratePercent: rate.ratePercent };
  }

  // ─── Pure arithmetic ─────────────────────────────────────────────────────────

  /**
   * Integer pence arithmetic - never floats.
   * commissionPence = round(foodSubtotalPence * ratePercent / 100)
   */
  computePence(foodSubtotalPence: number, ratePercent: Decimal): number {
    return Math.round((foodSubtotalPence * ratePercent.toNumber()) / 100);
  }

  // ─── Composite helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the active rate and compute commission + vendor payout.
   * Returns rateId=null when the DB lookup fails (logs error, uses 12% fallback).
   * A failed lookup must NEVER block order creation.
   */
  async resolveRateAndCompute(
    source: OrderSource,
    isFirstOrder: boolean,
    subtotalPence: number,
    totalPence: number,
    serviceFeePence: number,
    at: Date,
  ): Promise<CommissionResult> {
    try {
      const rate = await this.resolveRate(source, isFirstOrder, at);
      const commissionPence = this.computePence(subtotalPence, rate.ratePercent);
      return {
        commissionPence,
        vendorPayoutPence: totalPence - serviceFeePence - commissionPence,
        rateId: rate.id,
        ratePercent: rate.ratePercent,
      };
    } catch (err) {
      this.logger.error(
        `resolveRateAndCompute failed for source=${source} isFirstOrder=${String(isFirstOrder)}: ${(err as Error).message}; using 12% fallback`,
      );
      const commissionPence = Math.round((subtotalPence * 1200) / 10_000);
      return {
        commissionPence,
        vendorPayoutPence: totalPence - serviceFeePence - commissionPence,
        rateId: null,
        ratePercent: new Decimal(12),
      };
    }
  }

  /**
   * Re-calculate and persist commission for an existing order using its
   * immutable OrderAttribution. Idempotent (upsert). Used for backfill.
   */
  async calculate(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        subtotalPence: true,
        createdAt: true,
        attribution: { select: { source: true, isFirstOrder: true } },
      },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });

    const source = order.attribution?.source ?? OrderSource.MARKETPLACE;
    const isFirstOrder = order.attribution?.isFirstOrder ?? true;

    const rate = await this.resolveRate(source, isFirstOrder, order.createdAt);
    const commissionPence = this.computePence(order.subtotalPence, rate.ratePercent);

    await this.prisma.orderCommission.upsert({
      where: { orderId },
      create: {
        orderId,
        foodSubtotalPence: order.subtotalPence,
        ratePercent: rate.ratePercent,
        commissionPence,
        commissionRateId: rate.id,
        source,
        isFirstOrder,
      },
      update: {
        foodSubtotalPence: order.subtotalPence,
        ratePercent: rate.ratePercent,
        commissionPence,
        commissionRateId: rate.id,
        source,
        isFirstOrder,
      },
    });
  }

  // ─── Admin rate management ───────────────────────────────────────────────────

  /**
   * List all CommissionRate rows ordered by source + effectiveFrom desc.
   */
  async listRates() {
    return this.prisma.commissionRate.findMany({
      orderBy: [{ source: 'asc' }, { isFirstOrder: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  /**
   * Create a new rate row and close the previously active rate for the same
   * (source, isFirstOrder) slot.
   * effectiveFrom must be >= now (validated by caller; rate increases need 15d notice).
   * Returns the new rate row.
   */
  async createRate(dto: {
    source: OrderSource;
    isFirstOrder: boolean | null;
    ratePercent: Decimal;
    effectiveFrom: Date;
    createdBy: string;
    note?: string;
  }) {
    // Close the current open-ended rate for the same slot.
    await this.prisma.commissionRate.updateMany({
      where: {
        source: dto.source,
        isFirstOrder: dto.isFirstOrder,
        effectiveTo: null,
        effectiveFrom: { lt: dto.effectiveFrom },
      },
      data: { effectiveTo: dto.effectiveFrom },
    });

    return this.prisma.commissionRate.create({
      data: {
        source: dto.source,
        isFirstOrder: dto.isFirstOrder,
        ratePercent: dto.ratePercent,
        effectiveFrom: dto.effectiveFrom,
        createdBy: dto.createdBy,
        note: dto.note ?? null,
      },
    });
  }

  // ─── Reporting ───────────────────────────────────────────────────────────────

  /**
   * Blended platform take rate for a time window.
   * Computed from OrderCommission rows (only orders with a commission record).
   */
  async getBlendedTakeRate(from: Date, to: Date): Promise<{ blendedPct: number; totalCommissionPence: number; totalSubtotalPence: number; orderCount: number }> {
    const agg = await this.prisma.orderCommission.aggregate({
      where: { calculatedAt: { gte: from, lt: to } },
      _sum: { commissionPence: true, foodSubtotalPence: true },
      _count: { _all: true },
    });
    const totalCommission = agg._sum.commissionPence ?? 0;
    const totalSubtotal = agg._sum.foodSubtotalPence ?? 0;
    const blendedPct = totalSubtotal > 0 ? (totalCommission / totalSubtotal) * 100 : 0;
    return {
      blendedPct: Math.round(blendedPct * 100) / 100,
      totalCommissionPence: totalCommission,
      totalSubtotalPence: totalSubtotal,
      orderCount: agg._count._all,
    };
  }

  /**
   * Per-vendor earnings summary for the vendor portal earnings page.
   * from/to define the "this month" window; cumulative uses all time.
   */
  async getVendorEarningsSummary(vendorId: string, from: Date, to: Date): Promise<{
    period: EarningsSummary;
    cumulative: EarningsSummary;
  }> {
    const build = async (where: object): Promise<EarningsSummary> => {
      const rows = await this.prisma.orderCommission.groupBy({
        by: ['source'],
        where: { order: { vendorId }, ...where },
        _count: { _all: true },
        _sum: { commissionPence: true, foodSubtotalPence: true },
      });

      const bySource = rows.map((r) => {
        const sub = r._sum.foodSubtotalPence ?? 0;
        const com = r._sum.commissionPence ?? 0;
        return {
          source: r.source,
          orderCount: r._count._all,
          foodSubtotalPence: sub,
          commissionPence: com,
          effectiveRatePct: sub > 0 ? Math.round((com / sub) * 10_000) / 100 : 0,
        };
      });

      const totalSubtotal = bySource.reduce((s, r) => s + r.foodSubtotalPence, 0);
      const totalCommission = bySource.reduce((s, r) => s + r.commissionPence, 0);
      const blendedRatePct =
        totalSubtotal > 0 ? Math.round((totalCommission / totalSubtotal) * 10_000) / 100 : 0;
      const flat12Commission = Math.round((totalSubtotal * FLAT_RATE_PCT) / 100);
      const savedPence = Math.max(0, flat12Commission - totalCommission);

      return { blendedRatePct, savedPence, bySource };
    };

    const [period, cumulative] = await Promise.all([
      build({ calculatedAt: { gte: from, lt: to } }),
      build({}),
    ]);

    return { period, cumulative };
  }
}
