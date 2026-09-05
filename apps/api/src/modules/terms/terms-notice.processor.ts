import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { OnApplicationBootstrap, Logger } from '@nestjs/common';
import { NoticeChannel, OrderStatus } from '@prisma/client';
import type { Job, Queue } from 'bull';
import PDFDocument from 'pdfkit';

import { PrismaService } from '../../prisma/prisma.service';
import { TERMS_NOTICES_QUEUE } from '../../queues/queues.module';
import { EmailProvider } from '../notifications/providers/email.provider';

import {
  DEEMED_ACCEPTANCE_CRON_JOB,
  GENERATE_ACCEPTANCE_PDF_JOB,
  SEND_TERMS_NOTICES_JOB,
} from './terms.service';
import { TERMS_NOTICE_JOBS } from './terms-jobs';

interface TermsNoticesJobData {
  termsVersionId: string;
}

interface AcceptancePdfJobData {
  acceptanceId: string;
}

interface ResendSingleNoticeJobData {
  noticeId: string;
  vendorId: string;
  termsVersionId: string;
}

const DEEMED_ACCEPTANCE_CRON = '0 2 * * *'; // 02:00 UTC every day.

@Processor(TERMS_NOTICES_QUEUE)
export class TermsNoticeProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(TermsNoticeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    @InjectQueue(TERMS_NOTICES_QUEUE) private readonly noticesQueue: Queue,
  ) {}

  onApplicationBootstrap() {
    void this.registerDeemedAcceptanceCron();
  }

  private async registerDeemedAcceptanceCron(): Promise<void> {
    try {
      // Remove stale repeatable-job entries before re-registering to prevent
      // duplicate accumulation across restarts (same pattern fixed across all
      // cron processors: each boot without this guard appends another copy).
      const existing = await this.noticesQueue.getRepeatableJobs();
      for (const job of existing.filter((j) => j.name === DEEMED_ACCEPTANCE_CRON_JOB)) {
        await this.noticesQueue.removeRepeatableByKey(job.key);
      }
      await this.noticesQueue.add(
        DEEMED_ACCEPTANCE_CRON_JOB,
        {},
        {
          repeat: { cron: DEEMED_ACCEPTANCE_CRON },
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      );
    } catch (e) {
      this.logger.warn(`Failed to register deemed-acceptance cron: ${(e as Error).message}`);
    }
  }

  // ─── Send notices for a newly published material version ────────────────────

  @Process(SEND_TERMS_NOTICES_JOB)
  async handleSendNotices(job: Job<TermsNoticesJobData>): Promise<void> {
    const { termsVersionId } = job.data;

    const version = await this.prisma.termsVersion.findUniqueOrThrow({
      where: { id: termsVersionId },
    });

    // All active (live + probation) and suspended vendors with a confirmed owner email.
    const vendors = await this.prisma.vendor.findMany({
      where: { status: { in: ['live', 'probation', 'suspended'] } },
      select: {
        id: true,
        businessName: true,
        members: {
          where: { role: 'owner' },
          select: { user: { select: { email: true } } },
          take: 1,
        },
      },
    });

    const effectiveDateStr = version.effectiveAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let sent = 0;
    let failed = 0;

    for (const vendor of vendors) {
      const ownerEmail = vendor.members[0]?.user?.email;

      try {
        // 1. Email notice.
        let emailDelivered = false;
        if (ownerEmail) {
          const result = await this.email.send({
            to: ownerEmail,
            subject: `Important: Feastpot Vendor Terms update (effective ${effectiveDateStr})`,
            html: buildNoticeEmail({
              businessName: vendor.businessName,
              version: version.version,
              summary: version.changeSummary,
              effectiveDateStr,
            }),
          });
          emailDelivered = result.delivered;
        }

        // 2. Persist EMAIL notice row.
        if (ownerEmail) {
          await this.prisma.termsNotice.create({
            data: {
              vendorId: vendor.id,
              termsVersionId,
              channel: NoticeChannel.EMAIL,
              deliveredAt: emailDelivered ? new Date() : null,
            },
          });
        }

        // 3. Persist DASHBOARD notice row (shown as the countdown banner).
        //    Created regardless of whether an email address exists.
        await this.prisma.termsNotice.create({
          data: {
            vendorId: vendor.id,
            termsVersionId,
            channel: NoticeChannel.DASHBOARD,
            deliveredAt: new Date(), // Immediately available on next dashboard load.
          },
        });

        sent++;
      } catch (err) {
        this.logger.error(`[terms-notices] failed to notify vendorId=${vendor.id}: ${String(err)}`);
        // Record a failed EMAIL notice so we can identify gaps in compliance audits.
        await this.prisma.termsNotice
          .create({
            data: {
              vendorId: vendor.id,
              termsVersionId,
              channel: NoticeChannel.EMAIL,
              deliveredAt: null,
            },
          })
          .catch(() => null);
        failed++;
      }
    }

    this.logger.log(
      `[terms-notices] termsVersionId=${termsVersionId} sent=${sent} failed=${failed}`,
    );
  }

  @Process(GENERATE_ACCEPTANCE_PDF_JOB)
  async handleAcceptancePdf(job: Job<AcceptancePdfJobData>): Promise<void> {
    const acceptance = await this.prisma.termsAcceptance.findUniqueOrThrow({
      where: { id: job.data.acceptanceId },
      include: {
        termsVersion: true,
        vendor: {
          select: {
            businessName: true,
            user: { select: { email: true, firstName: true } },
          },
        },
      },
    });

    const pdf = await this.buildAcceptancePdf(acceptance);
    await this.email.send({
      to: acceptance.vendor.user.email,
      subject: `Your accepted Feastpot Vendor Terms v${acceptance.termsVersion.version}`,
      html:
        `<p>Hi ${acceptance.vendor.user.firstName ?? 'there'},</p>` +
        `<p>Attached is your evidence copy of the Feastpot Vendor Terms accepted for ` +
        `<strong>${acceptance.vendor.businessName}</strong> on ` +
        `${acceptance.acceptedAt.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC.</p>` +
        `<p>This copy includes the accepted document hash and acceptance reference.</p>`,
      attachments: [
        {
          filename: `feastpot-vendor-terms-v${acceptance.termsVersion.version}-accepted.pdf`,
          content: pdf,
        },
      ],
    });
  }

  /** Resend the email represented by one operator-selected notice row. */
  @Process(TERMS_NOTICE_JOBS.resend_single_notice)
  async handleResendSingleNotice(job: Job<ResendSingleNoticeJobData>): Promise<void> {
    const notice = await this.prisma.termsNotice.findUniqueOrThrow({
      where: { id: job.data.noticeId },
    });
    if (
      notice.vendorId !== job.data.vendorId ||
      notice.termsVersionId !== job.data.termsVersionId
    ) {
      throw new Error(`Terms notice ${notice.id} does not match the queued vendor/version.`);
    }
    const [version, vendor] = await Promise.all([
      this.prisma.termsVersion.findUniqueOrThrow({ where: { id: notice.termsVersionId } }),
      this.prisma.vendor.findUniqueOrThrow({
        where: { id: notice.vendorId },
        select: {
          businessName: true,
          members: {
            where: { role: 'owner' },
            select: { user: { select: { email: true } } },
            take: 1,
          },
        },
      }),
    ]);
    const email = vendor?.members[0]?.user?.email;
    if (!vendor || !email) {
      throw new Error(`Terms notice ${notice.id} has no owner email to resend.`);
    }
    const effectiveDateStr = version.effectiveAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const result = await this.email.send({
      to: email,
      subject: `Important: Feastpot Vendor Terms update (effective ${effectiveDateStr})`,
      html: buildNoticeEmail({
        businessName: vendor.businessName,
        version: version.version,
        summary: version.changeSummary,
        effectiveDateStr,
      }),
    });
    await this.prisma.termsNotice.update({
      where: { id: notice.id },
      data: { deliveredAt: result.delivered ? new Date() : null },
    });
    if (!result.delivered) throw new Error(`Terms notice ${notice.id} resend was not delivered.`);
  }

  // ─── Nightly deemed-acceptance sweep ────────────────────────────────────────

  /**
   * Runs at 02:00 UTC every day. For each live terms version whose effectiveAt
   * has passed, finds vendors who have traded (accepted ≥1 order) since
   * effectiveAt but have not explicitly accepted the version. Records a
   * DEEMED_CONTINUED_USE acceptance for each, with the earliest qualifying
   * order as the relied-on action.
   *
   * Explicit click-wrap is always preferred. The prompt is shown via
   * ReAcceptanceGate on the vendor portal. This sweep records honest evidence
   * of continued use rather than leaving an acceptance gap.
   */
  @Process(DEEMED_ACCEPTANCE_CRON_JOB)
  async handleDeemedAcceptanceSweep(): Promise<void> {
    const now = new Date();

    // One current version per document type: latest version already effective.
    const effectiveVersions = await this.prisma.termsVersion.findMany({
      where: { effectiveAt: { lte: now }, isMaterial: true },
      orderBy: [{ documentType: 'asc' }, { effectiveAt: 'desc' }, { publishedAt: 'desc' }],
      select: { id: true, contentHash: true, effectiveAt: true, documentType: true },
    });
    const liveVersions = effectiveVersions.filter(
      (version, index, all) =>
        all.findIndex((candidate) => candidate.documentType === version.documentType) === index,
    );

    if (liveVersions.length === 0) return;

    let recorded = 0;

    for (const version of liveVersions) {
      // Vendors who have already explicitly accepted this version.
      const alreadyAccepted = await this.prisma.termsAcceptance.findMany({
        where: { termsVersionId: version.id },
        select: { vendorId: true },
      });
      const acceptedSet = new Set(alreadyAccepted.map((a) => a.vendorId));

      // Active vendors who have accepted ≥1 order since effectiveAt.
      const tradingVendors = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.accepted, OrderStatus.preparing, OrderStatus.delivered] },
          updatedAt: { gte: version.effectiveAt },
        },
        select: { vendorId: true, id: true, updatedAt: true },
        distinct: ['vendorId'],
        orderBy: { updatedAt: 'asc' },
      });

      for (const order of tradingVendors) {
        if (!order.vendorId || acceptedSet.has(order.vendorId)) continue;

        const acceptanceText =
          `Deemed acceptance by continued use. ` +
          `Relied on: orderId=${order.id} at ${order.updatedAt.toISOString()}.`;

        try {
          await this.prisma.termsAcceptance.upsert({
            where: {
              vendorId_termsVersionId: { vendorId: order.vendorId, termsVersionId: version.id },
            },
            create: {
              vendorId: order.vendorId,
              termsVersionId: version.id,
              userAgent: 'system/deemed-continued-use',
              acceptanceText,
              contentHash: version.contentHash,
              scrolledToEnd: false,
              method: 'DEEMED_CONTINUED_USE',
            },
            update: {}, // Never overwrite explicit acceptance.
          });
          acceptedSet.add(order.vendorId); // Avoid double-writing in same sweep.
          recorded++;
        } catch (err) {
          this.logger.error(
            `[terms-notices] deemed acceptance failed vendorId=${order.vendorId}: ${String(err)}`,
          );
        }
      }
    }

    this.logger.log(`[terms-notices] deemed-acceptance sweep: recorded=${recorded}`);
  }

  private buildAcceptancePdf(acceptance: {
    id: string;
    acceptedAt: Date;
    acceptanceText: string | null;
    contentHash: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    method: string;
    vendor: { businessName: string };
    termsVersion: { version: string; contentMdx: string; effectiveAt: Date };
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(42)
        .fillColor('#e5e7eb')
        .opacity(0.35)
        .rotate(-35, { origin: [300, 420] })
        .text(`ACCEPTED • ${acceptance.vendor.businessName}`, 60, 360, {
          width: 500,
          align: 'center',
        })
        .rotate(35, { origin: [300, 420] })
        .opacity(1);

      doc.fillColor('#111827').fontSize(20).text('Feastpot Vendor Terms - Accepted Copy');
      doc.moveDown(0.5).fontSize(10);
      doc.text(`Vendor: ${acceptance.vendor.businessName}`);
      doc.text(`Version: ${acceptance.termsVersion.version}`);
      doc.text(`Effective: ${acceptance.termsVersion.effectiveAt.toISOString()}`);
      doc.text(`Accepted: ${acceptance.acceptedAt.toISOString()}`);
      doc.text(`Acceptance reference: ${acceptance.id}`);
      doc.text(`Method: ${acceptance.method}`);
      doc.text(`Content SHA-256: ${acceptance.contentHash ?? 'not available'}`);
      doc.text(`IP address: ${acceptance.ipAddress ?? 'not available'}`);
      doc.text(`User agent: ${acceptance.userAgent ?? 'not available'}`);
      doc
        .moveDown()
        .fontSize(11)
        .text(acceptance.acceptanceText ?? '');
      doc.moveDown().fontSize(9).fillColor('#374151').text(acceptance.termsVersion.contentMdx, {
        align: 'left',
      });
      doc.end();
    });
  }
}

