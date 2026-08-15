import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface QuarterBucket {
  grossPence: number;
  feesPence: number;
  orderCount: number;
}

interface QuarterlyBreakdown {
  q1: QuarterBucket;
  q2: QuarterBucket;
  q3: QuarterBucket;
  q4: QuarterBucket;
}

// Orders that actually transfer money to the vendor
const REPORTABLE_STATUSES = ['delivered', 'dispatched', 'accepted', 'preparing'] as const;

/** Quarter index (0-based) for a given month (1-12). */
function quarterOf(month: number): keyof QuarterlyBreakdown {
  if (month <= 3) return 'q1';
  if (month <= 6) return 'q2';
  if (month <= 9) return 'q3';
  return 'q4';
}

@Injectable()
export class HmrcReportService {
  private readonly logger = new Logger(HmrcReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Generate (or refresh) the annual PlatformReport rows for all vendors
   * with reportable activity in `year`. Idempotent: re-running overwrites
   * existing rows with updated figures.
   *
   * Returns a summary of how many rows were written.
   */
  async generateAnnualReport(year: number): Promise<{
    vendorsProcessed: number;
    vendorsWithActivity: number;
    rowsUpserted: number;
  }> {
    const start = new Date(Date.UTC(year, 0, 1)); // Jan 1 00:00 UTC
    const end = new Date(Date.UTC(year + 1, 0, 1)); // Jan 1 next year

    this.logger.log(
      `Generating HMRC report for year ${year} (${start.toISOString()} - ${end.toISOString()})`,
    );

    // Pull all orders in the reporting period with their payout breakdown
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: REPORTABLE_STATUSES as unknown as (
            | 'delivered'
            | 'dispatched'
            | 'accepted'
            | 'preparing'
          )[],
        },
        createdAt: { gte: start, lt: end },
      },
      select: {
        vendorId: true,
        totalPence: true,
        commissionPence: true,
        serviceFeePence: true,
        createdAt: true,
      },
    });

    if (orders.length === 0) {
      this.logger.warn(`No reportable orders found for year ${year}`);
      return { vendorsProcessed: 0, vendorsWithActivity: 0, rowsUpserted: 0 };
    }

    // Aggregate by vendor
    const byVendor = new Map<
      string,
      { grossPence: number; feesPence: number; quarterly: QuarterlyBreakdown }
    >();

    for (const order of orders) {
      if (!byVendor.has(order.vendorId)) {
        byVendor.set(order.vendorId, {
          grossPence: 0,
          feesPence: 0,
          quarterly: {
            q1: { grossPence: 0, feesPence: 0, orderCount: 0 },
            q2: { grossPence: 0, feesPence: 0, orderCount: 0 },
            q3: { grossPence: 0, feesPence: 0, orderCount: 0 },
            q4: { grossPence: 0, feesPence: 0, orderCount: 0 },
          },
        });
      }
      const row = byVendor.get(order.vendorId)!;
      // Gross consideration = total paid by customer
      row.grossPence += order.totalPence;
      // Fees = platform commission + service fee (the amounts Feastpot retains)
      const fees = (order.commissionPence ?? 0) + (order.serviceFeePence ?? 0);
      row.feesPence += fees;
      const quarter = quarterOf(order.createdAt.getUTCMonth() + 1);
      row.quarterly[quarter].grossPence += order.totalPence;
      row.quarterly[quarter].feesPence += fees;
      row.quarterly[quarter].orderCount += 1;
    }

    const now = new Date();
    let rowsUpserted = 0;

    for (const [vendorId, agg] of byVendor) {
      const orderCount = orders.filter((o) => o.vendorId === vendorId).length;
      await this.prisma.platformReport.upsert({
        where: { reportingYear_vendorId: { reportingYear: year, vendorId } },
        create: {
          reportingYear: year,
          vendorId,
          grossPence: agg.grossPence,
          feesPence: agg.feesPence,
          orderCount,
          quarterlyBreakdown: agg.quarterly as unknown as Prisma.InputJsonValue,
          reportedAt: now,
        },
        update: {
          grossPence: agg.grossPence,
          feesPence: agg.feesPence,
          orderCount,
          quarterlyBreakdown: agg.quarterly as unknown as Prisma.InputJsonValue,
          reportedAt: now,
        },
      });
      rowsUpserted += 1;
    }

    this.logger.log(
      `HMRC report ${year}: ${orders.length} orders across ${byVendor.size} vendors, ${rowsUpserted} rows upserted`,
    );
    return { vendorsProcessed: orders.length, vendorsWithActivity: byVendor.size, rowsUpserted };
  }

  /**
   * Send each vendor their copy of the annual report (SI 2023/817 obligation).
   * Skips vendors that have already received their copy (copySentAt is set).
   * Returns the count of copies sent.
   */
  async sendVendorCopies(year: number): Promise<{ sent: number; skipped: number }> {
    const reports = await this.prisma.platformReport.findMany({
      where: { reportingYear: year, copySentAt: null },
      include: {
        vendor: {
          select: {
            userId: true,
            businessName: true,
          },
        },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const report of reports) {
      try {
        await this.notifications.enqueue('hmrc_copy_sent', {
          userId: report.vendor.userId,
          businessName: report.vendor.businessName,
          reportingYear: report.reportingYear,
          grossPounds: (report.grossPence / 100).toFixed(2),
          feesPounds: (report.feesPence / 100).toFixed(2),
          orderCount: report.orderCount,
          quarterlyBreakdown: report.quarterlyBreakdown,
          reportId: report.id,
        });
        await this.prisma.platformReport.update({
          where: { id: report.id },
          data: { copySentAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        this.logger.error(
          `Failed to send HMRC copy for vendor ${report.vendorId} (${report.vendor.businessName}): ${(err as Error).message}`,
        );
        skipped += 1;
      }
    }

    this.logger.log(`HMRC copies sent: ${sent}, skipped/failed: ${skipped}`);
    return { sent, skipped };
  }

  /**
   * Alert the founder that the HMRC 31-January submission deadline is approaching.
   * Fires on January 15th - 16 days before the deadline.
   */
  async sendDeadlineAlert(year: number): Promise<void> {
    const deadline = `31 January ${year}`;
    // Get count of vendors with reportable activity
    const reportCount = await this.prisma.platformReport.count({
      where: { reportingYear: year - 1 },
    });
    const unsentCopies = await this.prisma.platformReport.count({
      where: { reportingYear: year - 1, copySentAt: null },
    });

    await this.notifications.enqueue('hmrc_deadline_alert', {
      deadline,
      reportingYear: year - 1,
      reportCount,
      unsentCopies,
    });
    this.logger.log(`HMRC deadline alert sent for ${deadline}`);
  }

  async getReport(vendorId: string, year: number) {
    return this.prisma.platformReport.findUnique({
      where: { reportingYear_vendorId: { reportingYear: year, vendorId } },
    });
  }

  async listReports(vendorId: string) {
    return this.prisma.platformReport.findMany({
      where: { vendorId },
      orderBy: { reportingYear: 'desc' },
    });
  }

  async adminListReports(year: number) {
    return this.prisma.platformReport.findMany({
      where: { reportingYear: year },
      include: {
        vendor: { select: { businessName: true, status: true } },
      },
      orderBy: { grossPence: 'desc' },
    });
  }
}
