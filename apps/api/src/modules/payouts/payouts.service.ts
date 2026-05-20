import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import {
  DisputeStatus,
  OrderStatus,
  PaymentType,
  PayoutStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Queue } from 'bull';

import type { AuthUser } from '../../auth/types';
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
  return [
    p.id,
    isoDateOnly(payoutDate),
    isoDateOnly(p.periodStart),
    isoDateOnly(p.periodEnd),
    p.grossPence,
    p.commissionPence,
    0,
    p.refundsPence,
    0,
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
  orders: Array<{ id: string; totalPence: number; vendorPayoutPence: number; commissionPence: number }>;
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
  const refundsPence = Math.max(0, input.refundDeductionsPence);
  const netPence = Math.max(0, grossPence - commissionPence - refundsPence);
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
  ) {}

  // ---------------- list/get ----------------

  async list(user: AuthUser, dto: ListPayoutsDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.PayoutWhereInput = {};
    if (dto.status) where.status = dto.status;

    if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!vendor) return { data: [], nextCursor: null };
      where.vendorId = vendor.id;
    } else if (user.role === UserRole.finance || user.role === UserRole.admin) {
      if (dto.vendorId) where.vendorId = dto.vendorId;
    } else {
      throw new ForbiddenException({ code: 'PAYOUTS_FORBIDDEN', message: 'You may not view payouts' });
    }

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.PayoutWhereInput = cursor
      ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
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
      include: { vendor: { select: { id: true, userId: true, businessName: true, stripeAccountId: true } } },
    });
    if (!payout) throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
    if (
      user.role !== UserRole.admin &&
      user.role !== UserRole.finance &&
      !(user.role === UserRole.vendor && payout.vendor.userId === user.id)
    ) {
      throw new ForbiddenException({ code: 'PAYOUT_FORBIDDEN', message: 'You may not view this payout' });
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
      include: { vendor: { select: { stripeAccountId: true, payoutsEnabled: true, userId: true } } },
    });
    if (!payout) throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
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
      throw new BadRequestException({ code: 'PAYOUT_ZERO_OR_NEGATIVE', message: 'Payout net is zero or negative' });
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

    try {
      const transfer = await this.stripe.createTransfer({
        amountPence: payout.amountPence,
        destinationAccountId: payout.vendor.stripeAccountId,
        payoutId: payout.id,
      });
      const updated = await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.transferred,
          stripeTransferId: transfer.id,
          transferredAt: new Date(),
        },
      });
      await this.notifications.add('payout_transferred', {
        vendorId: payout.vendorId,
        vendorUserId: payout.vendor.userId,
        payoutId: payout.id,
        amountPence: payout.amountPence,
      });
      // T007: in-app inbox row alongside the outbound email.
      await this.inbox.notify({
        userId: payout.vendor.userId,
        type: 'payout_processed',
        title: `Payout sent: £${(payout.amountPence / 100).toFixed(2)}`,
        body: 'Your weekly payout has been transferred to your linked bank account.',
        link: '/payouts',
        metadata: { payoutId: payout.id, amountPence: payout.amountPence },
      });
      return updated;
    } catch (e) {
      this.logger.error(`Stripe transfer failed for payout ${payoutId}: ${(e as Error).message}`);
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: PayoutStatus.failed, failureReason: (e as Error).message },
      });
      throw new BadRequestException({ code: 'STRIPE_TRANSFER_FAILED', message: (e as Error).message });
    }
  }

  async holdPayout(payoutId: string, holdReason: string, actor: AuthUser) {
    if (actor.role !== UserRole.finance && actor.role !== UserRole.admin) {
      throw new ForbiddenException({
        code: 'PAYOUT_HOLD_FORBIDDEN',
        message: 'Only finance or admin may hold payouts',
      });
    }
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId }, select: { status: true, vendorId: true, vendor: { select: { userId: true } } } });
    if (!payout) throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' });
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
      throw new BadRequestException({ code: 'PAYOUT_CHANGED_CONCURRENTLY', message: 'Payout changed concurrently' });
    }
    await this.notifications.add('payout_held', {
      vendorId: payout.vendorId,
      vendorUserId: payout.vendor.userId,
      payoutId,
      reason: holdReason,
      heldByUserId: actor.id,
    });
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
    this.logger.log(`Running weekly payout batch for ${start.toISOString()} → ${end.toISOString()}`);

    // Pull all delivered orders in the window with vendor info.
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.delivered, deliveredAt: { gte: start, lt: end } },
      select: {
        id: true,
        vendorId: true,
        totalPence: true,
        vendorPayoutPence: true,
        commissionPence: true,
        vendor: { select: { id: true, userId: true, commissionBps: true, payoutsEnabled: true } },
      },
    });

    // Group by vendor.
    type Group = { vendor: typeof orders[number]['vendor']; orders: typeof orders };
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

      // Refund deductions: sum of credit-type Payment amounts for this vendor's orders in window.
      const orderIds = group.orders.map((o) => o.id);
      const refundDeductions = await this.prisma.payment.aggregate({
        where: { orderId: { in: orderIds }, type: { in: [PaymentType.refund, PaymentType.partial_refund] } },
        _sum: { amountPence: true },
      });
      // amount on refund rows is negative; convert to positive deduction.
      const refundsPence = Math.max(0, -(refundDeductions._sum.amountPence ?? 0));

      // Open-dispute hold check.
      const openDisputes = await this.prisma.dispute.count({
        where: {
          orderId: { in: orderIds },
          status: { in: [DisputeStatus.open, DisputeStatus.vendor_contacted, DisputeStatus.escalated] },
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

    if (created.length > 0) {
      await this.notifications.add('payout_batch_ready', {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        createdCount: created.length,
      });
    }
    return { periodStart: start, periodEnd: end, created, skippedVendorIds: skipped };
  }

  // ---------------- helpers ----------------

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
