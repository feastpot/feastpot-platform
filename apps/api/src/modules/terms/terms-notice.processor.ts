import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { TERMS_NOTICES_QUEUE } from '../../queues/queues.module';
import { EmailProvider } from '../notifications/providers/email.provider';

import { SEND_TERMS_NOTICES_JOB } from './terms.service';

interface TermsNoticesJobData {
  termsVersionId: string;
}

@Processor(TERMS_NOTICES_QUEUE)
export class TermsNoticeProcessor {
  private readonly logger = new Logger(TermsNoticeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
  ) {}

  @Process(SEND_TERMS_NOTICES_JOB)
  async handleSendNotices(job: Job<TermsNoticesJobData>): Promise<void> {
    const { termsVersionId } = job.data;

    const version = await this.prisma.termsVersion.findUniqueOrThrow({
      where: { id: termsVersionId },
    });

    // All active (live + probation) vendors with at least one confirmed user email.
    const vendors = await this.prisma.vendor.findMany({
      where: { status: { in: ['live', 'probation'] } },
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
      if (!ownerEmail) continue;

      try {
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

        await this.prisma.termsNotice.create({
          data: {
            vendorId: vendor.id,
            termsVersionId,
            channel: 'email',
            deliveredAt: result.delivered ? new Date() : null,
          },
        });

        sent++;
      } catch (err) {
        this.logger.error(
          `[terms-notices] failed to notify vendorId=${vendor.id}: ${String(err)}`,
        );
        // Still record the attempt so we can identify gaps.
        await this.prisma.termsNotice.create({
          data: { vendorId: vendor.id, termsVersionId, channel: 'email', deliveredAt: null },
        }).catch(() => null);
        failed++;
      }
    }

    this.logger.log(
      `[terms-notices] termsVersionId=${termsVersionId} sent=${sent} failed=${failed}`,
    );
  }
}

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
    with the subject line "Vendor termination".
  </p>
  <p>
    You can also view this notice and acknowledge the new terms in the
    <a href="https://vendor.feastpot.co.uk/terms" style="color:#0d9488">vendor portal</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:12px;color:#6b7280">
    Feastpot Ltd &middot; compliance@feastpot.co.uk<br>
    This message was sent because you are a registered vendor on the Feastpot platform.
  </p>
</body>
</html>`;
}
