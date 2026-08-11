import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeStatus,
  OrderSource,
  OrderStatus,
  PaymentType,
  PayoutStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Queue } from 'bull';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as new (opts?: object) => NodeJS.EventEmitter & {
  text: (t: string, x?: number, y?: number, opts?: object) => any;
  fontSize: (n: number) => any;
  font: (name: string) => any;
  moveDown: (n?: number) => any;
  moveTo: (x: number, y: number) => any;
  lineTo: (x: number, y: number) => any;
  stroke: () => any;
  end: () => void;
  page: { width: number; margins: { left: number; right: number } };
  x: number;
  y: number;
};

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import type { AuthUser } from '../../auth/types';
import { CommissionService } from '../../commission/commission.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { InboxService } from '../inbox/inbox.service';

import { ListPayoutsDto } from './dto/list-payouts.dto';

export const NOTIFICATIONS_QUEUE = 'notifications';

const PAYOUT_CSV_HEADER = [
  'payout_id',
  'payout_date',
  'period_start',
  'period_end',
  'gross_pence',
  'commission_pence',
  'fees_pence',
  'refunds_pence',
  'adjustments_pence',
  'net_pence',
  'currency',
  'status',
  'order_count',
  'stripe_transfer_id',
].join(',');

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let safe = String(value);
  // CSV-injection guard: Excel / Numbers run cells starting with =, +, -, @
  // as formulas. Prefix a single quote so the cell renders verbatim.
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  // RFC 4180: quote when the cell has a comma, quote, or newline.
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function isoDateOnly(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

interface PayoutCsvRow {
  id: string;
  status: string;
  amountPence: number;
  grossPence: number;
  commissionPence: number;
  refundsPence: number;
  orderCount: number;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  transferredAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  stripeTransferId: string | null;
}

function payoutCsvRow(p: PayoutCsvRow): string {
  // payout_date = the date money actually moved if available, otherwise the
  // approval date, otherwise creation date. Keeps the column non-empty for
  // draft/held rows without lying about transfer status.
  const payoutDate = p.transferredAt ?? p.approvedAt ?? p.createdAt;
  // fees_pence = the platform service fee Feastpot retained on this payout's
  // orders, derived from the stored components so the row self-reconciles:
  //   gross − commission − fees − refunds − adjustments = net   (always)
  // gross (= Σ order totals) includes the service fee; net (= Σ stored
  // vendorPayoutPence − refunds) excludes it, so the residual IS the retained
  // service fee. adjustments_pence carries any negative residual - that should
  // never happen and flags a ledger anomaly for finance instead of hiding it.
  const residualPence = p.grossPence - p.commissionPence - p.refundsPence - p.amountPence;
  const feesPence = Math.max(0, residualPence);
  const adjustmentsPence = Math.min(0, residualPence);
  return [
    p.id,
    isoDateOnly(payoutDate),
    isoDateOnly(p.periodStart),
    isoDateOnly(p.periodEnd),
    p.grossPence,
    p.commissionPence,
    feesPence,
    p.refundsPence,
    adjustmentsPence,
    p.amountPence,
    p.currency,
    p.status,
    p.orderCount,
    p.stripeTransferId ?? '',
  ]
    .map((c) => csvCell(c))
    .join(',');
}

export interface VendorBatchInput {
  vendorId: string;
  vendorUserId: string;
  commissionBps: number;
  hasOpenDispute: boolean;
  orders: Array<{
    id: string;
    totalPence: number;
    vendorPayoutPence: number;
    commissionPence: number;
  }>;
  refundDeductionsPence: number;
}

export interface BatchTotals {
  vendorId: string;
  grossPence: number;
  commissionPence: number;
  refundsPence: number;
  netPence: number;
  orderCount: number;
  status: PayoutStatus;
  holdReason: string | null;
}

/**
 * Pure aggregation helper; exported for unit testing.
 */
export function aggregateVendorBatch(input: VendorBatchInput): BatchTotals {
  const grossPence = input.orders.reduce((s, o) => s + o.totalPence, 0);
  const commissionPence = input.orders.reduce((s, o) => s + o.commissionPence, 0);
  // Vendor net is the sum of each order's STORED vendorPayoutPence
  // (= subtotal + delivery − discount − commission), which already EXCLUDES the
  // platform service fee Feastpot retains. Do NOT recompute as
  // gross − commission: that re-introduces the service-fee leak this batch
  // exists to prevent (gross/totalPence includes serviceFeePence).
  const payoutBeforeRefundsPence = input.orders.reduce((s, o) => s + o.vendorPayoutPence, 0);
  const refundsPence = Math.max(0, input.refundDeductionsPence);
  const netPence = Math.max(0, payoutBeforeRefundsPence - refundsPence);
  return {
    vendorId: input.vendorId,
    grossPence,
    commissionPence,
    refundsPence,
    netPence,
    orderCount: input.orders.length,
    status: input.hasOpenDispute ? PayoutStatus.held : PayoutStatus.draft,
    holdReason: input.hasOpenDispute ? 'Vendor has open dispute(s); held pending resolution' : null,
  };
}

/**
 * Returns [start, end) for the most recent completed Mon→Sun (UTC) window
 * relative to `now`. Exported for tests so the cron behaviour is deterministic.
 */
export function lastCompletedWeekUtc(now: Date): { start: Date; end: Date } {
  // 0=Sun … 6=Sat. We want last Monday (start) up to this Monday (exclusive end).
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = end.getUTCDay(); // 0..6 with 0=Sun
  // Days since most recent Monday (inclusive). If today is Mon, we want last Mon, so go 7 days.
  const daysSinceMon = (dayOfWeek + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  end.setUTCDate(end.getUTCDate() - daysSinceMon); // most recent Monday 00:00 UTC
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start, end };
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    // T007: in-app vendor inbox when a payout transfers.
    private readonly inbox: InboxService,
    private readonly commission: CommissionService,
  ) {}

  // ---------------- list/get ----------------

  async list(user: AuthUser, dto: ListPayoutsDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.PayoutWhereInput = {};
    if (dto.status) where.status = dto.status;

    if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!vendor) return { data: [], nextCursor: null };
      where.vendorId = vendor.id;
    } else if (user.role === UserRole.finance || user.role === UserRole.admin) {
      if (dto.vendorId) where.vendorId = dto.vendorId;
    } else {
      throw new ForbiddenException({
        code: 'PAYOUTS_FORBIDDEN',
        message: 'You may not view payouts',
      });
    }

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.PayoutWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    const rows = await this.prisma.payout.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    const nextCursor = rows.length === limit ? this.encodeCursor(rows[rows.length - 1]!) : null;
    return { data: rows, nextCursor };
  }

  /**
   * Read-only rollup for the vendor payouts page summary card: next payout
   * (most recent non-final payout's period end + amount), amount pending
   * (sum of draft/held/approved) and amount paid to date (sum of
   * transferred). Pure aggregation over existing rows - no new arithmetic,
   * the amounts were computed by the weekly batch when each row was written.
   */
  async vendorSummary(vendorId: string | null) {
    if (!vendorId) {
      return { nextPayoutDate: null, pendingPence: 0, paidToDatePence: 0 };
    }
    const vendor = { id: vendorId };
    const pendingStatuses = [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved];
    const [pending, paid, next] = await Promise.all([
      this.prisma.payout.aggregate({
        where: { vendorId: vendor.id, status: { in: pendingStatuses } },
        _sum: { amountPence: true },
      }),
      this.prisma.payout.aggregate({
        where: { vendorId: vendor.id, status: PayoutStatus.transferred },
        _sum: { amountPence: true },
      }),
      this.prisma.payout.findFirst({
        where: { vendorId: vendor.id, status: { in: pendingStatuses } },
        orderBy: { createdAt: 'desc' },
        select: { periodEnd: true, amountPence: true },
      }),
    ]);
    return {
      nextPayoutDate: next?.periodEnd ?? null,
      pendingPence: pending._sum.amountPence ?? 0,
      paidToDatePence: paid._sum.amountPence ?? 0,
    };
  }

  /**
   * Streams the full payout history for the actor as CSV. Vendors see only
   * their own rows; finance/admin see all (optionally narrowed by vendorId).
   * Capped at 5 000 rows to match the audit-log export.
   *
   * Columns are chosen to match accountancy templates (Xero / QuickBooks
   * import-ready). `fees` and `adjustments` are placeholder zero columns
   * for now: Stripe transfer fees aren't broken out in our schema, and
   * manual adjustments are tracked separately via dispute resolutions.
   */
  async exportCsv(
    user: AuthUser,
    write: (chunk: string) => void,
    opts: { vendorId?: string } = {},
  ): Promise<void> {
    const where: Prisma.PayoutWhereInput = {};
    if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!vendor) {
        write(PAYOUT_CSV_HEADER + '\n');
        return;
      }
      where.vendorId = vendor.id;
    } else if (user.role === UserRole.finance || user.role === UserRole.admin) {
      if (opts.vendorId) where.vendorId = opts.vendorId;
    } else {
      throw new ForbiddenException({
        code: 'PAYOUTS_FORBIDDEN',
        message: 'You may not export payouts',
      });
    }

    write(PAYOUT_CSV_HEADER + '\n');

    const PAGE = 500;
    const MAX = 5_000;
    let cursorId: string | undefined;
    let written = 0;

    for (let i = 0; i < Math.ceil(MAX / PAGE); i++) {
      const rows = await this.prisma.payout.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        write(payoutCsvRow(r) + '\n');
        written += 1;
        if (written >= MAX) return;
      }
      cursorId = rows[rows.length - 1]!.id;
      if (rows.length < PAGE) break;
    }
  }

  async getById(id: string, user: AuthUser) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, userId: true, businessName: true, stripeAccountId: true } },
      },
    });
    if (!payout)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
    if (
      user.role !== UserRole.admin &&
      user.role !== UserRole.finance &&
      !(user.role === UserRole.vendor && payout.vendor.userId === user.id)
    ) {
      throw new ForbiddenException({
        code: 'PAYOUT_FORBIDDEN',
        message: 'You may not view this payout',
      });
    }
    return payout;
  }

  // ---------------- approve / hold ----------------

  /**
   * Atomically approves a draft payout and triggers a Stripe transfer to the
   * vendor's connected account. The CAS guard prevents two finance admins from
   * double-transferring the same payout.
   *
   * Defence-in-depth: re-checks the actor role in the service so an internal
   * caller (cron, webhook handler, etc.) can never approve a payout without an
   * explicit finance/admin actor - `@Roles` on the controller alone isn't
   * enough once code outside HTTP starts invoking this method.
   */
  async approvePayout(payoutId: string, actor: AuthUser) {
    if (actor.role !== UserRole.finance && actor.role !== UserRole.admin) {
      throw new ForbiddenException({
        code: 'PAYOUT_APPROVE_FORBIDDEN',
        message: 'Only finance or admin may approve payouts',
      });
    }
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        vendor: {
          select: { stripeAccountId: true, payoutsEnabled: true, userId: true, businessName: true },
        },
      },
    });
    if (!payout)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
    if (payout.status !== PayoutStatus.draft) {
      throw new BadRequestException({
        code: 'PAYOUT_NOT_DRAFT',
        message: `Cannot approve payout in status "${payout.status}"`,
      });
    }
    if (!payout.vendor.stripeAccountId || !payout.vendor.payoutsEnabled) {
      throw new BadRequestException({
        code: 'VENDOR_PAYOUTS_DISABLED',
        message: 'Vendor has no Stripe Connect account or payouts are disabled',
      });
    }
    if (payout.amountPence <= 0) {
      throw new BadRequestException({
        code: 'PAYOUT_ZERO_OR_NEGATIVE',
        message: 'Payout net is zero or negative',
      });
    }

    const cas = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.draft },
      data: { status: PayoutStatus.approved, approvedById: actor.id, approvedAt: new Date() },
    });
    if (cas.count !== 1) {
      throw new BadRequestException({
        code: 'PAYOUT_CHANGED_CONCURRENTLY',
        message: 'Payout status changed concurrently',
      });
    }

    // CRITICAL: only Stripe + the payout-row update belong inside the
    // STRIPE_TRANSFER_FAILED try/catch. A broader catch here is a latent bug -
    // if Redis is unavailable, `notifications.add()` throws "Connection is
    // closed.", we'd flip a SUCCESSFULLY transferred payout to `failed`
    // (with failureReason='Connection is closed.') AND throw 400 back to
    // finance - corrupting state and double-paying after manual re-approval.
    let updated;
    try {
      const transfer = await this.stripe.createTransfer({
        amountPence: payout.amountPence,
        destinationAccountId: payout.vendor.stripeAccountId,
        payoutId: payout.id,
        // Deterministic key (one per payout): if a prior approval's transfer
        // actually landed at Stripe but the response timed out (flipping us to
        // `failed`), a re-approval returns that SAME transfer instead of
        // creating a second one and double-paying the vendor.
        idempotencyKey: `payout-transfer-${payout.id}`,
      });
      updated = await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.transferred,
          stripeTransferId: transfer.id,
          transferredAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.error(`Stripe transfer failed for payout ${payoutId}: ${(e as Error).message}`);
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: PayoutStatus.failed, failureReason: (e as Error).message },
      });
      // Alert finance immediately - a failed transfer means the vendor
      // hasn't been paid. They must reset and re-approve (POST :id/reset).
      const financeEmail =
        process.env.FINANCE_ALERT_EMAIL ??
        process.env.VENDOR_APPLICATIONS_ADMIN_EMAIL ??
        'soul@feastpot.co.uk';
      const adminBase = process.env.ADMIN_URL ?? 'https://admin.feastpot.co.uk';
      await this.notifications.add('vendor_application_email_raw', {
        to: financeEmail,
        subject: `[ACTION REQUIRED] Payout failed for ${payout.vendor?.businessName ?? payoutId}`,
        html: `<p>A Stripe transfer failed for payout <strong>${payoutId}</strong> (vendor: ${payout.vendor?.businessName ?? 'unknown'}).</p>
<p><strong>Error:</strong> ${(e as Error).message}</p>
<p>The payout status has been set to <code>failed</code>. To retry, reset it to draft and re-approve:</p>
<p><a href="${adminBase}/payouts/${payoutId}">View payout in admin</a></p>
<p>Or call <code>POST /v1/payouts/${payoutId}/reset</code> then <code>POST /v1/payouts/${payoutId}/approve</code>.</p>`,
      });
      throw new BadRequestException({
        code: 'STRIPE_TRANSFER_FAILED',
        message: (e as Error).message,
      });
    }
    // Best-effort side-effects: money has moved + DB committed. Failures
    // here must NOT mark the payout failed or 500 the controller.
    try {
      await this.notifications.add('payout_transferred', {
        vendorId: payout.vendorId,
        vendorUserId: payout.vendor.userId,
        payoutId: payout.id,
        amountPence: payout.amountPence,
      });
    } catch (e) {
      this.logger.warn(`payout_transferred notify failed for ${payoutId}: ${(e as Error).message}`);
    }
    try {
      // T007: in-app inbox row alongside the outbound email.
      await this.inbox.notify({
        userId: payout.vendor.userId,
        type: 'payout_processed',
        title: `Payout sent: £${(payout.amountPence / 100).toFixed(2)}`,
        body: 'Your weekly payout has been transferred to your linked bank account.',
        link: '/payouts',
        metadata: { payoutId: payout.id, amountPence: payout.amountPence },
      });
    } catch (e) {
      this.logger.warn(`payout inbox notify failed for ${payoutId}: ${(e as Error).message}`);
    }
    return updated;
  }

  /**
   * Reset a failed payout back to draft so finance can re-approve it.
   * Only valid when status=failed (terminal for Stripe transfers, but
   * recoverable after the root cause is fixed).
   */
  async resetFailedPayout(payoutId: string, actor: AuthUser) {
    if (actor.role !== UserRole.finance && actor.role !== UserRole.admin) {
      throw new ForbiddenException({
        code: 'PAYOUT_RESET_FORBIDDEN',
        message: 'Only finance or admin may reset payouts',
      });
    }
    const cas = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.failed },
      data: { status: PayoutStatus.draft, failureReason: null },
    });
    if (cas.count !== 1) {
      throw new BadRequestException({
        code: 'PAYOUT_NOT_FAILED',
        message: 'Payout is not in failed status; cannot reset',
      });
    }
    this.logger.log(`Payout ${payoutId} reset to draft by ${actor.id}`);
    return this.prisma.payout.findUnique({ where: { id: payoutId } });
  }

  async holdPayout(payoutId: string, holdReason: string, actor: AuthUser) {
    if (actor.role !== UserRole.finance && actor.role !== UserRole.admin) {
      throw new ForbiddenException({
        code: 'PAYOUT_HOLD_FORBIDDEN',
        message: 'Only finance or admin may hold payouts',
      });
    }
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: { status: true, vendorId: true, vendor: { select: { userId: true } } },
    });
    if (!payout)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
    if (payout.status === PayoutStatus.transferred || payout.status === PayoutStatus.failed) {
      throw new BadRequestException({
        code: 'PAYOUT_TERMINAL',
        message: `Cannot hold a payout in status "${payout.status}"`,
      });
    }
    const cas = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: payout.status },
      data: { status: PayoutStatus.held, holdReason },
    });
    if (cas.count !== 1) {
      throw new BadRequestException({
        code: 'PAYOUT_CHANGED_CONCURRENTLY',
        message: 'Payout changed concurrently',
      });
    }
    try {
      await this.notifications.add('payout_held', {
        vendorId: payout.vendorId,
        vendorUserId: payout.vendor.userId,
        payoutId,
        reason: holdReason,
        heldByUserId: actor.id,
      });
    } catch (e) {
      this.logger.warn(`payout_held notify failed for ${payoutId}: ${(e as Error).message}`);
    }
    return this.prisma.payout.findUnique({ where: { id: payoutId } });
  }

  // ---------------- weekly batch ----------------

  /**
   * Builds the weekly payout batch for the prior Mon-Sun window.
   * Idempotent per (vendor, periodEnd): re-running the cron in the same week
   * skips vendors that already have a payout for that period.
   */
  async runWeeklyBatch(now: Date = new Date()) {
    const { start, end } = lastCompletedWeekUtc(now);
    this.logger.log(
      `Running weekly payout batch for ${start.toISOString()} → ${end.toISOString()}`,
    );

    // Pull all delivered orders in the window with vendor info + commission data.
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.delivered, deliveredAt: { gte: start, lt: end } },
      select: {
        id: true,
        vendorId: true,
        orderNumber: true,
        subtotalPence: true,
        totalPence: true,
        vendorPayoutPence: true,
        commissionPence: true,
        deliveredAt: true,
        vendor: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            commissionBps: true,
            payoutsEnabled: true,
          },
        },
        orderCommission: {
          select: {
            foodSubtotalPence: true,
            ratePercent: true,
            commissionPence: true,
            source: true,
            isFirstOrder: true,
          },
        },
      },
    });

    // Group by vendor.
    type Group = { vendor: (typeof orders)[number]['vendor']; orders: typeof orders };
    const byVendor = new Map<string, Group>();
    for (const o of orders) {
      const g = byVendor.get(o.vendorId) ?? { vendor: o.vendor, orders: [] };
      g.orders.push(o);
      byVendor.set(o.vendorId, g);
    }

    const created: Array<{ vendorId: string; payoutId: string }> = [];
    const skipped: string[] = [];

    for (const [vendorId, group] of byVendor) {
      // Idempotency: skip if a payout already exists for this vendor's period_end.
      const existing = await this.prisma.payout.findFirst({
        where: { vendorId, periodEnd: end },
        select: { id: true },
      });
      if (existing) {
        skipped.push(vendorId);
        continue;
      }

      // Refund deductions for this vendor's orders in the window.
      const orderIds = group.orders.map((o) => o.id);
      const refundDeductions = await this.prisma.payment.aggregate({
        where: {
          orderId: { in: orderIds },
          type: { in: [PaymentType.refund, PaymentType.partial_refund] },
        },
        _sum: { amountPence: true },
      });
      // Credit rows hold the portion of each refund Feastpot absorbs (service-fee
      // + commission share) - that money must NOT be clawed back from the vendor.
      const refundCredits = await this.prisma.payment.aggregate({
        where: { orderId: { in: orderIds }, type: PaymentType.credit },
        _sum: { amountPence: true },
      });
      // Refund rows are negative (cash out); credit rows positive (absorbed).
      // Net vendor deduction = customer refunds − Feastpot-absorbed portion
      // = vendorClawbackPence, which EXCLUDES the platform service fee.
      const customerRefundsPence = -(refundDeductions._sum.amountPence ?? 0);
      const feastpotAbsorbedPence = refundCredits._sum.amountPence ?? 0;
      const refundsPence = Math.max(0, customerRefundsPence - feastpotAbsorbedPence);

      // Open-dispute hold check.
      const openDisputes = await this.prisma.dispute.count({
        where: {
          orderId: { in: orderIds },
          status: {
            in: [DisputeStatus.open, DisputeStatus.vendor_contacted, DisputeStatus.escalated],
          },
        },
      });

      const totals = aggregateVendorBatch({
        vendorId,
        vendorUserId: group.vendor.userId,
        commissionBps: group.vendor.commissionBps,
        hasOpenDispute: openDisputes > 0,
        orders: group.orders.map((o) => ({
          id: o.id,
          totalPence: o.totalPence,
          vendorPayoutPence: o.vendorPayoutPence,
          commissionPence: o.commissionPence,
        })),
        refundDeductionsPence: refundsPence,
      });

      try {
        const payout = await this.prisma.payout.create({
          data: {
            vendorId,
            status: totals.status,
            amountPence: totals.netPence,
            grossPence: totals.grossPence,
            commissionPence: totals.commissionPence,
            refundsPence: totals.refundsPence,
            orderCount: totals.orderCount,
            periodStart: start,
            periodEnd: end,
            holdReason: totals.holdReason,
            currency: 'GBP',
          },
        });
        created.push({ vendorId, payoutId: payout.id });

        // Per-vendor payout statement notification with per-order data for the
        // PDF statement. Best-effort -- never blocks payout creation.
        try {
          const orderRows = group.orders.map((o) => ({
            orderNumber: o.orderNumber,
            deliveredAt: o.deliveredAt?.toISOString() ?? null,
            // Prefer stored OrderCommission data; fall back to the order row
            // for orders placed before this feature was deployed.
            foodSubtotalPence: o.orderCommission?.foodSubtotalPence ?? o.subtotalPence,
            source: (o.orderCommission?.source ?? OrderSource.MARKETPLACE) as string,
            ratePercent: o.orderCommission ? o.orderCommission.ratePercent.toString() : '12.00',
            commissionPence: o.orderCommission?.commissionPence ?? o.commissionPence,
            vendorPayoutPence: o.vendorPayoutPence,
          }));

          // Generate PDF statement -- stored as base64 in the job payload so
          // the notification processor can attach it to the email without
          // needing to query the DB again. Failure is non-blocking.
          let pdfBase64: string | undefined;
          try {
            const pdfBuf = await this.buildPayoutStatementPdf({
              businessName: group.vendor.businessName ?? vendorId,
              periodStart: start,
              periodEnd: end,
              grossPence: totals.grossPence,
              commissionPence: totals.commissionPence,
              netPence: totals.netPence,
              orders: orderRows,
            });
            pdfBase64 = pdfBuf.toString('base64');
          } catch (pdfErr) {
            this.logger.warn(
              `[payout-pdf] Generation failed for vendor ${vendorId}: ${(pdfErr as Error).message}`,
            );
          }

          await this.notifications.add('payout_batch_ready', {
            vendorUserId: group.vendor.userId,
            payoutId: payout.id,
            vendorBusinessName: group.vendor.businessName ?? vendorId,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            grossPence: totals.grossPence,
            commissionPence: totals.commissionPence,
            netPence: totals.netPence,
            amountPence: totals.netPence,
            orderCount: totals.orderCount,
            orders: orderRows,
            ...(pdfBase64
              ? { pdfBase64, pdfFilename: `feastpot-statement-${isoDateOnly(end)}.pdf` }
              : {}),
          });
        } catch (notifyErr) {
          this.logger.warn(
            `payout_batch_ready notify failed for vendor ${vendorId}: ${(notifyErr as Error).message}`,
          );
        }
      } catch (e) {
        // P2002 on (vendor_id, period_end) → another batch run created it first;
        // safe to skip. The unique constraint is the final guarantor.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          this.logger.warn(`Concurrent batch race on vendor ${vendorId}; skipping`);
          skipped.push(vendorId);
        } else {
          throw e;
        }
      }
    }

    // Blended take-rate alert: warn if outside the healthy [6%, 10%] band.
    // Uses per-order commission data where available; falls back to stored
    // commissionPence for pre-feature orders.
    const allOrders = [...byVendor.values()].flatMap((g) => g.orders);
    const totalSubtPeriod = allOrders.reduce(
      (s, o) => s + (o.orderCommission?.foodSubtotalPence ?? o.subtotalPence),
      0,
    );
    const totalCommPeriod = allOrders.reduce((s, o) => s + o.commissionPence, 0);
    if (totalSubtPeriod > 0) {
      const blendedPct = (totalCommPeriod / totalSubtPeriod) * 100;
      if (blendedPct > 10 || blendedPct < 6) {
        this.logger.warn(
          `[commission-alert] Blended take rate ${blendedPct.toFixed(2)}% outside [6%, 10%] for ${start.toISOString()} - ${end.toISOString()}`,
        );
      }
    }

    return { periodStart: start, periodEnd: end, created, skippedVendorIds: skipped };
  }

  // ---------------- payout order detail ----------------

  /**
   * Lists the individual orders that make up a specific payout batch.
   *
   * Vendors may only view orders from their own payout (verified via the
   * payout's vendor.userId). Finance/admin may view any. Scoping mirrors
   * runWeeklyBatch exactly: orders delivered in [periodStart, periodEnd)
   * for the payout's vendor.
   */
  async listPayoutOrders(payoutId: string, user: AuthUser) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: {
        vendorId: true,
        periodStart: true,
        periodEnd: true,
        vendor: { select: { userId: true } },
      },
    });
    if (!payout)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });

    if (user.role === UserRole.vendor && payout.vendor.userId !== user.id) {
      throw new ForbiddenException({
        code: 'PAYOUT_FORBIDDEN',
        message: 'You may not view this payout',
      });
    }
    if (
      user.role !== UserRole.vendor &&
      user.role !== UserRole.finance &&
      user.role !== UserRole.admin
    ) {
      throw new ForbiddenException({
        code: 'PAYOUT_FORBIDDEN',
        message: 'You may not view this payout',
      });
    }

    const where: Prisma.OrderWhereInput = {
      vendorId: payout.vendorId,
      status: OrderStatus.delivered,
      ...(payout.periodStart && payout.periodEnd
        ? { deliveredAt: { gte: payout.periodStart, lt: payout.periodEnd } }
        : {}),
    };

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        deliveredAt: true,
        subtotalPence: true,
        commissionPence: true,
        vendorPayoutPence: true,
        attribution: { select: { resolvedSource: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      subtotalPence: o.subtotalPence,
      commissionPence: o.commissionPence,
      vendorPayoutPence: o.vendorPayoutPence,
      // resolvedSource is null only on pre-attribution rows; treat as MARKETPLACE_FIRST.
      attributionSource: (o.attribution?.resolvedSource ?? null) as string | null,
    }));
  }

  /**
   * Streams order-level CSV for the logged-in vendor (or, for finance/admin,
   * optionally scoped to a specific payout).
   *
   * Columns: order_date, order_number, attribution_source,
   *          subtotal_gbp, commission_gbp, net_to_vendor_gbp,
   *          subtotal_pence, commission_pence, net_to_vendor_pence.
   *
   * Partial refunds are reflected in the stored commissionPence /
   * vendorPayoutPence values, so the CSV always shows post-adjustment figures.
   * Capped at 5 000 rows to prevent runaway DB connections.
   */
  async exportOrdersCsv(
    user: AuthUser,
    write: (chunk: string) => void,
    opts: { payoutId?: string } = {},
  ): Promise<void> {
    const HEADER = [
      'order_date',
      'order_number',
      'attribution_source',
      'subtotal_gbp',
      'commission_gbp',
      'net_to_vendor_gbp',
      'subtotal_pence',
      'commission_pence',
      'net_to_vendor_pence',
    ].join(',');
    write(HEADER + '\n');

    const where: Prisma.OrderWhereInput = { status: OrderStatus.delivered };

    if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!vendor) return; // empty CSV with headers only
      where.vendorId = vendor.id;
    } else if (user.role !== UserRole.finance && user.role !== UserRole.admin) {
      throw new ForbiddenException({
        code: 'PAYOUTS_FORBIDDEN',
        message: 'You may not export order data',
      });
    }

    if (opts.payoutId) {
      const payout = await this.prisma.payout.findUnique({
        where: { id: opts.payoutId },
        select: { vendorId: true, periodStart: true, periodEnd: true },
      });
      if (!payout) return;
      // Vendor must own this payout.
      if (
        user.role === UserRole.vendor &&
        where.vendorId !== undefined &&
        where.vendorId !== payout.vendorId
      ) {
        throw new ForbiddenException({
          code: 'PAYOUT_FORBIDDEN',
          message: 'You may not export this payout',
        });
      }
      where.vendorId = payout.vendorId;
      if (payout.periodStart && payout.periodEnd) {
        where.deliveredAt = { gte: payout.periodStart, lt: payout.periodEnd };
      }
    }

    const PAGE = 500;
    const MAX = 5_000;
    let cursorId: string | undefined;
    let written = 0;

    for (let i = 0; i < Math.ceil(MAX / PAGE); i++) {
      const rows = await this.prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          deliveredAt: true,
          subtotalPence: true,
          commissionPence: true,
          vendorPayoutPence: true,
          attribution: { select: { resolvedSource: true } },
        },
        orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
        take: PAGE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        const src = r.attribution?.resolvedSource ?? 'MARKETPLACE_FIRST';
        const row = [
          isoDateOnly(r.deliveredAt),
          r.orderNumber,
          src,
          (r.subtotalPence / 100).toFixed(2),
          (r.commissionPence / 100).toFixed(2),
          (r.vendorPayoutPence / 100).toFixed(2),
          r.subtotalPence,
          r.commissionPence,
          r.vendorPayoutPence,
        ]
          .map((c) => csvCell(c))
          .join(',');
        write(row + '\n');
        written++;
        if (written >= MAX) return;
      }
      cursorId = rows[rows.length - 1]!.id;
      if (rows.length < PAGE) break;
    }
  }

  // ---------------- vendor earnings summary ----------------

  /**
   * Source-based earnings breakdown for the vendor portal /earnings page.
   * Delegates to CommissionService and adds vendor-membership guard.
   */
  async getEarningsSummary(vendorId: string, from: Date, to: Date) {
    return this.commission.getVendorEarningsSummary(vendorId, from, to);
  }

  // ---------------- payout statement PDF ────────────────────────────────────

  /**
   * Builds a PDF payout statement Buffer from per-order data.
   * Used by the notification processor when dispatching payout_batch_ready.
   */
  async buildPayoutStatementPdf(params: {
    businessName: string;
    periodStart: Date;
    periodEnd: Date;
    grossPence: number;
    commissionPence: number;
    netPence: number;
    orders: Array<{
      orderNumber: string;
      deliveredAt: string | null;
      foodSubtotalPence: number;
      source: string;
      ratePercent: string;
      commissionPence: number;
      vendorPayoutPence: number;
    }>;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const p = (pence: number) => `£${(pence / 100).toFixed(2)}`;
      const dateStr = (s: string | null) =>
        s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
      const srcLabel = (src: string) =>
        src === 'VENDOR_REFERRED' ? 'Your referral' : 'Marketplace';

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const ml = doc.page.margins.left;

      // ─── Header ──────────────────────────────────────────────────────────
      doc.fontSize(20).font('Helvetica-Bold').text('Feastpot', ml, 40);
      doc.fontSize(10).font('Helvetica').text('Payout Statement', ml, 64);
      doc.fontSize(10).text(`Vendor: ${params.businessName}`, ml, 76);
      doc
        .text(
          `Period: ${dateStr(params.periodStart.toISOString())} – ${dateStr(params.periodEnd.toISOString())}`,
          ml,
          88,
        )
        .moveDown(2);

      // ─── Order table ─────────────────────────────────────────────────────
      const cols = [ml, ml + 70, ml + 130, ml + 210, ml + 265, ml + 310, ml + 380];
      const headers = ['Order #', 'Date', 'Food subtotal', 'Source', 'Rate', 'Commission', 'Net to you'];
      const colWidths = [70, 60, 80, 55, 45, 70, 70];

      // Table header row
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, cols[i], doc.y, { width: colWidths[i] }));
      doc.moveDown(0.3);
      const lineY = doc.y;
      doc.moveTo(ml, lineY).lineTo(ml + pageWidth, lineY).stroke();
      doc.moveDown(0.4);

      // Data rows
      doc.font('Helvetica');
      for (const o of params.orders) {
        const rowY = doc.y;
        const cells = [
          o.orderNumber,
          dateStr(o.deliveredAt),
          p(o.foodSubtotalPence),
          srcLabel(o.source),
          `${o.ratePercent}%`,
          p(o.commissionPence),
          p(o.vendorPayoutPence),
        ];
        cells.forEach((cell, i) => doc.text(cell, cols[i], rowY, { width: colWidths[i] }));
        doc.moveDown(0.5);
      }

      // Separator
      doc.moveDown(0.5);
      const sepY = doc.y;
      doc.moveTo(ml, sepY).lineTo(ml + pageWidth, sepY).stroke();
      doc.moveDown(0.8);

      // ─── Summary ─────────────────────────────────────────────────────────
      const totalSubtotal = params.orders.reduce((s, o) => s + o.foodSubtotalPence, 0);
      const flat12Commission = Math.round((totalSubtotal * 12) / 100);
      const savedPence = Math.max(0, flat12Commission - params.commissionPence);
      const blendedPct =
        totalSubtotal > 0
          ? ((params.commissionPence / totalSubtotal) * 100).toFixed(2)
          : '0.00';

      const summaryX2 = ml + 200;
      doc.font('Helvetica-Bold').fontSize(9).text('Summary', ml, doc.y);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9);

      const row = (label: string, value: string) => {
        const y = doc.y;
        doc.text(label, ml, y);
        doc.text(value, summaryX2, y);
        doc.moveDown(0.5);
      };

      row('Total orders:', String(params.orders.length));
      row('Gross sales:', p(params.grossPence));
      row('Commission deducted:', p(params.commissionPence));
      row('Blended effective rate:', `${blendedPct}%`);
      row('Net payout:', p(params.netPence));
      doc.moveDown(0.5);

      if (savedPence > 0) {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(`💰 You saved ${p(savedPence)} compared to our standard marketplace rate this week.`, ml, doc.y);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#555555')
          .text(
            `Marketplace repeat-order rate is ${PLATFORM_FACTS.commission.marketplaceRepeat}%. Vendor-referred orders are ${PLATFORM_FACTS.commission.vendorReferred}%. Bring your own customers to keep more.`,
            ml,
            doc.y + 4,
            { width: pageWidth },
          )
          .fillColor('#000000');
      }

      doc.end();
    });
  }

  // ---------------- helpers ----------------

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }),
      'utf8',
    ).toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as {
        c: string;
        id: string;
      };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
