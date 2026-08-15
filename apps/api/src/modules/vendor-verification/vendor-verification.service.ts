import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { Injectable, Logger } from '@nestjs/common';
import { FhrsStatus, OrderStatus, VerificationState, VendorStatus } from '@prisma/client';


import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VendorEnforcementService } from '../vendor-enforcement/vendor-enforcement.service';

import type { UpsertVerificationDto } from './dto/upsert-verification.dto';

const RENEWAL_WARNING_DAYS = 30;
/** Days after first reminder before we auto-suspend for non-renewal. */
const SUSPENSION_GRACE_DAYS = 7;

/**
 * States that require a proactive notification to the vendor.
 * VERIFIED transitions do not require action from the vendor.
 */
const NOTIFY_ON_STATES = new Set<VerificationState>([
  VerificationState.RENEWAL_DUE,
  VerificationState.SUSPENDED,
]);

/**
 * Deduplication window. A notification for the same state sent within this
 * window is suppressed. Rapid successive writes (e.g. admin saves twice in
 * 30 seconds) do not produce duplicate emails.
 */
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Active-order statuses a suspended vendor must still fulfil. */
const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.accepted,
  OrderStatus.needs_clarification,
  OrderStatus.preparing,
  OrderStatus.ready,
];

@Injectable()
export class VendorVerificationService {
  private readonly logger = new Logger(VendorVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly enforcement: VendorEnforcementService,
  ) {}

  getVerification(vendorId: string) {
    return this.prisma.vendorVerification.findUnique({ where: { vendorId } });
  }

  /**
   * Admin summary for the compliance triage page.
   *
   * Returns a flat row per live/probation vendor with their current
   * overallState (or 'NOT_SET_UP' when no VendorVerification record exists),
   * plus counts keyed by every VerificationState value and a totalVendors
   * figure that equals the sum of all counts.
   *
   * Invariant guaranteed: counts.notSetUp + counts.VERIFIED +
   *   counts.RENEWAL_DUE + counts.SUSPENDED === totalVendors.
   *
   * The previous three-bucket response (notSetUp[], renewalDue[], suspended[])
   * silently dropped VERIFIED vendors from the row set, making counts
   * unreconcilable. This response is the single authoritative view of the
   * whole live-vendor population.
   */
  async getVerificationSummary(): Promise<{
    totalVendors: number;
    counts: {
      notSetUp: number;
      VERIFIED: number;
      RENEWAL_DUE: number;
      SUSPENDED: number;
    };
    rows: Array<{
      vendorId: string;
      vendorName: string;
      overallState: 'NOT_SET_UP' | VerificationState;
      insuranceValidUntil: Date | null;
      allergenTrainingUntil: Date | null;
      lastNotifiedState: VerificationState | null;
      lastNotifiedAt: Date | null;
    }>;
  }> {
    const liveVendors = await this.prisma.vendor.findMany({
      where: { status: { in: [VendorStatus.live, VendorStatus.probation] } },
      select: { id: true, businessName: true },
      orderBy: { businessName: 'asc' },
    });

    const verifications = await this.prisma.vendorVerification.findMany({
      where: { vendorId: { in: liveVendors.map((v) => v.id) } },
      select: {
        vendorId: true,
        overallState: true,
        insuranceValidUntil: true,
        allergenTrainingUntil: true,
        lastNotifiedState: true,
        lastNotifiedAt: true,
      },
    });

    const verificationMap = new Map(verifications.map((v) => [v.vendorId, v]));

    const counts = {
      notSetUp: 0,
      VERIFIED: 0,
      RENEWAL_DUE: 0,
      SUSPENDED: 0,
    };

    const rows = liveVendors.map((vendor) => {
      const v = verificationMap.get(vendor.id);
      if (!v) {
        counts.notSetUp++;
        return {
          vendorId: vendor.id,
          vendorName: vendor.businessName,
          overallState: 'NOT_SET_UP' as const,
          insuranceValidUntil: null,
          allergenTrainingUntil: null,
          lastNotifiedState: null,
          lastNotifiedAt: null,
        };
      }
      counts[v.overallState]++;
      return {
        vendorId: vendor.id,
        vendorName: vendor.businessName,
        overallState: v.overallState,
        insuranceValidUntil: v.insuranceValidUntil,
        allergenTrainingUntil: v.allergenTrainingUntil,
        lastNotifiedState: v.lastNotifiedState,
        lastNotifiedAt: v.lastNotifiedAt,
      };
    });

    return { totalVendors: liveVendors.length, counts, rows };
  }

