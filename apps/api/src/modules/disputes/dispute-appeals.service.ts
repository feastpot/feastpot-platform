import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppealOutcome, DisputeStatus, PayoutStatus, Prisma, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';

import type { DecideAppealStageDto } from './dto/decide-appeal-stage.dto';
import type { SubmitAppealDto } from './dto/submit-appeal.dto';

// ─── P2B appeal constants (clause 18.1-18.3) ────────────────────────────────

/** Calendar days from the dispute decision date in which an appeal may be submitted. */
export const APPEAL_WINDOW_DAYS = 14;

/**
 * Platform's stated acknowledgement commitment in business days (clause 18.2).
 * The appeal window MUST exceed this when converted to calendar days.
 * Validated by appeal-policy.spec.ts.
 */
export const APPEAL_ACK_BUSINESS_DAYS = 5;

/** Minimum length for written reasons at each review stage. */
const MIN_REASONS_LENGTH = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function appealDeadline(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

@Injectable()
export class DisputeAppealsService {
  private readonly logger = new Logger(DisputeAppealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Admin: appeals queue ─────────────────────────────────────────────────

  /**
   * List all open appeals (no stage2Outcome) for the admin appeals queue.
   * Annotates each appeal with its deadline and SLA adherence.
   */
  async adminAppealsQueue() {
    const now = new Date();
    const appeals = await this.prisma.disputeAppeal.findMany({
      where: { stage2Outcome: null },
      include: {
        dispute: {
          select: {
            id: true,
            status: true,
            decision: true,
            decidedAt: true,
            isUrgentDispute: true,
            order: {
              select: {
                orderNumber: true,
                totalPence: true,
                vendor: { select: { businessName: true } },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return appeals.map((a) => {
      const deadline = a.dispute.decidedAt
        ? appealDeadline(a.dispute.decidedAt)
        : new Date(a.submittedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
      const hoursToDeadline = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
      return {
        ...a,
        deadline,
        hoursToDeadline: Math.round(hoursToDeadline),
        urgent: hoursToDeadline < 48,
        overdue: hoursToDeadline < 0,
        stage1Pending: a.stage1Outcome === null,
        stage2Pending: a.stage1Outcome !== null && a.stage2Outcome === null,
        // Expose flattened vendor name for convenience.
        vendorName: a.dispute.order.vendor.businessName,
      };
    });
  }

  // ─── Submit appeal (vendor) ────────────────────────────────────────────────

  async submit(disputeId: string, dto: SubmitAppealDto, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            vendorId: true,
            vendor: { select: { id: true, userId: true, businessName: true } },
          },
        },
        appeal: true,
      },
    });
    if (!dispute) {
      throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    }

    // Authorisation: only the vendor on the order may appeal
    if (user.role !== UserRole.vendor || dispute.order.vendor.userId !== user.id) {
      throw new ForbiddenException({
        code: 'NOT_ORDER_VENDOR',
        message: 'Only the vendor on this order may submit an appeal',
      });
    }

    // Dispute must be closed with a formal decision
    if (dispute.status !== DisputeStatus.closed) {
      throw new BadRequestException({
        code: 'DISPUTE_NOT_CLOSED',
        message: 'You can only appeal a closed dispute',
      });
    }
    if (!dispute.decidedAt) {
      throw new BadRequestException({
        code: 'NO_DECISION',
        message: 'The dispute has no recorded decision date - please contact support',
      });
    }

    // Enforce 14-day window
    const deadline = appealDeadline(dispute.decidedAt);
    if (new Date() > deadline) {
      throw new BadRequestException({
        code: 'APPEAL_WINDOW_CLOSED',
        message: `The 14-day appeal window closed on ${deadline.toISOString().slice(0, 10)}`,
      });
    }

    // One appeal per dispute
    if (dispute.appeal) {
      throw new BadRequestException({
        code: 'APPEAL_EXISTS',
        message: 'An appeal has already been submitted for this dispute',
      });
    }

    const appeal = await this.prisma.disputeAppeal.create({
      data: {
        disputeId,
        grounds: dto.grounds.trim(),
        deadline,
      },
    });

    // Notify admins of new appeal
    await this.notifications.enqueue(NotificationEvent.dispute_appeal_submitted, {
      disputeId,
      orderNumber: dispute.order.orderNumber,
      vendorName: dispute.order.vendor.businessName,
      groundsPreview: dto.grounds.slice(0, 200),
    });

    this.logger.log(`Appeal submitted for dispute ${disputeId} by vendor ${user.id}`);
    return appeal;
  }

  // ─── Get appeal for a dispute ──────────────────────────────────────────────

  async get(disputeId: string, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: { select: { customerId: true, vendor: { select: { userId: true } } } },
        appeal: true,
      },
    });
    if (!dispute) {
      throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    }

    // Same view rules as the dispute itself
    const isCustomer = user.role === UserRole.customer && dispute.order.customerId === user.id;
    const isVendor = user.role === UserRole.vendor && dispute.order.vendor.userId === user.id;
    const isStaff =
      user.role === UserRole.admin ||
      user.role === UserRole.support ||
      user.role === UserRole.compliance;
    if (!isCustomer && !isVendor && !isStaff) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Access denied' });
    }

    return dispute.appeal ?? null;
  }

  // ─── Stage 1 decision (admin/support) ─────────────────────────────────────

  async decideStage1(disputeId: string, dto: DecideAppealStageDto, user: AuthUser) {
    if (dto.reasons.trim().length < MIN_REASONS_LENGTH) {
      throw new BadRequestException({
        code: 'REASONS_TOO_SHORT',
        message: `Written reasons must be at least ${MIN_REASONS_LENGTH} characters`,
      });
    }

    const appeal = await this.findAppealOrThrow(disputeId);

    if (appeal.stage1At) {
      throw new BadRequestException({
        code: 'STAGE1_ALREADY_DECIDED',
        message: 'Stage 1 review has already been completed',
      });
    }

    const updated = await this.prisma.disputeAppeal.update({
      where: { id: appeal.id },
      data: {
        stage1By: user.id,
        stage1At: new Date(),
        stage1Outcome: dto.outcome,
        stage1Reasons: dto.reasons.trim(),
      },
    });

    // Notify vendor of stage1 outcome
    await this.notifications.enqueue(NotificationEvent.dispute_appeal_decided, {
      disputeId,
      stage: 1,
      outcome: dto.outcome,
      reasons: dto.reasons,
      canEscalate: dto.outcome !== AppealOutcome.UPHELD,
    });

    this.logger.log(`Appeal stage1 decided for dispute ${disputeId}: ${dto.outcome} by ${user.id}`);
    return updated;
  }

  // ─── Stage 2 decision (different reviewer) ────────────────────────────────

  async decideStage2(disputeId: string, dto: DecideAppealStageDto, user: AuthUser) {
    if (dto.reasons.trim().length < MIN_REASONS_LENGTH) {
      throw new BadRequestException({
        code: 'REASONS_TOO_SHORT',
        message: `Written reasons must be at least ${MIN_REASONS_LENGTH} characters`,
      });
    }

    const appeal = await this.findAppealOrThrow(disputeId);

    if (!appeal.stage1At || !appeal.stage1By) {
      throw new BadRequestException({
        code: 'STAGE1_NOT_DECIDED',
        message: 'Stage 1 must be completed before Stage 2 can be reviewed',
      });
    }

    // P2B requirement: Stage 2 reviewer must be a DIFFERENT person from Stage 1.
    // This prevents a single person from both making and reviewing the same decision.
    if (appeal.stage1By === user.id) {
      throw new ForbiddenException({
        code: 'SAME_REVIEWER',
        message:
          'Stage 2 must be reviewed by a different person than Stage 1. ' +
          'Assign this to another admin or an external adviser.',
      });
    }

    if (appeal.stage2At) {
      throw new BadRequestException({
        code: 'STAGE2_ALREADY_DECIDED',
        message: 'Stage 2 review has already been completed',
      });
    }

    const updated = await this.prisma.disputeAppeal.update({
      where: { id: appeal.id },
      data: {
        stage2By: user.id,
        stage2At: new Date(),
        stage2Outcome: dto.outcome,
        stage2Reasons: dto.reasons.trim(),
      },
    });

    // If UPHELD: reverse the payout deduction automatically
    if (dto.outcome === AppealOutcome.UPHELD) {
      await this.reversePayoutDeduction(disputeId, appeal.disputeId);
    }

    // Notify vendor of final outcome
    await this.notifications.enqueue(NotificationEvent.dispute_appeal_decided, {
      disputeId,
      stage: 2,
      outcome: dto.outcome,
      reasons: dto.reasons,
      isFinal: true,
    });

    this.logger.log(`Appeal stage2 decided for dispute ${disputeId}: ${dto.outcome} by ${user.id}`);
    return updated;
  }

  // ─── Payout reversal on upheld appeal ────────────────────────────────────

  private async reversePayoutDeduction(disputeId: string, _appealDisputeId: string) {
    // Find the dispute with its refund amount and vendor
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: {
        refundPence: true,
        order: {
          select: { vendor: { select: { id: true, businessName: true, userId: true } } },
        },
      },
    });

    if (!dispute?.refundPence || dispute.refundPence <= 0) {
      // No deduction was recorded (e.g. dispute was rejected, not refunded)
      this.logger.log(
        `Upheld appeal for dispute ${disputeId}: no refundPence to reverse (dispute may have been rejected rather than refunded)`,
      );
      return;
    }

    const vendorId = dispute.order.vendor.id;
    const creditPence = dispute.refundPence;

    // Find the vendor's current draft payout and credit back the deduction
    const draftPayout = await this.prisma.payout.findFirst({
      where: { vendorId, status: PayoutStatus.draft },
      orderBy: { createdAt: 'desc' },
    });

    try {
      if (draftPayout) {
        // Credit back against the existing draft payout
        await this.prisma.payout.update({
          where: { id: draftPayout.id },
          data: {
            amountPence: { increment: creditPence },
            refundsPence: { decrement: creditPence },
          },
        });
        this.logger.log(
          `Reversed deduction of ${creditPence}p for vendor ${vendorId} on payout ${draftPayout.id}`,
        );
      } else {
        // No draft payout yet - create a credit entry for the next cycle
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + 7);
        periodEnd.setHours(23, 59, 59, 999);

        await this.prisma.payout.create({
          data: {
            vendorId,
            amountPence: creditPence,
            grossPence: 0,
            commissionPence: 0,
            refundsPence: 0,
            status: PayoutStatus.draft,
            periodStart: now,
            periodEnd,
            orderCount: 0,
            holdReason: `appeal_credit:${disputeId}`,
          },
        });
        this.logger.log(
          `Created credit payout of ${creditPence}p for vendor ${vendorId} (no draft payout found)`,
        );
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint: batch ran concurrently, find and update the fresh draft
        const fresh = await this.prisma.payout.findFirst({
          where: { vendorId, status: PayoutStatus.draft },
        });
        if (fresh) {
          await this.prisma.payout.update({
            where: { id: fresh.id },
            data: {
              amountPence: { increment: creditPence },
              refundsPence: { decrement: creditPence },
            },
          });
        }
      } else {
        this.logger.error(
          `Failed to reverse payout deduction for dispute ${disputeId}: ${(err as Error).message}`,
        );
        throw err;
      }
    }

    // Notify vendor of the credit
    await this.notifications.enqueue(NotificationEvent.dispute_appeal_payout_credit, {
      userId: dispute.order.vendor.userId,
      vendorName: dispute.order.vendor.businessName,
      creditPence,
      disputeId,
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async findAppealOrThrow(disputeId: string) {
    const appeal = await this.prisma.disputeAppeal.findUnique({
      where: { disputeId },
    });
    if (!appeal) {
      throw new NotFoundException({
        code: 'APPEAL_NOT_FOUND',
        message: 'No appeal exists for this dispute',
      });
    }
    return appeal;
  }
}