// ─── Email template ──────────────────────────────────────────────────────────

function buildNoticeEmail({
  businessName,
  version,
  summary,
  effectiveDateStr,
}: {
  businessName: string;
  version: string;
  summary: string;
  effectiveDateStr: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Vendor Terms Update</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <img src="https://feastpot.co.uk/feastpot-logo.png" alt="Feastpot" height="40" style="margin-bottom:24px">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 16px">Update to Vendor Terms of Service</h1>
  <p>Hi ${businessName},</p>
  <p>
    We are updating our Vendor Terms of Service. The new version (${version}) takes effect on
    <strong>${effectiveDateStr}</strong>.
  </p>
  <h2 style="font-size:16px;font-weight:600;margin:24px 0 8px">What's changing</h2>
  <p style="white-space:pre-wrap">${summary}</p>
  <p>
    You can read the full updated terms at
    <a href="https://feastpot.co.uk/legal/vendor-terms" style="color:#0d9488">
      feastpot.co.uk/legal/vendor-terms
    </a>.
  </p>
  <h2 style="font-size:16px;font-weight:600;margin:24px 0 8px">Your right to terminate</h2>
  <p>
    Under UK P2B Regulation, you may terminate your vendor agreement without penalty at any time
    before the effective date. To do so, email
    <a href="mailto:compliance@feastpot.co.uk" style="color:#0d9488">compliance@feastpot.co.uk</a>
    with the subject line &ldquo;Vendor termination&rdquo;.
  </p>
  <p>
    You can also view this notice and acknowledge the new terms in your
    <a href="https://vendor.feastpot.co.uk/onboarding/terms" style="color:#0d9488">vendor portal</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:12px;color:#6b7280">
    Feastpot Ltd &middot; compliance@feastpot.co.uk<br>
    This message was sent because you are a registered vendor on the Feastpot platform.
  </p>
</body>
</html>`;
}
