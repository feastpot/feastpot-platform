import { createHash } from 'crypto';

import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AcceptanceMethod, NoticeChannel, TermsDocumentType } from '@prisma/client';
import type { Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { TERMS_NOTICES_QUEUE } from '../../queues/queues.module';

import { AcceptTermsVersionDto } from './dto/accept-terms-version.dto';
import { PublishTermsVersionDto } from './dto/publish-terms-version.dto';

export const SEND_TERMS_NOTICES_JOB = 'send_terms_notices';
export const GENERATE_ACCEPTANCE_PDF_JOB = 'generate_acceptance_pdf';
export const DEEMED_ACCEPTANCE_CRON_JOB = 'deemed_acceptance_sweep';

/** Minimum notice period in days (P2B Regulation, UK retained). */
const MIN_NOTICE_DAYS = 15;

@Injectable()
export class TermsService {
  private readonly logger = new Logger(TermsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TERMS_NOTICES_QUEUE) private readonly noticesQueue: Queue,
  ) {}

  // ─── Publishing ─────────────────────────────────────────────────────────────

  /**
   * Publish a new terms version.
   *
   * Hard rules enforced here (not in a process document):
   *
   * 1. contentHash is SHA-256 of contentMdx, computed on publish. Once a
   *    version is published the content is immutable -- any correction requires
   *    a new version row.
   *
   * 2. isMaterial=true requires effectiveAt >= 15 days after now. This is the
   *    P2B Regulation notice requirement. Failing it voids the change.
   *
   * 3. isMaterial=false is reserved for editorial changes (typo fixes that do
   *    not alter meaning). The changeSummary must explain why; it is logged.
   *
   * 4. Only one version per documentType may be live (supersededAt IS NULL)
   *    at a time. Publishing sets supersededAt on the previous live version.
   *
   * 5. VENDOR_TERMS requires solicitorSignOff ("Reviewed and approved by
   *    [solicitor] on [date]"). Rejected without it.
   */
  async publishVersion(dto: PublishTermsVersionDto) {
    const now = new Date();

    // Rule 1: Compute content hash; reject if contentMdx is empty.
    if (!dto.contentMdx.trim()) {
      throw new BadRequestException('contentMdx must not be empty.');
    }
    const contentHash = createHash('sha256').update(dto.contentMdx, 'utf8').digest('hex');

    // Rule 2: Notice period for material changes.
    if (dto.isMaterial) {
      const effectiveAt = new Date(dto.effectiveAt);
      const minEffectiveAt = new Date(now);
      minEffectiveAt.setDate(minEffectiveAt.getDate() + MIN_NOTICE_DAYS);
      if (effectiveAt < minEffectiveAt) {
        throw new BadRequestException(
          `[P2B] isMaterial=true requires effectiveAt to be at least ${MIN_NOTICE_DAYS} days ` +
            `after the publish date. Earliest allowed: ${minEffectiveAt.toISOString().slice(0, 10)}.`,
        );
      }
    }

    // Rule 3: Editorial changes require a written justification.
    if (!dto.isMaterial) {
      this.logger.warn(
        `[terms] EDITORIAL publish: version=${dto.version} type=${dto.documentType} ` +
          `createdBy=${dto.createdBy} justification="${dto.changeSummary}"`,
      );
    }

    // Rule 5: VENDOR_TERMS must have solicitor sign-off.
    if (dto.documentType === TermsDocumentType.VENDOR_TERMS && !dto.solicitorSignOff) {
      throw new BadRequestException(
        'VENDOR_TERMS versions must include solicitorSignOff ' +
          '("Reviewed and approved by [solicitor name] on [date]"). ' +
          'This process control ensures no unreviewed draft reaches production.',
      );
    }

    // Rule 4: Supersede the previous live version inside a transaction.
    const termsVersion = await this.prisma.$transaction(async (tx) => {
      // Mark the current live version as superseded.
      await tx.termsVersion.updateMany({
        where: { documentType: dto.documentType, supersededAt: null },
        data: { supersededAt: now },
      });

      return tx.termsVersion.create({
        data: {
          documentType: dto.documentType,
          version: dto.version,
          contentMdx: dto.contentMdx,
          contentHash,
          changeSummary: dto.changeSummary,
          isMaterial: dto.isMaterial,
          publishedAt: now,
          effectiveAt: new Date(dto.effectiveAt),
          createdBy: dto.createdBy,
          solicitorSignOff: dto.solicitorSignOff,
        },
      });
    });

    this.logger.log(
      `[terms] published version=${termsVersion.version} type=${termsVersion.documentType} ` +
        `isMaterial=${termsVersion.isMaterial} effectiveAt=${termsVersion.effectiveAt.toISOString()} ` +
        `hash=${contentHash.slice(0, 12)} id=${termsVersion.id}`,
    );

    // Enqueue bulk notice delivery to all active vendors (material changes only).
    if (dto.isMaterial) {
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
    }

    return termsVersion;
  }

  // ─── Reading ────────────────────────────────────────────────────────────────

  /** List all published versions for a document type, newest first. */
  async listVersions(documentType: TermsDocumentType) {
    return this.prisma.termsVersion.findMany({
      where: { documentType },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        version: true,
        documentType: true,
        changeSummary: true,
        isMaterial: true,
        publishedAt: true,
        effectiveAt: true,
        supersededAt: true,
        contentHash: true,
        // Omit contentMdx from the list endpoint (it can be large).
      },
    });
  }

  /**
   * Get the currently live version for a document type with its full content.
   * "Live" = effectiveAt <= now AND supersededAt IS NULL.
   */
  async getCurrentVersion(documentType: TermsDocumentType) {
    const now = new Date();
    return this.prisma.termsVersion.findFirst({
      where: {
        documentType,
        effectiveAt: { lte: now },
        supersededAt: null,
      },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  /**
   * Current version (most recently effective) plus any pending version
   * (effectiveAt in the future). Returns whichever is applicable.
   */
  async getVersionsForVendorView(documentType: TermsDocumentType, vendorId: string) {
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
      current: current ? { ...current, accepted: acceptedIds.has(current.id) } : null,
      pending: pending ? { ...pending, accepted: acceptedIds.has(pending.id) } : null,
    };
  }

  /** Full acceptance + change history for the vendor dashboard. */
  async getHistoryForVendor(documentType: TermsDocumentType, vendorId: string) {
    const versions = await this.prisma.termsVersion.findMany({
      where: { documentType },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        version: true,
        changeSummary: true,
        isMaterial: true,
        publishedAt: true,
        effectiveAt: true,
        supersededAt: true,
        contentHash: true,
      },
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

  // ─── Acceptance ─────────────────────────────────────────────────────────────

  /**
   * Record click-wrap acceptance.
   *
   * Rules (LEGAL-500):
   * - Acceptances are append-only. There is no update or delete path for
   *   TermsAcceptance. The upsert below only creates on first call; a
   *   subsequent call for the same vendorId+versionId is a no-op (update: {}).
   * - All nine audit fields are populated on every new acceptance.
   * - The write occurs inside the same transaction that activates the vendor
   *   account when called from the onboarding flow (see VendorsService).
   */
  async acceptVersion(
    vendorId: string,
    termsVersionId: string,
    dto: AcceptTermsVersionDto,
    ipAddress?: string,
    userAgent?: string,
    tx?: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ) {
    const db = tx ?? this.prisma;

    // Verify the version exists and get its contentHash.
    const version = await db.termsVersion.findUniqueOrThrow({ where: { id: termsVersionId } });

    return db.termsAcceptance.upsert({
      where: { vendorId_termsVersionId: { vendorId, termsVersionId } },
      create: {
        vendorId,
        termsVersionId,
        ipAddress,
        userAgent,
        acceptanceText: dto.acceptanceText,
        contentHash: version.contentHash,
        scrolledToEnd: dto.scrolledToEnd,
        method: 'CLICKWRAP',
      },
      update: {}, // Append-only: never mutate an existing acceptance record.
    });
  }

  /**
   * Check whether a vendor has accepted the current live version.
   * Used by the onboarding gate to decide whether to show the terms step.
   */
  async hasAcceptedCurrentVersion(
    vendorId: string,
    documentType: TermsDocumentType = TermsDocumentType.VENDOR_TERMS,
  ): Promise<boolean> {
    const current = await this.getCurrentVersion(documentType);
    if (!current) return true; // No live version published yet -- nothing to gate on.

    const acceptance = await this.prisma.termsAcceptance.findUnique({
      where: { vendorId_termsVersionId: { vendorId, termsVersionId: current.id } },
      select: { id: true },
    });
    return !!acceptance;
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

  // ─── Rate Schedule (public) ──────────────────────────────────────────────────

  /**
   * Return the canonical Rate Schedule from the live RATE_SCHEDULE TermsVersion.
   *
   * This endpoint is intentionally public (no auth required) because UK P2B
   * Regulation requires rate information to be "available at all stages
   * including before contracting", i.e. on the marketing page before a vendor
   * has an account.
   *
   * Returns rows sorted by sortOrder. All statuses are included so the client
   * can render sections (LIVE rates, PLANNED changes, CUSTOMER_SIDE transparency
   * entries, etc.) without a second API call.
   */
  async getRateSchedule() {
    const liveVersion = await this.prisma.termsVersion.findFirst({
      where: { documentType: TermsDocumentType.RATE_SCHEDULE, supersededAt: null },
      orderBy: { effectiveAt: 'desc' },
    });

    if (!liveVersion) return [];

    const entries = await this.prisma.rateScheduleEntry.findMany({
      where: { versionId: liveVersion.id },
      orderBy: { sortOrder: 'asc' },
    });

    return entries.map((e) => ({
      key: e.key,
      label: e.label,
      rateDisplay: e.rateDisplay,
      rateValue: e.rateValue != null ? parseFloat(e.rateValue.toString()) : null,
      basis: e.basis,
      vatNote: e.vatNote,
      status: e.status,
      sortOrder: e.sortOrder,
    }));
  }

  // ─── Change Notices (Dashboard) ──────────────────────────────────────────────

  /**
   * Return DASHBOARD notices for this vendor that have not yet been
   * acknowledged. These are created by the processor when a material version
   * is published and persist until the vendor explicitly acknowledges.
   */
  async getDashboardNotices(vendorId: string) {
    return this.prisma.termsNotice.findMany({
      where: { vendorId, channel: NoticeChannel.DASHBOARD, acknowledgedAt: null },
      include: {
        termsVersion: {
          select: {
            id: true,
            version: true,
            effectiveAt: true,
            changeSummary: true,
            documentType: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  /**
   * Mark a DASHBOARD notice as acknowledged. Only the owning vendor may
   * acknowledge their own notice.
   */
  async acknowledgeNotice(noticeId: string, vendorId: string) {
    const notice = await this.prisma.termsNotice.findUnique({ where: { id: noticeId } });
    if (!notice || notice.vendorId !== vendorId) {
      throw new NotFoundException('Notice not found.');
    }
    return this.prisma.termsNotice.update({
      where: { id: noticeId },
      data: { acknowledgedAt: new Date() },
    });
  }

  // ─── Deemed Continued Use ────────────────────────────────────────────────────

  /**
   * Record a DEEMED_CONTINUED_USE acceptance.
   *
   * Called by the nightly cron sweep when a vendor has traded (completed or
   * accepted at least one order) after the effectiveAt of a terms version
   * they have not explicitly accepted.
   *
   * The specific action relied on (orderId + timestamp) is stored in
   * acceptanceText so auditors can reconstruct the factual basis.
   *
   * Explicit click-wrap is always preferred: this method is an honest audit
   * record, not a substitute for prompting re-acceptance.
   */
  async recordDeemedAcceptance(
    vendorId: string,
    termsVersionId: string,
    reliedOnOrderId: string,
    reliedOnAt: Date,
    ipAddress?: string,
  ) {
    const version = await this.prisma.termsVersion.findUniqueOrThrow({
      where: { id: termsVersionId },
    });

    const acceptanceText =
      `Deemed acceptance by continued use. ` +
      `Relied on: orderId=${reliedOnOrderId} at ${reliedOnAt.toISOString()}.`;

    this.logger.log(
      `[terms] DEEMED_CONTINUED_USE vendorId=${vendorId} ` +
        `versionId=${termsVersionId} orderId=${reliedOnOrderId}`,
    );

    return this.prisma.termsAcceptance.upsert({
      where: { vendorId_termsVersionId: { vendorId, termsVersionId } },
      create: {
        vendorId,
        termsVersionId,
        ipAddress,
        userAgent: 'system/deemed-continued-use',
        acceptanceText,
        contentHash: version.contentHash,
        scrolledToEnd: false,
        method: AcceptanceMethod.DEEMED_CONTINUED_USE,
      },
      update: {}, // Never overwrite an existing explicit acceptance.
    });
  }

  // ─── Rate Schedule Integration ───────────────────────────────────────────────

  /**
   * Auto-publish a RATE_SCHEDULE terms version when the admin creates a new
   * commission rate. This wires the rate change form to the legal notice
   * engine so that a rate cannot change without triggering the 15-day P2B
   * notice to vendors.
   *
   * The contentMdx is generated from the rate change data. RATE_SCHEDULE
   * versions do not require solicitorSignOff (they are commercial schedule
   * changes, not contractual term changes requiring legal review).
   */
  async publishRateScheduleVersion(opts: {
    source: string;
    isFirstOrder: boolean | null;
    newRatePct: number;
    previousRatePct: number;
    effectiveFrom: Date;
    createdBy: string;
    note?: string;
  }) {
    const { source, isFirstOrder, newRatePct, previousRatePct, effectiveFrom, createdBy, note } =
      opts;

    const segmentLabel =
      source === 'VENDOR_REFERRED'
        ? 'Vendor-referred orders (all)'
        : isFirstOrder === true
          ? 'Marketplace – first order from a customer'
          : isFirstOrder === false
            ? 'Marketplace – repeat order from a customer'
            : `${source} orders`;

    const direction = newRatePct > previousRatePct ? 'increase' : 'decrease';
    const effectiveDateStr = effectiveFrom.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const contentMdx = [
      `# Rate Schedule Update: effective ${effectiveDateStr}`,
      '',
      `This update amends Annex A (Rate Schedule) of the Feastpot Vendor Terms of Agreement.`,
      '',
      `## What is changing`,
      '',
      `| Segment | Previous rate | New rate | Effective from |`,
      `|---------|--------------|----------|---------------|`,
      `| ${segmentLabel} | ${previousRatePct}% | ${newRatePct}% | ${effectiveDateStr} |`,
      '',
      `## Why`,
      '',
      note ?? `This rate ${direction} reflects a change to the Feastpot commission schedule.`,
      '',
      `## Your rights`,
      '',
      `Under the UK P2B Regulation, you may terminate your vendor agreement without penalty ` +
        `before ${effectiveDateStr} by emailing compliance@feastpot.co.uk with the subject ` +
        `"Vendor termination". Continuing to trade after that date constitutes acceptance of ` +
        `the new rate.`,
    ].join('\n');

    // Use the full publishVersion path so all five hard rules apply (including
    // the 15-day P2B check, which the admin rate form already validates).
    const dto: PublishTermsVersionDto = {
      documentType: TermsDocumentType.RATE_SCHEDULE,
      version: `RS-${effectiveFrom.toISOString().slice(0, 10)}`,
      contentMdx,
      changeSummary:
        `Commission rate ${direction} for ${segmentLabel}: ` +
        `${previousRatePct}% → ${newRatePct}%, effective ${effectiveDateStr}.`,
      isMaterial: true,
      effectiveAt: effectiveFrom.toISOString(),
      createdBy,
      // RATE_SCHEDULE does not require solicitorSignOff (Rule 5 is scoped to
      // VENDOR_TERMS). We pass undefined deliberately.
      solicitorSignOff: undefined,
    };

    return this.publishVersion(dto);
  }
}
