import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LoyaltyTxType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const POINTS_PER_PENCE = 100;
const MIN_REDEMPTION = 200;
const POINT_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loyalty points ledger.
 *
 * Schema realities (FR-LOY-001 spec assumed fields that don't exist):
 *   - LoyaltyPoint has {type, points, reason, orderId, expiresAt} — no
 *     `transactionType`, no `description`, no `balanceAfter`.
 *   - Balance is therefore derived (SUM of `points`) rather than stored
 *     per row. This avoids drift and is cheap with the userId index.
 *
 * Conventions:
 *   - Every row is signed: `earned`/`adjusted` are positive, `redeemed`/
 *     `expired` are negative.
 *   - 1 point = 1 penny (worth at redemption); 1 point earned per £1 spent.
 *   - `expiresAt` is set on `earned` rows only; the cron clears it to NULL
 *     once the matching `expired` row has been written so we never
 *     double-expire on a re-run.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Postgres advisory-lock wrapper. We don't have a UNIQUE index on
   * (userId, orderId, type) — adding one would require a migration which
   * the FR-LOY-001 spec explicitly forbids. Instead we serialise every
   * read-then-write window for a given (userId, orderId) pair using
   * `pg_advisory_xact_lock`, so the "find existing row → create if
   * absent" pattern is safe under concurrent retries / parallel
   * delivered transitions.
   *
   * Lock key uses `hashtextextended(text, bigint)` (returns bigint) so
   * the input fits Postgres' single-arg advisory-lock signature without
   * collision-prone int4 truncation.
   */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      return fn();
    });
  }

  async getBalance(userId: string): Promise<number> {
    const agg = await this.prisma.loyaltyPoint.aggregate({
      where: { userId },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }

  /**
   * Credit points for a delivered order. Idempotent per (userId, orderId)
   * via a pre-check — Prisma can't enforce a partial unique index without
   * a migration, so we read-then-write inside the same logical step.
   */
  async creditPoints(userId: string, orderId: string, orderTotalPence: number): Promise<number> {
    if (orderTotalPence <= 0) return 0;
    return this.withLock(`loyalty:credit:${orderId}`, async () => {
      const existing = await this.prisma.loyaltyPoint.findFirst({
        where: { userId, orderId, type: LoyaltyTxType.earned },
        select: { id: true, points: true },
      });
      if (existing) {
        this.logger.log(`creditPoints skipped — already credited ${existing.points}pt for order ${orderId}`);
        return existing.points;
      }
      const points = Math.floor(orderTotalPence / POINTS_PER_PENCE);
      if (points <= 0) return 0;
      await this.prisma.loyaltyPoint.create({
        data: {
          userId,
          orderId,
          type: LoyaltyTxType.earned,
          points,
          reason: 'Earned from order',
          expiresAt: new Date(Date.now() + POINT_LIFETIME_MS),
        },
      });
      return points;
    });
  }

  /**
   * Pre-flight balance check used by callers that need to validate a
   * redemption BEFORE creating the order row, without writing a ledger
   * entry. Throws the same errors `redeemPoints` would.
   */
  async assertCanRedeem(userId: string, pointsToRedeem: number): Promise<void> {
    if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < MIN_REDEMPTION) {
      throw new BadRequestException({
        code: 'LOYALTY_BELOW_MIN',
        message: `Minimum redemption is ${MIN_REDEMPTION} points`,
      });
    }
    const balance = await this.getBalance(userId);
    if (balance < pointsToRedeem) {
      throw new BadRequestException({
        code: 'LOYALTY_INSUFFICIENT',
        message: 'Insufficient loyalty points',
      });
    }
  }

  /**
   * Redeem points at checkout. Returns the discount in pence.
   *
   * Idempotent per (userId, orderId): if a redemption row already exists
   * for the same order it returns the existing magnitude — guards
   * against double-debiting on a checkout retry that re-runs createOrder
   * for an order that was actually committed.
   */
  async redeemPoints(
    userId: string,
    pointsToRedeem: number,
    orderId: string,
  ): Promise<number> {
    return this.withLock(`loyalty:redeem:${orderId}`, async () => {
      const existing = await this.prisma.loyaltyPoint.findFirst({
        where: { userId, orderId, type: LoyaltyTxType.redeemed },
        select: { points: true },
      });
      if (existing) return Math.abs(existing.points);

      if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < MIN_REDEMPTION) {
        throw new BadRequestException({
          code: 'LOYALTY_BELOW_MIN',
          message: `Minimum redemption is ${MIN_REDEMPTION} points`,
        });
      }
      // Re-check balance INSIDE the lock — another concurrent redemption
      // for a different orderId could have drained the balance between
      // the caller's pre-flight `assertCanRedeem` and this write.
      const balance = await this.getBalance(userId);
      if (balance < pointsToRedeem) {
        throw new BadRequestException({
          code: 'LOYALTY_INSUFFICIENT',
          message: 'Insufficient loyalty points',
        });
      }
      await this.prisma.loyaltyPoint.create({
        data: {
          userId,
          orderId,
          type: LoyaltyTxType.redeemed,
          points: -pointsToRedeem,
          reason: `Redeemed ${pointsToRedeem} points at checkout`,
        },
      });
      return pointsToRedeem; // 1 point = 1 penny discount
    });
  }

  /**
   * Compensating credit when an order with a redemption is cancelled or
   * refunded. Idempotent: only fires if (a) a redeemed row exists for
   * the order and (b) no compensating `adjusted` row already does.
   */
  async refundRedemption(userId: string, orderId: string): Promise<number> {
    return this.withLock(`loyalty:refund:${orderId}`, async () => {
      const redeemed = await this.prisma.loyaltyPoint.findFirst({
        where: { userId, orderId, type: LoyaltyTxType.redeemed },
        select: { id: true, points: true },
      });
      if (!redeemed) return 0;
      const alreadyRefunded = await this.prisma.loyaltyPoint.findFirst({
        where: {
          userId,
          orderId,
          type: LoyaltyTxType.adjusted,
          reason: { startsWith: 'Refund of redemption' },
        },
        select: { id: true },
      });
      if (alreadyRefunded) return 0;
      const credit = Math.abs(redeemed.points);
      await this.prisma.loyaltyPoint.create({
        data: {
          userId,
          orderId,
          type: LoyaltyTxType.adjusted,
          points: credit,
          reason: `Refund of redemption (order cancelled)`,
        },
      });
      return credit;
    });
  }

  /**
   * Sweep earned rows whose 12-month expiry has lapsed. For each, write a
   * matching `expired` row (negative points) and clear the source row's
   * expiresAt so the next run skips it. Notifies the affected user once.
   */
  async expirePoints(): Promise<{ processed: number }> {
    const now = new Date();
    const expiring = await this.prisma.loyaltyPoint.findMany({
      where: {
        type: LoyaltyTxType.earned,
        expiresAt: { lt: now, not: null },
        points: { gt: 0 },
      },
      select: { id: true, userId: true, points: true },
    });
    let processed = 0;
    for (const row of expiring) {
      try {
        // Atomic claim: only proceed if THIS run is the first to clear
        // the row's `expiresAt`. Two overlapping cron workers would
        // otherwise both observe the row in `expiring` and write
        // duplicate `expired` ledger entries. `updateMany` returns
        // `count: 0` for the loser, who then skips silently.
        const claimed = await this.prisma.loyaltyPoint.updateMany({
          where: { id: row.id, expiresAt: { not: null } },
          data: { expiresAt: null },
        });
        if (claimed.count === 0) continue;
        await this.prisma.loyaltyPoint.create({
          data: {
            userId: row.userId,
            type: LoyaltyTxType.expired,
            points: -row.points,
            reason: 'Points expired after 12 months',
          },
        });
        processed++;
        await this.notifications.enqueue(
          'points_expired',
          { userId: row.userId, points: row.points },
          { jobId: `points_expired:${row.id}` },
        );
      } catch (err) {
        this.logger.error(`expirePoints failed for row ${row.id}: ${(err as Error).message}`);
      }
    }
    return { processed };
  }

  /**
   * Admin / system adjustment. Writes both the loyalty row and an audit
   * trail. `adminUserId === 'system'` (or any non-UUID) is recorded as
   * actorId=null since AuditLog.actorId is a UUID FK.
   */
  async adjustPoints(
    userId: string,
    points: number,
    reason: string,
    adminUserId: string | null,
  ): Promise<void> {
    const actorId = adminUserId && UUID_RE.test(adminUserId) ? adminUserId : null;
    await this.prisma.$transaction([
      this.prisma.loyaltyPoint.create({
        data: { userId, type: LoyaltyTxType.adjusted, points, reason },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          entityType: 'users',
          entityId: userId,
          action: 'loyalty.adjusted',
          metadata: { points, reason } as Prisma.JsonObject,
        },
      }),
    ]);
  }

  async getHistory(userId: string, take = 20, cursor?: string) {
    return this.prisma.loyaltyPoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 100),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        points: true,
        reason: true,
        orderId: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }
}
