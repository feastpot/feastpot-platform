import { Injectable, Logger } from '@nestjs/common';
import { ReferralStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoyaltyService } from './loyalty.service';

const REWARD_POINTS = 500; // = £5

/**
 * Referrals.
 *
 * Schema realities: there is no `User.referralCode` column. We model a
 * user's stable share code as a pending Referral row with refereeId=null
 * — `ensureCode` is a find-or-create on that row. When a friend signs up
 * with the code we create a NEW Referral row (because `code` is @unique
 * we suffix with a short random) so each referral is its own ledger
 * entry while the user's public share code stays stable.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly notifications: NotificationsService,
  ) {}

  private generateCode(len = 8): string {
    return randomBytes(8).toString('base64url').replace(/[^A-Z0-9]/gi, '').slice(0, len).toUpperCase();
  }

  async ensureCode(userId: string): Promise<string> {
    const existing = await this.prisma.referral.findFirst({
      where: { referrerId: userId, refereeId: null },
      select: { code: true },
    });
    if (existing) return existing.code;

    // Tight retry loop for unique-collision on `code` (vanishingly rare).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCode();
      try {
        const created = await this.prisma.referral.create({
          data: {
            referrerId: userId,
            refereeId: null,
            code,
            status: ReferralStatus.pending,
          },
          select: { code: true },
        });
        return created.code;
      } catch (err) {
        const msg = (err as Error).message;
        if (!msg.includes('Unique')) throw err;
      }
    }
    throw new Error('Could not allocate referral code after 5 attempts');
  }

  /**
   * Called when a brand-new user signs up with a code. Records the
   * relationship as a pending Referral; reward only fires later, after
   * the new user's first delivered order, via `rewardReferral`.
   */
  async processReferral(newUserId: string, sharedCode: string): Promise<void> {
    if (!sharedCode) return;
    const owner = await this.prisma.referral.findUnique({
      where: { code: sharedCode },
      select: { referrerId: true },
    });
    if (!owner) return; // unknown code — silently ignore
    if (owner.referrerId === newUserId) return; // self-referral
    // One-per-user: bail if this user is already someone's referee
    const already = await this.prisma.referral.findFirst({
      where: { refereeId: newUserId },
      select: { id: true },
    });
    if (already) return;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `${sharedCode}-${this.generateCode(4)}`;
      try {
        await this.prisma.referral.create({
          data: {
            referrerId: owner.referrerId,
            refereeId: newUserId,
            code,
            status: ReferralStatus.pending,
          },
        });
        return;
      } catch (err) {
        if (!(err as Error).message.includes('Unique')) throw err;
      }
    }
    this.logger.warn(`processReferral: code allocation failed for referee ${newUserId}`);
  }

  /**
   * Reward both sides on the new user's FIRST delivered order.
   *
   * Atomic + idempotent: a single `$transaction` first does a conditional
   * `updateMany` that only succeeds if the row is still `pending`. If the
   * count is 0 someone else (a parallel delivered transition, a re-run)
   * already claimed the reward — we bail before crediting anyone, so
   * neither side can be paid twice.
   */
  async rewardReferral(newUserId: string): Promise<void> {
    const referral = await this.prisma.referral.findFirst({
      where: { refereeId: newUserId, status: ReferralStatus.pending },
      select: { id: true, referrerId: true },
    });
    if (!referral) return;

    const claimed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.referral.updateMany({
        where: { id: referral.id, status: ReferralStatus.pending },
        data: {
          status: ReferralStatus.rewarded,
          rewardPence: REWARD_POINTS,
          rewardedAt: new Date(),
          completedAt: new Date(),
        },
      });
      if (claim.count === 0) return false;

      // Both adjustments + audit log share the same transaction so a
      // failure rolls back the status change and lets a future call retry.
      await tx.loyaltyPoint.create({
        data: {
          userId: referral.referrerId,
          type: 'adjusted',
          points: REWARD_POINTS,
          reason: 'Referral reward — friend placed first order',
        },
      });
      await tx.loyaltyPoint.create({
        data: {
          userId: newUserId,
          type: 'adjusted',
          points: REWARD_POINTS,
          reason: 'Welcome bonus — joined via referral',
        },
      });
      return true;
    });

    if (!claimed) return;

    await this.notifications.enqueue(
      'referral_rewarded',
      {
        userId: referral.referrerId,
        referredName: 'your friend',
        creditPence: REWARD_POINTS,
      },
      { jobId: `referral_rewarded:${referral.id}` },
    );
  }

  async listForUser(referrerId: string) {
    return this.prisma.referral.findMany({
      where: { referrerId, NOT: { refereeId: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        rewardPence: true,
        completedAt: true,
        rewardedAt: true,
        createdAt: true,
      },
    });
  }
}
