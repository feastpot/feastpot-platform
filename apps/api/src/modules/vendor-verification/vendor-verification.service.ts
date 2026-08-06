import { Injectable, Logger } from '@nestjs/common';
import { FhrsStatus, VerificationState, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  ) {}

  getVerification(vendorId: string) {
    return this.prisma.vendorVerification.findUnique({ where: { vendorId } });
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
        await this.suspendVendor(v.id, v.vendor, lowFhrs ? 'FHRS hygiene rating below 3/5' : hardExpiredLabels.join(', '));
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

  private async suspendVendor(
    verificationId: string,
    vendor: { id: string; userId: string; businessName: string; status: VendorStatus },
    reason: string,
  ) {
    await this.prisma.vendorVerification.update({
      where: { id: verificationId },
      data: { overallState: VerificationState.SUSPENDED },
    });
    // Only change listing status if currently live or probation.
    if (vendor.status === VendorStatus.live || vendor.status === VendorStatus.probation) {
      await this.prisma.vendor.update({
        where: { id: vendor.id },
        data: { status: VendorStatus.suspended },
      });
    }
    await this.notifications.enqueue('verification_suspended', {
      userId: vendor.userId,
      vendorName: vendor.businessName,
      reason,
    });
    this.logger.warn(`Vendor ${vendor.id} suspended: ${reason}`);
  }

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
