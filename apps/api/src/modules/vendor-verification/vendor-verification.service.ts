import { Injectable, Logger } from '@nestjs/common';
import { FhrsStatus, VerificationState, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VendorEnforcementService } from '../vendor-enforcement/vendor-enforcement.service';

import type { UpsertVerificationDto } from './dto/upsert-verification.dto';

const RENEWAL_WARNING_DAYS = 30;
/** Days after first reminder before we auto-suspend for non-renewal. */
const SUSPENSION_GRACE_DAYS = 7;

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
   * Returns counts + rows for:
   *   - Live/probation vendors with no VendorVerification record
   *   - Vendors with overallState = RENEWAL_DUE
   *   - Vendors with overallState = SUSPENDED
   */
  async getVerificationSummary() {
    // All live/probation vendors
    const liveVendors = await this.prisma.vendor.findMany({
      where: { status: { in: [VendorStatus.live, VendorStatus.probation] } },
      select: { id: true, businessName: true },
    });

    // All verification records for live/probation vendors
    const verifications = await this.prisma.vendorVerification.findMany({
      where: { vendorId: { in: liveVendors.map((v) => v.id) } },
      select: {
        vendorId: true,
        overallState: true,
        insuranceValidUntil: true,
        allergenTrainingUntil: true,
      },
    });

    const verificationByVendorId = new Map(verifications.map((v) => [v.vendorId, v]));

    const notSetUp: Array<{ vendorId: string; vendorName: string }> = [];
    const renewalDue: Array<{
      vendorId: string;
      vendorName: string;
      insuranceValidUntil: Date | null;
      allergenTrainingUntil: Date | null;
    }> = [];
    const suspended: Array<{ vendorId: string; vendorName: string }> = [];

    for (const vendor of liveVendors) {
      const v = verificationByVendorId.get(vendor.id);
      if (!v) {
        notSetUp.push({ vendorId: vendor.id, vendorName: vendor.businessName });
      } else if (v.overallState === VerificationState.RENEWAL_DUE) {
        renewalDue.push({
          vendorId: vendor.id,
          vendorName: vendor.businessName,
          insuranceValidUntil: v.insuranceValidUntil,
          allergenTrainingUntil: v.allergenTrainingUntil,
        });
      } else if (v.overallState === VerificationState.SUSPENDED) {
        suspended.push({ vendorId: vendor.id, vendorName: vendor.businessName });
      }
    }

    return {
      counts: {
        notSetUp: notSetUp.length,
        renewalDue: renewalDue.length,
        suspended: suspended.length,
      },
      notSetUp,
      renewalDue,
      suspended,
    };
  }

  upsertVerification(vendorId: string, dto: UpsertVerificationDto) {
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
    return this.prisma.vendorVerification.upsert({
      where: { vendorId },
      create: { vendorId, ...data },
      update: data,
    });
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
        await this.prisma.vendorVerification.update({
          where: { id: v.id },
          data: { overallState: VerificationState.RENEWAL_DUE },
        });
        await this.notifications.enqueue('verification_renewal_due', {
          userId: v.vendor.userId,
          vendorName: v.vendor.businessName,
          expiringFields: expiringLabels,
        });
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
}
