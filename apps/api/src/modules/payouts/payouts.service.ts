import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DisputeStatus,
  OrderStatus,
  PaymentType,
  PayoutStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Queue } from 'bull';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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

import type { AuthUser } from '../../auth/types';
import { CommissionService } from '../../commission/commission.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { InboxService } from '../inbox/inbox.service';
import { computeIncrementalRefundSplit } from '../payments/payments.service';

import { ListPayoutsDto } from './dto/list-payouts.dto';
import {
  applyPayoutCarryForward,
  buildPayoutStatement,
  isPayoutStatement,
  type PayoutStatement,
  type PayoutStatementEntryInput,
} from './payout-statement';
import { classifyStripeError, describeStripeError } from './stripe-error-classifier';

export const NOTIFICATIONS_QUEUE = 'notifications';

// Defined locally to avoid a circular file import with payout-batch.processor.ts
// (which imports PayoutsService). The string values must stay in sync with the
// exported constants in that file.
const PAYOUTS_QUEUE = 'payouts';
const PAYOUT_TRANSFER_JOB = 'payout-transfer';

const PAYOUT_CSV_HEADER = [
  'payout_id',
  'payout_date',
  'period_start',
  'period_end',
  'gross_pence',
  'commission_pence',
  'fees_pence',
  'refunds_pence',
  'chargebacks_pence',
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
  chargebacksPence: number | null;
  serviceFeesPence: number | null;
  adjustmentsPence: number | null;
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
    p.serviceFeesPence,
    p.refundsPence,
    p.chargebacksPence,
    p.adjustmentsPence,
    p.amountPence,
    p.currency,
    p.status,
    p.orderCount,
    p.stripeTransferId ?? '',
  ]
    .map((c) => csvCell(c))
    .join(',');
}