  /**
   * Admin upsert of a vendor's verification record.
   *
   * Fires a notification on every transition into an actionable state
   * (RENEWAL_DUE, SUSPENDED). Transitions into VERIFIED are silent --
   * the enforcement-lifted email covers those when they originate from
   * an enforcement lift; for a direct upsert to VERIFIED, no email is
   * appropriate. Repeated upserts with an unchanged state are no-ops
   * for notifications.
   */
  async upsertVerification(vendorId: string, dto: UpsertVerificationDto) {
    // Fetch current state and notification tracking before the write.
    const existing = await this.prisma.vendorVerification.findUnique({
      where: { vendorId },
      select: {
        overallState: true,
        lastNotifiedState: true,
        lastNotifiedAt: true,
      },
    });
    const previousState = existing?.overallState ?? null;

    const data = {
      registrationNumber: dto.registrationNumber,
      registrationAuthority: dto.registrationAuthority,
      registrationConfirmedAt: new Date(dto.registrationConfirmedAt),
      fhrsRating: dto.fhrsRating ?? null,
      fhrsRatingCheckedAt: dto.fhrsRatingCheckedAt ? new Date(dto.fhrsRatingCheckedAt) : null,
      fhrsInspectionStatus: dto.fhrsInspectionStatus,
      insuranceProvider: dto.insuranceProvider ?? null,
      insuranceValidUntil: dto.insuranceValidUntil ? new Date(dto.insuranceValidUntil) : null,
      allergenTrainingHeld: dto.allergenTrainingHeld,
      allergenTrainingUntil: dto.allergenTrainingUntil
        ? new Date(dto.allergenTrainingUntil)
        : null,
      idVerifiedAt: dto.idVerifiedAt ? new Date(dto.idVerifiedAt) : null,
      overallState: dto.overallState,
    };
    const result = await this.prisma.vendorVerification.upsert({
      where: { vendorId },
      create: { vendorId, ...data },
      update: data,
    });

    // Derive expiring fields from the DTO dates for the renewal email payload.
    const expiringFields = this.deriveExpiringFields(dto);

    await this.maybeNotifyStateChange(vendorId, previousState, dto.overallState, existing, {
      expiringFields,
    });

    return result;
  }

