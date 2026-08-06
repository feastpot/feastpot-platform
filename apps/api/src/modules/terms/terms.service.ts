import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TermsDocumentType } from '@prisma/client';
import type { Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { TERMS_NOTICES_QUEUE } from '../../queues/queues.module';

import { PublishTermsVersionDto } from './dto/publish-terms-version.dto';

export const SEND_TERMS_NOTICES_JOB = 'send_terms_notices';

/** Minimum notice period in days (P2B Regulation, UK retained). */
const MIN_NOTICE_DAYS = 15;

@Injectable()
export class TermsService {
  private readonly logger = new Logger(TermsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TERMS_NOTICES_QUEUE) private readonly noticesQueue: Queue,
  ) {}

  /**
   * Publish a new terms version.
   *
   * Hard validation: effectiveAt must be at least MIN_NOTICE_DAYS after now
   * (the publish instant). This is not a warning -- the P2B Regulation
   * requires the notice period to be observed; failing it voids the change.
   */
  async publishVersion(dto: PublishTermsVersionDto) {
    const now = new Date();
    const effectiveAt = new Date(dto.effectiveAt);
    const minEffectiveAt = new Date(now);
    minEffectiveAt.setDate(minEffectiveAt.getDate() + MIN_NOTICE_DAYS);

    if (effectiveAt < minEffectiveAt) {
      throw new BadRequestException(
        `effectiveAt must be at least ${MIN_NOTICE_DAYS} days after the publish date ` +
          `(earliest allowed: ${minEffectiveAt.toISOString().slice(0, 10)}).`,
      );
    }

    const termsVersion = await this.prisma.termsVersion.create({
      data: {
        documentType: dto.documentType,
        version: dto.version,
        contentHash: dto.contentHash,
        summary: dto.summary,
        publishedAt: now,
        effectiveAt,
      },
    });

    this.logger.log(
      `[terms] published version=${termsVersion.version} type=${termsVersion.documentType} ` +
        `effectiveAt=${termsVersion.effectiveAt.toISOString()} id=${termsVersion.id}`,
    );

    // Enqueue bulk notice delivery to all active vendors.
    await this.noticesQueue.add(
      SEND_TERMS_NOTICES_JOB,
      { termsVersionId: termsVersion.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 500,
        removeOnFail: 200,
      },
    );

    return termsVersion;
  }

  /** List all published versions for a document type, newest first. */
  async listVersions(documentType: TermsDocumentType) {
    return this.prisma.termsVersion.findMany({
      where: { documentType },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * Current version (most recently effective) plus any pending version
   * (effectiveAt in the future). Returns whichever is applicable.
   */
  async getVersionsForVendorView(
    documentType: TermsDocumentType,
    vendorId: string,
  ) {
    const now = new Date();

    const [current, pending] = await Promise.all([
      this.prisma.termsVersion.findFirst({
        where: { documentType, effectiveAt: { lte: now } },
        orderBy: { effectiveAt: 'desc' },
      }),
      this.prisma.termsVersion.findFirst({
        where: { documentType, effectiveAt: { gt: now } },
        orderBy: { effectiveAt: 'asc' },
      }),
    ]);

    // Determine which versions this vendor has already accepted.
    const versionIds = [current?.id, pending?.id].filter(Boolean) as string[];
    const acceptances =
      versionIds.length > 0
        ? await this.prisma.termsAcceptance.findMany({
            where: { vendorId, termsVersionId: { in: versionIds } },
            select: { termsVersionId: true, acceptedAt: true },
          })
        : [];
    const acceptedIds = new Set(acceptances.map((a) => a.termsVersionId));

    return {
      current: current
        ? { ...current, accepted: acceptedIds.has(current.id) }
        : null,
      pending: pending
        ? { ...pending, accepted: acceptedIds.has(pending.id) }
        : null,
    };
  }

  /** Full acceptance + change history for the vendor dashboard. */
  async getHistoryForVendor(documentType: TermsDocumentType, vendorId: string) {
    const versions = await this.prisma.termsVersion.findMany({
      where: { documentType },
      orderBy: { publishedAt: 'desc' },
    });

    const acceptances = await this.prisma.termsAcceptance.findMany({
      where: { vendorId, termsVersionId: { in: versions.map((v) => v.id) } },
      select: { termsVersionId: true, acceptedAt: true },
    });
    const acceptanceMap = new Map(acceptances.map((a) => [a.termsVersionId, a.acceptedAt]));

    return versions.map((v) => ({
      ...v,
      acceptedAt: acceptanceMap.get(v.id) ?? null,
    }));
  }

  /** Accept a terms version on behalf of a vendor. Idempotent. */
  async acceptVersion(vendorId: string, termsVersionId: string, ipAddress?: string) {
    // Verify the version exists.
    await this.prisma.termsVersion.findUniqueOrThrow({ where: { id: termsVersionId } });

    return this.prisma.termsAcceptance.upsert({
      where: { vendorId_termsVersionId: { vendorId, termsVersionId } },
      create: { vendorId, termsVersionId, ipAddress },
      update: {},
    });
  }

  /** Return all pending (future-effective) versions not yet accepted by the vendor. */
  async getPendingForVendor(
    vendorId: string,
    documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ) {
    const now = new Date();
    const pending = await this.prisma.termsVersion.findMany({
      where: { documentType, effectiveAt: { gt: now } },
    });
    if (pending.length === 0) return [];

    const accepted = await this.prisma.termsAcceptance.findMany({
      where: { vendorId, termsVersionId: { in: pending.map((v) => v.id) } },
      select: { termsVersionId: true },
    });
    const acceptedIds = new Set(accepted.map((a) => a.termsVersionId));
    return pending.filter((v) => !acceptedIds.has(v.id));
  }
}
