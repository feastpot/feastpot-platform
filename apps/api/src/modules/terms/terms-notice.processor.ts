import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { OnApplicationBootstrap, Logger } from '@nestjs/common';
import { NoticeChannel, OrderStatus } from '@prisma/client';
import type { Job, Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { TERMS_NOTICES_QUEUE } from '../../queues/queues.module';
import { EmailProvider } from '../notifications/providers/email.provider';

import { DEEMED_ACCEPTANCE_CRON_JOB, SEND_TERMS_NOTICES_JOB } from './terms.service';

interface TermsNoticesJobData {
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
    void this.noticesQueue.add(
      DEEMED_ACCEPTANCE_CRON_JOB,
      {},
      {
        repeat: { cron: DEEMED_ACCEPTANCE_CRON },
        jobId: `${DEEMED_ACCEPTANCE_CRON_JOB}:daily`,
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );
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

    // Versions that are now live (effectiveAt <= now) and not superseded.
    const liveVersions = await this.prisma.termsVersion.findMany({
      where: { effectiveAt: { lte: now }, supersededAt: null, isMaterial: true },
      select: { id: true, contentHash: true, effectiveAt: true },
    });

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
