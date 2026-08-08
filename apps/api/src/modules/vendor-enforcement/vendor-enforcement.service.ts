import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnforcementType, Prisma, VendorStatus, VerificationState } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

import {
  CreateEnforcementActionDto,
  SERIOUS_CAUSE_CODES,
  URGENT_REASON_CODES,
  type ReasonCode,
} from './dto/create-enforcement-action.dto';

const TERMINATION_NOTICE_DAYS = 30;
const APPEAL_WINDOW_DAYS = 14;
const TERMS_CLAUSE_REASON_CODES = '14.1';
const TERMS_CLAUSE_TERMINATION = '14.3';
const TERMS_CLAUSE_TERMINATION_SERIOUS = '14.4';
const TERMS_CLAUSE_APPEAL = '18.1';

export interface EnforcementActionRecord {
  id: string;
  vendorId: string;
  actionType: EnforcementType;
  reasonCode: string;
  reasonNarrative: string;
  facts: Record<string, unknown>;
  effectiveAt: Date;
  noticeSentAt: Date | null;
  urgentBasis: string | null;
  issuedBy: string;
  appealId: string | null;
  liftedAt: Date | null;
  liftedBy: string | null;
  liftNote: string | null;
  createdAt: Date;
}

@Injectable()
export class VendorEnforcementService {
  private readonly logger = new Logger(VendorEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Create a P2B-compliant enforcement action against a vendor.
   *
   * Business rules enforced:
   *   1. reasonNarrative >= 50 chars (validated by DTO and re-checked here).
   *   2. Non-urgent: effectiveAt >= noticeSentAt (notice sent now).
   *   3. Urgent: urgentBasis required; action may be immediate.
   *   4. TERMINATION + non-serious-cause: effectiveAt >= noticeSentAt + 30 days.
   *
   * Side effects (in a single transaction):
   *   - Creates the VendorEnforcementAction row.
   *   - Updates Vendor.status and VendorVerification.overallState as appropriate.
   *   - Sets noticeSentAt = now.
   *
   * After the transaction, enqueues the durable notice email to the vendor.
   */
  async createAction(
    vendorId: string,
    dto: CreateEnforcementActionDto,
    issuedBy: string,
  ): Promise<EnforcementActionRecord> {
    // ── 1. Validate narrative length ──────────────────────────────────────────
    if (dto.reasonNarrative.trim().length < 50) {
      throw new BadRequestException({
        code: 'NARRATIVE_TOO_SHORT',
        message: 'reasonNarrative must be at least 50 characters (P2B requirement)',
      });
    }

    const reasonCode = dto.reasonCode as ReasonCode;
    const isUrgent = (URGENT_REASON_CODES as readonly string[]).includes(reasonCode);
    const effectiveAt = new Date(dto.effectiveAt);
    const now = new Date();

    // ── 2. Urgent validation ──────────────────────────────────────────────────
    if (isUrgent && !dto.urgentBasis?.trim()) {
      throw new BadRequestException({
        code: 'URGENT_BASIS_REQUIRED',
        message: `urgentBasis is required for urgent reason code '${reasonCode}'`,
      });
    }

    // ── 3. Non-urgent: notice must precede or equal effectiveAt ───────────────
    // noticeSentAt will be set to now() when the action is created.
    // For non-urgent codes, the effectiveAt must be >= now (in the future or immediate).
    if (!isUrgent && effectiveAt < now) {
      throw new BadRequestException({
        code: 'NOTICE_BEFORE_EFFECTIVE',
        message:
          'For non-urgent actions, effectiveAt must be at or after the current time ' +
          'so that the notice is dispatched before the action takes effect.',
      });
    }

    // ── 4. Termination: 30-day notice unless serious cause ────────────────────
    if (dto.actionType === EnforcementType.TERMINATION) {
      const isSeriousCause = (SERIOUS_CAUSE_CODES as readonly string[]).includes(reasonCode);
      if (!isSeriousCause) {
        const thirtyDaysOut = new Date(now.getTime() + TERMINATION_NOTICE_DAYS * 86_400_000);
        if (effectiveAt < thirtyDaysOut) {
          throw new BadRequestException({
            code: 'TERMINATION_NOTICE_TOO_SHORT',
            message:
              `TERMINATION requires effectiveAt to be at least ${TERMINATION_NOTICE_DAYS} days ` +
              `after the notice date unless a serious-cause code is used ` +
              `(${(SERIOUS_CAUSE_CODES as readonly string[]).join(', ')}).`,
          });
        }
      }
    }

    // ── 5. Load vendor ────────────────────────────────────────────────────────
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { verification: { select: { id: true, overallState: true } } },
    });
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: `Vendor ${vendorId} not found` });
    }

    const noticeSentAt = new Date();
    const facts: Record<string, unknown> = {
      priorStatus: vendor.status,
      vendorName: vendor.businessName,
      ...dto.facts,
    };

    // ── 6. Transaction: create action + apply status change ───────────────────
    const action = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vendorEnforcementAction.create({
        data: {
          vendorId,
          actionType: dto.actionType,
          reasonCode,
          reasonNarrative: dto.reasonNarrative.trim(),
          facts: facts as Prisma.InputJsonValue,
          effectiveAt,
          noticeSentAt,
          urgentBasis: dto.urgentBasis?.trim() ?? null,
          issuedBy,
        },
      });

      if (dto.actionType === EnforcementType.SUSPENSION) {
        if (vendor.status === VendorStatus.live || vendor.status === VendorStatus.probation) {
          await tx.vendor.update({
            where: { id: vendorId },
            data: { status: VendorStatus.suspended },
          });
        }
        if (vendor.verification) {
          await tx.vendorVerification.update({
            where: { id: vendor.verification.id },
            data: { overallState: VerificationState.SUSPENDED },
          });
        }
      } else if (dto.actionType === EnforcementType.TERMINATION) {
        await tx.vendor.update({
          where: { id: vendorId },
          data: { status: VendorStatus.removed },
        });
      }
      // RESTRICTION: does not change vendor.status; leaves listing up but
      // records the action for audit and dashboard display.

      return created;
    });

    // ── 7. Audit log for urgent gap ───────────────────────────────────────────
    if (isUrgent && effectiveAt < noticeSentAt) {
      const gapMs = noticeSentAt.getTime() - effectiveAt.getTime();
      this.logger.warn(
        `Urgent enforcement action ${action.id}: notice sent ${gapMs}ms after effectiveAt ` +
          `(basis: ${dto.urgentBasis ?? 'none'})`,
      );
    }

    // ── 8. Enqueue notice email ───────────────────────────────────────────────
    const appealDeadline = new Date(effectiveAt.getTime() + APPEAL_WINDOW_DAYS * 86_400_000);
    const clauseRef = dto.actionType === EnforcementType.TERMINATION
      ? (SERIOUS_CAUSE_CODES as readonly string[]).includes(reasonCode)
        ? TERMS_CLAUSE_TERMINATION_SERIOUS
        : TERMS_CLAUSE_TERMINATION
      : TERMS_CLAUSE_REASON_CODES;

    await this.notifications.enqueue(
      'enforcement_action',
      {
        userId: vendor.userId,
        vendorName: vendor.businessName,
        actionType: dto.actionType,
        reasonCode,
        reasonNarrative: dto.reasonNarrative.trim(),
        effectiveAt: effectiveAt.toISOString(),
        clauseRef,
        appealClause: TERMS_CLAUSE_APPEAL,
        appealDeadline: appealDeadline.toISOString(),
        isUrgent,
      },
      { jobId: `enforcement_action:${action.id}` },
    );

    this.logger.log(
      `Enforcement action ${action.id} created: ${dto.actionType} / ${reasonCode} ` +
        `for vendor ${vendorId} by ${issuedBy}`,
    );

    return action as unknown as EnforcementActionRecord;
  }

  /**
   * Lift (revoke) an active enforcement action.
   * Restores the vendor's prior status if the action was a SUSPENSION.
   */
  async liftAction(
    actionId: string,
    liftedBy: string,
    liftNote?: string,
  ): Promise<EnforcementActionRecord> {
    const action = await this.prisma.vendorEnforcementAction.findUnique({
      where: { id: actionId },
      include: { vendor: { select: { id: true, userId: true, businessName: true } } },
    });
    if (!action) {
      throw new NotFoundException({ code: 'ACTION_NOT_FOUND', message: `Enforcement action ${actionId} not found` });
    }
    if (action.liftedAt) {
      throw new BadRequestException({
        code: 'ACTION_ALREADY_LIFTED',
        message: 'This enforcement action has already been lifted.',
      });
    }

    const priorStatus = (action.facts as Record<string, unknown>).priorStatus as VendorStatus | undefined;

    const lifted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendorEnforcementAction.update({
        where: { id: actionId },
        data: { liftedAt: new Date(), liftedBy, liftNote: liftNote ?? null },
      });

      if (action.actionType === EnforcementType.SUSPENSION) {
        // Restore to prior status or probation as a safe default.
        const restoreStatus =
          priorStatus === VendorStatus.live || priorStatus === VendorStatus.probation
            ? priorStatus
            : VendorStatus.probation;

        await tx.vendor.update({
          where: { id: action.vendorId },
          data: { status: restoreStatus },
        });

        // Restore verification state.
        const verification = await tx.vendorVerification.findUnique({
          where: { vendorId: action.vendorId },
        });
        if (verification && verification.overallState === VerificationState.SUSPENDED) {
          await tx.vendorVerification.update({
            where: { id: verification.id },
            data: { overallState: VerificationState.VERIFIED },
          });
        }
      }

      return updated;
    });

    await this.notifications.enqueue('enforcement_lifted', {
      userId: action.vendor.userId,
      vendorName: action.vendor.businessName,
      actionType: action.actionType,
      liftNote: liftNote ?? null,
    });

    this.logger.log(`Enforcement action ${actionId} lifted by ${liftedBy}`);
    return lifted as unknown as EnforcementActionRecord;
  }

  /** All enforcement actions for a vendor (newest first). */
  getActions(vendorId: string): Promise<EnforcementActionRecord[]> {
    return this.prisma.vendorEnforcementAction.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<EnforcementActionRecord[]>;
  }

  /** Active (not yet lifted) enforcement actions for a vendor. */
  getActiveActions(vendorId: string): Promise<EnforcementActionRecord[]> {
    return this.prisma.vendorEnforcementAction.findMany({
      where: { vendorId, liftedAt: null },
      orderBy: { effectiveAt: 'asc' },
    }) as unknown as Promise<EnforcementActionRecord[]>;
  }

  /**
   * Convenience wrapper used by automated jobs (document expiry, FHRS).
   * Generates a compliant narrative from a template, selects correct urgency,
   * and calls createAction() so all P2B rules are enforced.
   */
  async createAutomatedSuspension(
    vendorId: string,
    reasonCode: ReasonCode,
    humanReadableReason: string,
  ): Promise<EnforcementActionRecord> {
    const isUrgent = (URGENT_REASON_CODES as readonly string[]).includes(reasonCode);

    const narrative = isUrgent
      ? `Feastpot has suspended your listing because: ${humanReadableReason}. ` +
        `This action has been taken immediately because it relates to food safety or platform security obligations ` +
        `that require prompt action under our vendor terms (clause 14.1). ` +
        `Please resolve the issue as soon as possible and contact support to arrange reinstatement. ` +
        `You have 14 days from the effective date to appeal this decision.`
      : `Feastpot has suspended your listing because: ${humanReadableReason}. ` +
        `Your listing will remain paused until this matter is resolved. ` +
        `Please upload the required documents or contact support to discuss next steps. ` +
        `You have 14 days from the effective date to appeal this decision.`;

    const urgentBasis = isUrgent
      ? `Automated compliance action: ${humanReadableReason}. ` +
        `Immediate suspension required under food safety or platform security obligations.`
      : undefined;

    return this.createAction(
      vendorId,
      {
        actionType: EnforcementType.SUSPENSION,
        reasonCode,
        reasonNarrative: narrative,
        effectiveAt: new Date().toISOString(),
        urgentBasis,
        facts: { source: 'automated_compliance_scan' },
      },
      'system',
    );
  }
}