type WeeklyStatementSource = {
  id: string;
  kind: 'order' | 'catering';
  vendorId: string;
  reference: string;
  occurredAt: Date | null;
  subtotalPence: number;
  deliveryFeePence: number;
  serviceFeePence: number;
  discountPence: number;
  totalPence: number;
  vendorPayoutPence: number;
  commissionPence: number;
  source: string | null;
  ratePercent: string | null;
  vendor: {
    id: string;
    userId: string;
    businessName: string | null;
    commissionBps: number;
    payoutsEnabled: boolean;
    slug: string;
    referralLink: { slug: string } | null;
  };
};

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

  /**
   * Slack coalesce guard: at most one terminal-payout-failure Slack alert per
   * 30-minute window. Prevents a mass outage (many payouts failing together due
   * to one upstream issue) from sending hundreds of alerts. Finance still gets
   * a per-payout email so no individual failure is ever silently dropped.
   * In-process only - resets if the API pod restarts, which is acceptable.
   */
  private lastPayoutSlackAlertAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    // T007: in-app vendor inbox when a payout transfers.
    private readonly inbox: InboxService,
    private readonly commission: CommissionService,
    @InjectQueue(PAYOUTS_QUEUE) private readonly payoutQueue: Queue,
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
      return {
        nextPayoutDate: null,
        pendingPence: 0,
        paidToDatePence: 0,
        foundingAllowanceGrantedPence: 0,
        foundingAllowanceUsedPence: 0,
      };
    }
    const pendingStatuses = [PayoutStatus.draft, PayoutStatus.held, PayoutStatus.approved];
    const [pending, paid, next, allowance] = await Promise.all([
      this.prisma.payout.aggregate({
        where: { vendorId, status: { in: pendingStatuses } },
        _sum: { amountPence: true },
      }),
      this.prisma.payout.aggregate({
        where: { vendorId, status: PayoutStatus.transferred },
        _sum: { amountPence: true },
      }),
      this.prisma.payout.findFirst({
        where: { vendorId, status: { in: pendingStatuses } },
        orderBy: { createdAt: 'desc' },
        select: { periodEnd: true, amountPence: true },
      }),
      this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { foundingAllowanceGrantedPence: true, foundingAllowanceUsedPence: true },
      }),
    ]);
    return {
      nextPayoutDate: next?.periodEnd ?? null,
      pendingPence: pending._sum.amountPence ?? 0,
      paidToDatePence: paid._sum.amountPence ?? 0,
      foundingAllowanceGrantedPence: allowance?.foundingAllowanceGrantedPence ?? 200_000,
      foundingAllowanceUsedPence: allowance?.foundingAllowanceUsedPence ?? 0,
    };
  }

  /**
   * Streams the full payout history for the actor as CSV. Vendors see only
   * their own rows; finance/admin see all (optionally narrowed by vendorId).
   * Capped at 5 000 rows to match the audit-log export.
   *
   * Columns are chosen to match accountancy templates. Current payouts use
   * values persisted from the canonical statement; unavailable legacy values
   * are emitted as blank cells rather than misleading zeroes.
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

    // Enqueue the transfer job with automatic retry and exponential backoff.
    // PayoutBatchProcessor.processTransfer() executes the Stripe call and
    // classifies errors into transient (retried by Bull) vs terminal (handled
    // immediately by marking the payout failed and alerting).
    //
    // Why async? Decouples finance's approve action from the Stripe network
    // round-trip. Finance can batch-approve many payouts without blocking on
    // each transfer. The payout list shows live status (approved -> transferred
    // or failed) so the outcome is still visible.
    //
    // Idempotency: Bull does not de-duplicate by jobId for failed jobs, but
    // the CAS guard above (draft -> approved) prevents double-enqueue from
    // rapid double-clicks. Stripe's idempotency key in executeTransfer()
    // prevents double-payment if two concurrent jobs somehow both reach Stripe.
    try {
      await this.payoutQueue.add(
        PAYOUT_TRANSFER_JOB,
        { payoutId },
        {
          // 5 attempts: ~30 s, ~1 min, ~2 min, ~4 min, ~8 min total.
          // This covers transient Stripe/network issues (rate limits, 5xx,
          // TCP resets) without tying up the queue for hours.
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (e) {
      // Bull/Redis unavailable: roll the CAS back to draft so finance can
      // retry once Redis recovers. Without rollback, the payout stays
      // `approved` forever with no job to advance it.
      await this.prisma.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.approved },
        data: { status: PayoutStatus.draft, approvedById: null, approvedAt: null },
      });
      throw new ServiceUnavailableException({
        code: 'PAYOUT_QUEUE_UNAVAILABLE',
        message: 'Could not queue payout transfer; please retry in a moment.',
      });
    }

    return this.prisma.payout.findUnique({ where: { id: payoutId } });
  }

  // ---------- Transfer execution (called by PayoutBatchProcessor) ----------

  /**
   * Executes the Stripe transfer for an approved payout. Called by the
   * `payout-transfer` Bull job processor with up to 5 retry attempts.
   *
   * Error handling:
   *  - Transient (network, rate limit, Stripe 5xx): re-throws so Bull retries.
   *  - Terminal (account_closed, debit_not_authorized, etc.): marks the payout
   *    `failed`, alerts via alertPayoutFailure(), then returns without throwing
   *    so Bull considers the job complete (preventing pointless retries).
   *
   * Idempotency:
   *  - If the payout is already `transferred` (Stripe succeeded but the DB
   *    update timed out, leaving Bull to retry), the method returns early.
   *  - Stripe's idempotency key `payout-transfer-${payoutId}` ensures a
   *    network-timeout retry returns the existing transfer rather than
   *    creating a second one.
   */
  async executeTransfer(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        vendor: {
          select: {
            stripeAccountId: true,
            payoutsEnabled: true,
            userId: true,
            businessName: true,
          },
        },
      },
    });

    if (!payout) {
      throw new Error(`Payout ${payoutId} not found - cannot execute transfer`);
    }

    // Idempotency: success already committed on a prior attempt.
    if (payout.status === PayoutStatus.transferred) {
      this.logger.warn(`Payout ${payoutId} already transferred - skipping duplicate job`);
      return;
    }
    // Terminal: already marked failed by a prior attempt (e.g. the handler
    // below ran on a previous execution). Do not re-process.
    if (payout.status === PayoutStatus.failed) {
      this.logger.warn(`Payout ${payoutId} is already failed - stale job, skipping`);
      return;
    }

    if (payout.status !== PayoutStatus.approved && payout.status !== PayoutStatus.processing) {
      throw new Error(
        `Payout ${payoutId} has unexpected status "${payout.status}" - cannot transfer`,
      );
    }

    // Commit a durable processing claim under the same vendor-period lock used
    // by refund settlement. Stripe remains outside the DB transaction; a crash
    // after Stripe success is recovered by replaying the deterministic key
    // while the payout remains processing.
    try {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const lockSubject = payout.periodEnd?.toISOString() ?? payout.id;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${payout.vendorId}:${lockSubject}`}))`;
        const current = await tx.payout.findUnique({
          where: { id: payoutId },
          include: { vendor: { select: { stripeAccountId: true } } },
        });
        if (!current) throw new Error(`Payout ${payoutId} disappeared before transfer`);
        if (current.status === PayoutStatus.transferred) return null;
        if (
          current.status !== PayoutStatus.approved &&
          current.status !== PayoutStatus.processing
        ) {
          throw new Error(
            `Payout ${payoutId} has unexpected status "${current.status}" - cannot transfer`,
          );
        }
        if (current.status === PayoutStatus.approved) {
          await tx.payout.update({
            where: { id: payoutId },
            data: { status: PayoutStatus.processing, failureReason: null },
          });
        }
        return current;
      });
      if (!claimed) return;
      const transfer = await this.stripe.createTransfer({
        amountPence: claimed.amountPence,
        destinationAccountId: claimed.vendor.stripeAccountId!,
        payoutId: claimed.id,
        idempotencyKey: `payout-transfer-${claimed.id}`,
      });
      await this.prisma.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.processing },
        data: {
          status: PayoutStatus.transferred,
          stripeTransferId: transfer.id,
          transferredAt: new Date(),
        },
      });
    } catch (e) {
      const classification = classifyStripeError(e);

      if (classification === 'transient') {
        this.logger.warn(
          `Transient payout ${payoutId} transfer failure (Bull will retry): ${(e as Error).message}`,
        );
        throw e; // Let Bull retry with exponential backoff.
      }

      // Terminal: retry cannot fix this. Mark failed and alert immediately
      // rather than consuming all remaining retry attempts.
      this.logger.error(`Terminal payout ${payoutId} transfer failure: ${(e as Error).message}`);
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: PayoutStatus.failed, failureReason: (e as Error).message },
      });
      await this.alertPayoutFailure(payout, e as Error);
      return; // Do not throw - Bull marks the job complete (terminal handled above).
    }

    // Best-effort side effects: money has moved and DB is committed. Failures
    // here MUST NOT mark the payout failed or undo the transfer.
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
  }

  /**
   * Called by PayoutBatchProcessor.onFailed() when a payout-transfer job
   * exhausts all 5 transient-retry attempts. At this point all failures were
   * transient (network, rate-limit, Stripe 5xx) rather than a terminal
   * Stripe error, but the payout still cannot complete. Marks the payout
   * `failed` (if not already) and fires the same alerts as a terminal failure.
   */
  async handleExhaustedPayoutTransfer(payoutId: string, err: Error): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        vendor: {
          select: {
            stripeAccountId: true,
            userId: true,
            businessName: true,
          },
        },
      },
    });

    if (!payout) {
      this.logger.error(`handleExhaustedPayoutTransfer: payout ${payoutId} not found`);
      return;
    }

    // Guard: terminal handler in executeTransfer() may have already run on the
    // last attempt before @OnQueueFailed fires for the same execution.
    if (payout.status === PayoutStatus.failed || payout.status === PayoutStatus.transferred) {
      return;
    }

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.failed,
        failureReason: `All retry attempts exhausted: ${err.message}`,
      },
    });
    await this.alertPayoutFailure(payout, err);
  }

  /**
   * Fires Slack (coalesced), finance email, and vendor email when a payout
   * transfer fails terminally or exhausts all retries.
   *
   * Slack coalescing: at most one alert per 30-minute window (in-process).
   * Finance email: always sent per payout (no coalescing) so no individual
   * failure is silently dropped.
   * Vendor notification: always sent so the vendor knows what to fix.
   */
  private async alertPayoutFailure(
    payout: {
      id: string;
      vendorId: string;
      amountPence: number;
      vendor: { userId: string; businessName: string | null; stripeAccountId: string | null };
    },
    err: Error,
  ): Promise<void> {
    const errorSummary = describeStripeError(err);
    const isLive = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_');
    const stripeDashboardUrl = payout.vendor.stripeAccountId
      ? `https://dashboard.stripe.com${isLive ? '' : '/test'}/connect/accounts/${payout.vendor.stripeAccountId}`
      : `https://dashboard.stripe.com${isLive ? '' : '/test'}/connect/accounts`;

    // Slack (coalesced to suppress alert floods during mass outages).
    const COALESCE_MS = 30 * 60 * 1000;
    const webhookUrl = process.env.QUEUE_ALERT_SLACK_WEBHOOK_URL;
    const now = Date.now();

    if (webhookUrl && now - this.lastPayoutSlackAlertAt > COALESCE_MS) {
      this.lastPayoutSlackAlertAt = now;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: [
            ':x: *Feastpot payout transfer failed (terminal)*',
            `Payout: \`${payout.id}\``,
            `Vendor: ${payout.vendor.businessName ?? payout.vendorId}`,
            `Amount: £${(payout.amountPence / 100).toFixed(2)}`,
            `Error: ${err.message}`,
            `<${stripeDashboardUrl}|View Stripe account>`,
            `<${process.env.ADMIN_URL ?? 'https://admin.feastpot.co.uk'}/payouts|Admin payouts>`,
          ].join('\n'),
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch((e: Error) => {
        this.logger.error(`Slack payout failure alert delivery failed: ${e.message}`);
      });
    } else if (!webhookUrl) {
      this.logger.warn(
        `Payout ${payout.id} failed terminally (no Slack webhook set): ${err.message}`,
      );
    } else {
      this.logger.warn(
        `Slack payout failure alert suppressed (30-min coalesce active) for payout ${payout.id}`,
      );
    }

    // Finance email: not coalesced so every individual payout failure is
    // accounted for in the finance inbox.
    const financeEmail =
      process.env.FINANCE_ALERT_EMAIL ??
      process.env.VENDOR_APPLICATIONS_ADMIN_EMAIL ??
      'soul@feastpot.co.uk';
    const adminBase = process.env.ADMIN_URL ?? 'https://admin.feastpot.co.uk';
    try {
      await this.notifications.add('vendor_application_email_raw', {
        to: financeEmail,
        subject: `[ACTION REQUIRED] Payout transfer failed for ${payout.vendor.businessName ?? payout.id}`,
        html: `<p>All retry attempts exhausted for payout <strong>${payout.id}</strong> (vendor: ${payout.vendor.businessName ?? 'unknown'}, £${(payout.amountPence / 100).toFixed(2)}).</p>
<p><strong>Error:</strong> ${err.message}</p>
<p>The payout status is now <code>failed</code>. To retry after resolving the root cause:</p>
<p><a href="${adminBase}/payouts/${payout.id}">View payout in admin</a> &rarr; Reset to draft &rarr; Re-approve.</p>`,
      });
    } catch (e) {
      this.logger.error(
        `Finance email for terminal payout failure ${payout.id} failed: ${(e as Error).message}`,
      );
    }

    // Vendor notification: tells the vendor what is wrong and what to fix.
    try {
      await this.notifications.add('payout_failed_terminal', {
        vendorId: payout.vendorId,
        vendorUserId: payout.vendor.userId,
        payoutId: payout.id,
        amountPence: payout.amountPence,
        errorSummary,
        stripeDashboardUrl,
        supportEmail: 'support@feastpot.co.uk',
      });
    } catch (e) {
      this.logger.error(
        `Vendor payout failure notification for ${payout.id} failed: ${(e as Error).message}`,
      );
    }
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

    // Pull all qualifying records once, then normalize them into the canonical
    // statement-source shape used for batch creation and every presentation.
    const orders = await this.prisma.order.findMany({
      where: {
        // partially_refunded delivered orders STILL owe the vendor their net
        // remainder: the refund/credit ledger rows aggregated below deduct the
        // clawback, so including them pays gross − clawback. Excluding them
        // would suppress the payout entirely. Fully `refunded` orders are
        // excluded: gross − clawback nets to zero, so skipping them is
        // equivalent and avoids zero-line noise. Orders refunded before
        // delivery never get deliveredAt and can't enter the window.
        status: { in: [OrderStatus.delivered, OrderStatus.partially_refunded] },
        deliveredAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        vendorId: true,
        orderNumber: true,
        subtotalPence: true,
        deliveryFeePence: true,
        serviceFeePence: true,
        discountPence: true,
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
            slug: true,
            // Required to build the correct attribution URL for the "Grow your
            // earnings" nudge in the payout email. VendorReferralLink.slug is the
            // slug the /v/[slug] click recorder actually resolves; Vendor.slug may
            // differ and would silently break attribution if used instead.
            referralLink: { select: { slug: true } },
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
        attribution: { select: { resolvedSource: true } },
      },
    });
    // Catering has no Order row, but completed bookings participate in exactly
    // the same weekly vendor batch. Shape them as ledger batch entries so the
    // established aggregate/refund-credit arithmetic remains the single source
    // of payout truth (and no immediate catering transfer is needed).
    const cateringBookings = await this.prisma.cateringBooking.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        vendorId: true,
        totalPence: true,
        commissionPence: true,
        commissionPercent: true,
        attributionSource: true,
        completedAt: true,
        vendor: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            commissionBps: true,
            payoutsEnabled: true,
            slug: true,
            referralLink: { select: { slug: true } },
          },
        },
      },
    });
    const statementSources: WeeklyStatementSource[] = [
      ...orders.map((order) => ({
        id: order.id,
        kind: 'order' as const,
        vendorId: order.vendorId,
        reference: order.orderNumber,
        occurredAt: order.deliveredAt,
        subtotalPence: order.subtotalPence,
        deliveryFeePence: order.deliveryFeePence,
        serviceFeePence: order.serviceFeePence,
        discountPence: order.discountPence,
        totalPence: order.totalPence,
        vendorPayoutPence: order.vendorPayoutPence,
        commissionPence: order.commissionPence,
        source: order.orderCommission?.source ?? order.attribution?.resolvedSource ?? null,
        ratePercent: order.orderCommission?.ratePercent.toString() ?? null,
        vendor: order.vendor,
      })),
      ...cateringBookings.map((booking) => ({
        id: booking.id,
        kind: 'catering' as const,
        vendorId: booking.vendorId,
        reference: `CATERING-${booking.id.slice(-8)}`,
        occurredAt: booking.completedAt,
        subtotalPence: booking.totalPence,
        deliveryFeePence: 0,
        serviceFeePence: 0,
        discountPence: 0,
        totalPence: booking.totalPence,
        vendorPayoutPence: booking.totalPence - booking.commissionPence,
        commissionPence: booking.commissionPence,
        source: booking.attributionSource,
        ratePercent: booking.commissionPercent.toString(),
        vendor: booking.vendor,
      })),
    ];

    // Group by vendor.
    type Group = { vendor: WeeklyStatementSource['vendor']; entries: WeeklyStatementSource[] };
    const byVendor = new Map<string, Group>();
    for (const entry of statementSources) {
      const group = byVendor.get(entry.vendorId) ?? { vendor: entry.vendor, entries: [] };
      group.entries.push(entry);
      byVendor.set(entry.vendorId, group);
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
      const orderIds = group.entries
        .filter((entry) => entry.kind === 'order')
        .map((entry) => entry.id);
      const cateringBookingIds = group.entries
        .filter((entry) => entry.kind === 'catering')
        .map((entry) => entry.id);
      const ledgerRows = await this.prisma.payment.findMany({
        where: {
          OR: [{ orderId: { in: orderIds } }, { cateringBookingId: { in: cateringBookingIds } }],
          type: { in: [PaymentType.refund, PaymentType.partial_refund, PaymentType.credit] },
        },
        select: {
          orderId: true,
          cateringBookingId: true,
          type: true,
          amountPence: true,
        },
      });
      const lostChargebacks = await this.prisma.chargeback.findMany({
        where: {
          orderId: { in: orderIds },
          status: 'lost',
          reconciledAt: { not: null },
        },
        select: { orderId: true, amountPence: true },
      });

      const canonicalEntries: PayoutStatementEntryInput[] = group.entries.map((entry) => {
        const subjectLedger = ledgerRows.filter(
          (payment) =>
            payment.orderId === (entry.kind === 'order' ? entry.id : null) ||
            payment.cateringBookingId === (entry.kind === 'catering' ? entry.id : null),
        );
        const customerRefundsPence = -subjectLedger
          .filter(
            (payment) =>
              payment.type === PaymentType.refund || payment.type === PaymentType.partial_refund,
          )
          .reduce((sum, payment) => sum + payment.amountPence, 0);
        const absorbedPence = subjectLedger
          .filter((payment) => payment.type === PaymentType.credit)
          .reduce((sum, payment) => sum + payment.amountPence, 0);
        const totalVendorDeductionPence = Math.max(0, customerRefundsPence - absorbedPence);
        const chargebackCustomerPence =
          entry.kind === 'order'
            ? lostChargebacks
                .filter((chargeback) => chargeback.orderId === entry.id)
                .reduce((sum, chargeback) => sum + chargeback.amountPence, 0)
            : 0;
        const ordinaryCustomerRefundPence = Math.max(
          0,
          customerRefundsPence - chargebackCustomerPence,
        );
        const chargebackSplit =
          chargebackCustomerPence > 0
            ? computeIncrementalRefundSplit(
                ordinaryCustomerRefundPence,
                Math.min(chargebackCustomerPence, entry.totalPence - ordinaryCustomerRefundPence),
                {
                  subtotalPence: entry.subtotalPence,
                  serviceFeePence: entry.serviceFeePence,
                  deliveryFeePence: entry.deliveryFeePence,
                  discountPence: entry.discountPence,
                  commissionPence: entry.commissionPence,
                },
                entry.totalPence,
              )
            : null;
        const chargebacksPence = Math.min(
          totalVendorDeductionPence,
          chargebackSplit?.vendorClawbackPence ?? 0,
        );

        return {
          id: entry.id,
          kind: entry.kind,
          reference: entry.reference,
          occurredAt: entry.occurredAt?.toISOString() ?? null,
          source: entry.source,
          effectiveCommissionRatePercent: entry.ratePercent,
          grossPence: entry.totalPence,
          foodSubtotalPence: entry.subtotalPence,
          commissionPence: entry.commissionPence,
          serviceFeesPence: entry.serviceFeePence,
          refundsPence: totalVendorDeductionPence - chargebacksPence,
          chargebacksPence,
          vendorPayoutBeforeDeductionsPence: entry.vendorPayoutPence,
        };
      });

      // Open-dispute hold check.
      const openDisputes = await this.prisma.dispute.count({
        where: {
          orderId: { in: orderIds },
          status: {
            in: [DisputeStatus.open, DisputeStatus.vendor_contacted, DisputeStatus.escalated],
          },
        },
      });

      const baseStatement = buildPayoutStatement({
        vendorId,
        vendorBusinessName: group.vendor.businessName ?? vendorId,
        periodStart: start,
        periodEnd: end,
        hasOpenDispute: openDisputes > 0,
        entries: canonicalEntries,
      });
      let statement = baseStatement;

      try {
        const payout = await this.prisma.$transaction(async (tx) => {
          const periodLock = `payout:${vendorId}:${end.toISOString()}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${periodLock}))`;
          const duplicate = await tx.payout.findFirst({ where: { vendorId, periodEnd: end } });
          if (duplicate) return duplicate;
          const prior = await tx.payout.findFirst({
            where: { vendorId, periodEnd: { lt: end } },
            orderBy: { periodEnd: 'desc' },
            select: { closingBalancePence: true },
          });
          statement = applyPayoutCarryForward(baseStatement, prior?.closingBalancePence ?? 0);
          // The immutable statement snapshot is the source of truth for every
          // persisted total and every downstream representation.
          const summary = statement.summary;
          return tx.payout.create({
            data: {
              vendorId,
              status: statement.status,
              amountPence: summary.netPayoutPence,
              openingBalancePence: summary.openingBalancePence,
              rawNetPence: summary.rawNetPayoutPence,
              closingBalancePence: summary.closingBalancePence,
              grossPence: summary.grossSalesPence,
              commissionPence: summary.commissionPence,
              refundsPence: summary.refundsPence,
              chargebacksPence: summary.chargebacksPence,
              serviceFeesPence: summary.serviceFeesPence,
              adjustmentsPence: summary.adjustmentsPence,
              statement: statement as unknown as Prisma.InputJsonValue,
              orderCount: summary.entryCount,
              periodStart: start,
              periodEnd: end,
              holdReason: statement.holdReason,
              currency: 'GBP',
            },
          });
        });
        created.push({ vendorId, payoutId: payout.id });

        // Per-vendor payout statement notification with per-order data for the
        // PDF statement. Best-effort -- never blocks payout creation.
        try {
          // Generate PDF statement -- stored as base64 in the job payload so
          // the notification processor can attach it to the email without
          // needing to query the DB again. Failure is non-blocking.
          let pdfBase64: string | undefined;
          try {
            const pdfBuf = await this.buildPayoutStatementPdf(statement);
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
            referralUrl: group.vendor.referralLink?.slug
              ? `https://feastpot.co.uk/v/${encodeURIComponent(group.vendor.referralLink.slug)}`
              : null,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            statement,
            ...statement.summary,
            grossPence: statement.summary.grossSalesPence,
            netPence: statement.summary.netPayoutPence,
            amountPence: statement.summary.netPayoutPence,
            orderCount: statement.summary.entryCount,
            orders: statement.entries,
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
    const allOrders = [...byVendor.values()].flatMap((g) => g.entries);
    const totalSubtPeriod = allOrders.reduce((s, o) => s + o.subtotalPence, 0);
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
        statement: true,
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

    if (isPayoutStatement(payout.statement)) {
      return payout.statement.entries.map((entry) => ({
        id: entry.id,
        entryKind: entry.kind,
        orderNumber: entry.reference,
        deliveredAt: entry.occurredAt,
        subtotalPence: entry.foodSubtotalPence,
        grossPence: entry.grossPence,
        commissionPence: entry.commissionPence,
        effectiveCommissionRatePercent: entry.effectiveCommissionRatePercent,
        serviceFeesPence: entry.serviceFeesPence,
        refundsPence: entry.refundsPence,
        chargebacksPence: entry.chargebacksPence,
        adjustmentsPence: entry.adjustmentsPence,
        vendorPayoutPence: entry.netPence,
        attributionSource: entry.source,
        discountPence: 0,
        discountFundedBy: null,
        foundingAllowanceAppliedPence: 0,
      }));
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
      status: { in: [OrderStatus.delivered, OrderStatus.partially_refunded] },
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
        discountPence: true,
        discountFundedBy: true,
        foundingAllowanceAppliedPence: true,
        attribution: { select: { resolvedSource: true } },
        orderCommission: { select: { ratePercent: true, source: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      subtotalPence: o.subtotalPence,
      commissionPence: o.commissionPence,
      effectiveCommissionRatePercent: o.orderCommission?.ratePercent.toString() ?? null,
      vendorPayoutPence: o.vendorPayoutPence,
      discountPence: o.discountPence,
      discountFundedBy: o.discountFundedBy,
      foundingAllowanceAppliedPence: o.foundingAllowanceAppliedPence,
      // resolvedSource is null only on pre-attribution rows; treat as MARKETPLACE_FIRST.
      attributionSource: (o.orderCommission?.source ?? o.attribution?.resolvedSource ?? null) as
        | string
        | null,
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
      'entry_kind',
      'order_date',
      'order_number',
      'attribution_source',
      'effective_commission_rate_percent',
      'gross_pence',
      'service_fees_pence',
      'refunds_pence',
      'chargebacks_pence',
      'adjustments_pence',
      'subtotal_gbp',
      'commission_gbp',
      'net_to_vendor_gbp',
      'subtotal_pence',
      'commission_pence',
      'net_to_vendor_pence',
    ].join(',');
    write(HEADER + '\n');

    const where: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.delivered, OrderStatus.partially_refunded] },
    };

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
        select: { vendorId: true, periodStart: true, periodEnd: true, statement: true },
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
      if (isPayoutStatement(payout.statement)) {
        for (const entry of payout.statement.entries) {
          write(
            [
              entry.kind,
              isoDateOnly(entry.occurredAt ? new Date(entry.occurredAt) : null),
              entry.reference,
              entry.source ?? 'not available',
              entry.effectiveCommissionRatePercent ?? 'not available',
              entry.grossPence,
              entry.serviceFeesPence ?? 'not available',
              entry.refundsPence,
              entry.chargebacksPence,
              entry.adjustmentsPence ?? 'not available',
              (entry.foodSubtotalPence / 100).toFixed(2),
              (entry.commissionPence / 100).toFixed(2),
              (entry.netPence / 100).toFixed(2),
              entry.foodSubtotalPence,
              entry.commissionPence,
              entry.netPence,
            ]
              .map((cell) => csvCell(cell))
              .join(',') + '\n',
          );
        }
        return;
      }
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
          'order',
          isoDateOnly(r.deliveredAt),
          r.orderNumber,
          src,
          'not available',
          'not available',
          'not available',
          'not available',
          'not available',
          'not available',
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
  async buildPayoutStatementPdf(statement: PayoutStatement): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const p = (pence: number | null) =>
        pence === null ? 'not available' : `£${(pence / 100).toFixed(2)}`;
      const dateStr = (s: string | null) =>
        s
          ? new Date(s).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '--';
      const srcLabel = (src: string) =>
        src === 'VENDOR_REFERRED' ? 'Your referral' : 'Marketplace';

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const ml = doc.page.margins.left;

      // ─── Header ──────────────────────────────────────────────────────────
      doc.fontSize(20).font('Helvetica-Bold').text('Feastpot', ml, 40);
      doc.fontSize(10).font('Helvetica').text('Payout Statement', ml, 64);
      doc.fontSize(10).text(`Vendor: ${statement.vendorBusinessName}`, ml, 76);
      doc
        .text(
          `Period: ${dateStr(statement.periodStart)} to ${dateStr(statement.periodEnd)}`,
          ml,
          88,
        )
        .moveDown(2);

      // ─── Order table ─────────────────────────────────────────────────────
      const cols = [ml, ml + 70, ml + 130, ml + 210, ml + 265, ml + 310, ml + 380];
      const headers = [
        'Order #',
        'Date',
        'Food subtotal',
        'Source',
        'Rate',
        'Commission',
        'Net to you',
      ];
      const colWidths = [70, 60, 80, 55, 45, 70, 70];

      // Table header row
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, cols[i], doc.y, { width: colWidths[i] }));
      doc.moveDown(0.3);
      const lineY = doc.y;
      doc
        .moveTo(ml, lineY)
        .lineTo(ml + pageWidth, lineY)
        .stroke();
      doc.moveDown(0.4);

      // Data rows
      doc.font('Helvetica');
      for (const entry of statement.entries) {
        const rowY = doc.y;
        const cells = [
          entry.reference,
          dateStr(entry.occurredAt),
          p(entry.foodSubtotalPence),
          entry.source ? srcLabel(entry.source) : 'not available',
          entry.effectiveCommissionRatePercent === null
            ? 'not available'
            : `${entry.effectiveCommissionRatePercent}%`,
          p(entry.commissionPence),
          p(entry.netPence),
        ];
        cells.forEach((cell, i) => doc.text(cell, cols[i], rowY, { width: colWidths[i] }));
        doc.moveDown(0.5);
      }

      // Separator
      doc.moveDown(0.5);
      const sepY = doc.y;
      doc
        .moveTo(ml, sepY)
        .lineTo(ml + pageWidth, sepY)
        .stroke();
      doc.moveDown(0.8);

      // ─── Summary ─────────────────────────────────────────────────────────
      const totalSubtotal = statement.entries.reduce((s, entry) => s + entry.foodSubtotalPence, 0);
      const blendedPct =
        totalSubtotal > 0
          ? ((statement.summary.commissionPence / totalSubtotal) * 100).toFixed(2)
          : 'not available';

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

      row('Total entries:', String(statement.summary.entryCount));
      row('Gross sales:', p(statement.summary.grossSalesPence));
      row('Commission deducted:', p(statement.summary.commissionPence));
      row(
        'Blended effective rate:',
        blendedPct === 'not available' ? blendedPct : `${blendedPct}%`,
      );
      row('Refunds:', p(statement.summary.refundsPence));
      row('Chargebacks:', p(statement.summary.chargebacksPence));
      row('Service fees:', p(statement.summary.serviceFeesPence));
      row('Adjustments:', p(statement.summary.adjustmentsPence));
      row('Net payout:', p(statement.summary.netPayoutPence));

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