  /**
   * Daily job. Checks every VendorVerification row for upcoming or passed
   * expiry, then transitions overallState and optionally suspends the listing.
   *
   * Rules (matching Vendor Terms):
   *   Insurance or allergen training expiring <= 30 days: RENEWAL_DUE + email.
   *   Insurance or allergen training expired >= 7 days ago (and no renewal):
   *     SUSPENDED + listing hidden + vendor email.
   *   FHRS rating drops below 3 (RATED status): SUSPENDED immediately + admin alert.
   */
  async runVerificationScan(): Promise<{ renewalNotified: number; suspended: number }> {
    const now = new Date();
    const in30 = new Date(now.getTime() + RENEWAL_WARNING_DAYS * 86_400_000);
    const minus7 = new Date(now.getTime() - SUSPENSION_GRACE_DAYS * 86_400_000);

    const rows = await this.prisma.vendorVerification.findMany({
      where: { overallState: { not: VerificationState.SUSPENDED } },
      include: {
        vendor: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            status: true,
          },
        },
      },
    });

    let renewalNotified = 0;
    let suspended = 0;

    for (const v of rows) {
      const expiringLabels: string[] = [];
      const hardExpiredLabels: string[] = [];

      if (v.insuranceValidUntil) {
        if (v.insuranceValidUntil < minus7) hardExpiredLabels.push('public liability insurance');
        else if (v.insuranceValidUntil < now) { /* within grace - already RENEWAL_DUE */ }
        else if (v.insuranceValidUntil < in30) expiringLabels.push('public liability insurance');
      }

      if (v.allergenTrainingUntil) {
        if (v.allergenTrainingUntil < minus7) hardExpiredLabels.push('allergen training');
        else if (v.allergenTrainingUntil < now) { /* within grace */ }
        else if (v.allergenTrainingUntil < in30) expiringLabels.push('allergen training');
      }

      const lowFhrs =
        v.fhrsInspectionStatus === FhrsStatus.RATED && (v.fhrsRating ?? 5) < 3;

      if (hardExpiredLabels.length > 0 || lowFhrs) {
        // Route through VendorEnforcementService so every automated suspension
        // gets a P2B-compliant reasonNarrative, noticeSentAt, and notice email
        // (vendor terms clause 14.1). The enforcement service updates
        // Vendor.status and VendorVerification.overallState atomically.
        const reasonCode = lowFhrs ? 'FHRS_BELOW_THRESHOLD' : 'DOCUMENT_EXPIRED';
        const humanReason = lowFhrs
          ? 'FHRS hygiene rating is below the minimum threshold of 3 out of 5'
          : `compliance document(s) expired: ${hardExpiredLabels.join(', ')}`;
        try {
          await this.enforcement.createAutomatedSuspension(v.vendor.id, reasonCode, humanReason);
        } catch (err) {
          this.logger.error(
            `Failed to create enforcement action for vendor ${v.vendor.id}: ${(err as Error).message}`,
          );
        }
        suspended++;
      } else if (expiringLabels.length > 0 && v.overallState !== VerificationState.RENEWAL_DUE) {
        const previousState = v.overallState;
        await this.prisma.vendorVerification.update({
          where: { id: v.id },
          data: { overallState: VerificationState.RENEWAL_DUE },
        });
        // Use maybeNotifyStateChange so tracking is written alongside the email.
        // Pass existing tracking fields from the loaded row.
        await this.maybeNotifyStateChange(
          v.vendor.id,
          previousState,
          VerificationState.RENEWAL_DUE,
          { lastNotifiedState: v.lastNotifiedState, lastNotifiedAt: v.lastNotifiedAt },
          { expiringFields: expiringLabels },
        );
        renewalNotified++;
      }
    }

    this.logger.log(`verification-scan: renewalNotified=${renewalNotified} suspended=${suspended}`);
    return { renewalNotified, suspended };
  }

  // suspendVendor() removed: all automated suspensions now go through
  // VendorEnforcementService.createAutomatedSuspension() which enforces
  // P2B notice rules, writes a compliant audit record, and sends the
  // statement of reasons to the vendor (clause 14.1).

  /**
   * Weekly job. Polls the FSA Open Data API for each RATED vendor and
   * refreshes fhrsRating + fhrsRatingCheckedAt.
   *
   * Looks up by registration number via the LocalAuthorityBusinessId search
   * param. Best-effort: a failed fetch leaves existing data untouched.
   * Ratings older than 90 days are not purged here - the VerificationPanel
   * shows the check date so customers can judge freshness.
   */
  async runFsaRefresh(): Promise<{ updated: number }> {
    const rows = await this.prisma.vendorVerification.findMany({
      where: { fhrsInspectionStatus: FhrsStatus.RATED },
      select: { id: true, registrationNumber: true },
    });

    let updated = 0;
    for (const v of rows) {
      try {
        const url =
          `https://api.ratings.food.gov.uk/Establishments` +
          `?LocalAuthorityBusinessId=${encodeURIComponent(v.registrationNumber)}&pageSize=1`;
        const res = await fetch(url, {
          headers: { 'x-api-version': '2', accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          establishments?: Array<{ RatingValue?: string | null }>;
        };
        const est = json.establishments?.[0];
        if (!est) continue;
        const ratingStr = est.RatingValue;
        const rating =
          ratingStr != null && ratingStr !== 'AwaitingInspection' && !isNaN(Number(ratingStr))
            ? Number(ratingStr)
            : null;
        await this.prisma.vendorVerification.update({
          where: { id: v.id },
          data: { fhrsRating: rating, fhrsRatingCheckedAt: new Date() },
        });
        updated++;
      } catch (e) {
        this.logger.warn(
          `FSA refresh skipped for reg ${v.registrationNumber}: ${(e as Error).message}`,
        );
      }
    }

    this.logger.log(`fsa-refresh: updated=${updated}`);
    return { updated };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Fire a notification whenever overallState transitions into an actionable
   * state (RENEWAL_DUE or SUSPENDED). Idempotent: repeated writes to the same
   * state do not produce duplicate emails.
   *
   * Idempotency is two-layered:
   *   1. previousState === newState (no transition) -> skip.
   *   2. lastNotifiedState === newState within DEDUP_WINDOW_MS -> skip
   *      (rapid succession: admin saves twice, cron re-runs within the hour).
   *
   * After a send the tracking columns (lastNotifiedState, lastNotifiedAt,
   * lastNotifiedChannel) are written so support can answer "was she told?"
   * definitively, and so the next call can apply layer-2 dedup.
   *
   * Missing userId: logged at ERROR level and surfaced - never silently ignored.
   */
  private async maybeNotifyStateChange(
    vendorId: string,
    previousState: VerificationState | null,
    newState: VerificationState,
    existing: { lastNotifiedState: VerificationState | null; lastNotifiedAt: Date | null } | null,
    meta: { expiringFields?: string[] } = {},
  ): Promise<void> {
    // Only notify on actionable states.
    if (!NOTIFY_ON_STATES.has(newState)) return;

    // No transition - upsert left the state unchanged.
    if (previousState === newState) return;

    // Dedup: same end-state notified very recently (rapid identical upserts).
    if (
      existing?.lastNotifiedState === newState &&
      existing.lastNotifiedAt != null &&
      Date.now() - existing.lastNotifiedAt.getTime() < DEDUP_WINDOW_MS
    ) {
      this.logger.warn(
        `[verification-notify] dedup: vendor=${vendorId} state=${newState} ` +
          `already notified ${Date.now() - existing.lastNotifiedAt.getTime()}ms ago -- skipping`,
      );
      return;
    }

    // Load vendor contact details.
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true, businessName: true },
    });

    if (!vendor?.userId) {
      // Log loudly - the admin UI should surface this so someone follows up.
      this.logger.error(
        `[verification-notify] vendor=${vendorId} has no userId -- ` +
          `cannot send ${newState} notification. Admin must contact vendor directly.`,
      );
      return;
    }

    // Deterministic Bull jobId: at most one notification per vendor per state
    // per calendar day, preventing duplicates even if the job is re-enqueued
    // while a prior instance is still queued.
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const jobId = `verification_state:${vendorId}:${newState}:${dateSuffix}`;

    if (newState === VerificationState.RENEWAL_DUE) {
      await this.notifications.enqueue(
        'verification_renewal_due',
        {
          userId: vendor.userId,
          vendorName: vendor.businessName,
          expiringFields: meta.expiringFields ?? [],
          complianceEmail: PLATFORM_FACTS.contact.complianceEmail,
        },
        { jobId },
      );
    } else if (newState === VerificationState.SUSPENDED) {
      // Count active orders the vendor must still fulfil -- this is the first
      // thing a suspended vendor will ask about.
      const pendingOrderCount = await this.prisma.order.count({
        where: { vendorId, status: { in: ACTIVE_ORDER_STATUSES } },
      });
      await this.notifications.enqueue(
        'verification_suspended',
        {
          userId: vendor.userId,
          vendorName: vendor.businessName,
          pendingOrderCount,
          appealWindowDays: PLATFORM_FACTS.appealWindowDays,
          appealsEmail: PLATFORM_FACTS.contact.appealsEmail,
          complianceEmail: PLATFORM_FACTS.contact.complianceEmail,
        },
        { jobId },
      );
    }

    // Record the send so support can answer "was I told?" and so the next call
    // can apply dedup.
    await this.prisma.vendorVerification.update({
      where: { vendorId },
      data: {
        lastNotifiedState: newState,
        lastNotifiedAt: new Date(),
        lastNotifiedChannel: 'email',
      },
    });

    this.logger.log(
      `[verification-notify] sent state=${newState} vendor=${vendorId} jobId=${jobId}`,
    );
  }

  /**
   * Derive which verification documents are expiring from the upsert DTO so
   * the renewal email can name them specifically even on a manual admin upsert.
   */
  private deriveExpiringFields(dto: UpsertVerificationDto): string[] {
    const now = new Date();
    const in30 = new Date(now.getTime() + RENEWAL_WARNING_DAYS * 86_400_000);
    const labels: string[] = [];
    if (dto.insuranceValidUntil) {
      const d = new Date(dto.insuranceValidUntil);
      if (d < in30) labels.push('public liability insurance');
    }
    if (dto.allergenTrainingUntil) {
      const d = new Date(dto.allergenTrainingUntil);
      if (d < in30) labels.push('allergen training');
    }
    return labels;
  }
}
