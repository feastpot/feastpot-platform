import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, UserRole, UserStatus, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';

const ACTIVE = ['requested', 'blocked', 'processing'];
const DAY = 86_400_000;
export const ACCOUNT_RETENTION = {
  financialYears: 6,
  sellerReportingYears: 5,
  statutoryIdentityException: true,
} as const;

export interface DeletionBlocker {
  code: string;
  message: string;
  count: number;
}

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notices: NotificationsService,
  ) {}

  private async subject(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true, isTestData: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    if (![UserRole.customer, UserRole.vendor].includes(user.role as 'customer' | 'vendor')) {
      throw new ForbiddenException('This deletion process is for customer and vendor accounts');
    }
    if (user.status === UserStatus.deleted) throw new ConflictException('Account already deleted');
    return user;
  }

  async blockers(userId: string): Promise<DeletionBlocker[]> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });
    const vendorId = vendor?.id ?? null;
    // SQL casts deliberately avoid treating unfamiliar enum values as terminal.
    const orders = await this.prisma.$queryRaw<Array<{ reference: string }>>`
      SELECT order_number AS reference FROM public.orders
      WHERE (customer_id = ${userId}::uuid OR vendor_id = ${vendorId}::uuid)
        AND status::text NOT IN ('delivered', 'cancelled', 'refunded', 'rejected')
        AND NOT (status::text = 'partially_refunded' AND delivered_at IS NOT NULL)
      ORDER BY created_at`;
    const disputes = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT d.id FROM public.disputes d JOIN public.orders o ON o.id = d.order_id
      WHERE (o.customer_id = ${userId}::uuid OR o.vendor_id = ${vendorId}::uuid
        OR d.raised_by_id = ${userId}::uuid)
        AND d.status::text NOT IN ('closed', 'resolved')`;
    const chargebacks = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c.id FROM public.chargebacks c JOIN public.orders o ON o.id = c.order_id
      WHERE (o.customer_id = ${userId}::uuid OR o.vendor_id = ${vendorId}::uuid)
        AND c.status NOT IN ('won', 'lost', 'warning_closed')`;
    const bookings = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.catering_bookings
      WHERE (customer_id = ${userId}::uuid OR vendor_id = ${vendorId}::uuid)
        AND status::text NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'DECLINED')
      `;
    const payouts = vendorId
      ? await this.prisma.payout.findMany({
          where: { vendorId, status: { not: 'transferred' } },
          select: { id: true },
        })
      : [];
    const result: DeletionBlocker[] = [];
    const add = (code: string, label: string, ids: string[]) => {
      if (ids.length)
        result.push({ code, count: ids.length, message: `${label}: ${ids.join(', ')}` });
    };
    add(
      'OPEN_ORDERS',
      'Orders requiring resolution',
      orders.map((o) => o.reference),
    );
    add(
      'OPEN_DISPUTES',
      'Disputes requiring resolution',
      disputes.map((o) => o.id),
    );
    add(
      'OPEN_CHARGEBACKS',
      'Chargebacks requiring resolution',
      chargebacks.map((o) => o.id),
    );
    add(
      'ACTIVE_CATERING',
      'Catering bookings requiring resolution',
      bookings.map((o) => o.id),
    );
    add(
      'PENDING_PAYOUTS',
      'Payouts not yet transferred',
      payouts.map((o) => o.id),
    );
    if (vendorId) {
      // A zero pending-payout summary does NOT prove that unbatched earnings or
      // signed carry-forward debt have been settled. Never infer clearance.
      const history = await this.prisma.payment.count({
        where: { OR: [{ order: { vendorId } }, { cateringBooking: { vendorId } }] },
      });
      if (history) {
        result.push({
          code: 'FINAL_SETTLEMENT_REVIEW',
          count: history,
          message:
            'Finance must verify unbatched earnings, refunds and signed debt before final closure.',
        });
      }
    }
    const subscription = await this.prisma.feastPassSubscription.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (subscription && !['CANCELLED', 'EXPIRED'].includes(subscription.status)) {
      result.push({
        code: 'ACTIVE_FEASTPASS',
        count: 1,
        message: 'Cancel your FeastPass subscription before final erasure.',
      });
    }
    return result;
  }

  async status(userId: string) {
    await this.subject(userId);
    const request = await this.prisma.accountDeletionRequest.findFirst({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
    const blockers = await this.blockers(userId);
    if (request && ACTIVE.includes(request.status) && request.eligibleAt <= new Date()) {
      blockers.push({
        code: 'FINAL_ERASURE_UNVERIFIED',
        count: 1,
        message:
          'Final erasure is on hold until settlement, storage and identity removal are verified.',
      });
    }
    return { request, blockers, retention: ACCOUNT_RETENTION };
  }

  private async notice(
    tx: Prisma.TransactionClient,
    request: { id: string; eligibleAt: Date; isTestData: boolean },
    email: string,
    kind: string,
  ) {
    if (request.isTestData) {
      // A shared Redis consumer may run older code without a fixture guard.
      // Retain local intent but never put test notices into that queue.
      const evidence = JSON.stringify({
        kind,
        evidenceType: 'test_suppressed',
        recordedAt: new Date().toISOString(),
      });
      await tx.$executeRaw`
        UPDATE public.account_deletion_requests
        SET notification_evidence = notification_evidence || ${evidence}::jsonb
        WHERE id = ${request.id}::uuid`;
      return;
    }
    const subject = `Feastpot account deletion: ${kind.split(':')[0]}`;
    const html = `<p>Account deletion request ${request.id}.</p><p>Status: ${kind.split(':')[0]}.</p><p>The 14-day grace period ends at ${request.eligibleAt.toISOString()}. Open obligations must be resolved before erasure. Sign in to account settings to review or cancel your request.</p>`;
    return this.notices.createTransactionalOutbox(
      tx,
      NotificationEvent.vendor_application_email_raw,
      {
        to: email,
        subject,
        html,
        isTestData: false,
        accountDeletionRequestId: request.id,
        accountDeletionNoticeKind: kind,
      },
      `account-deletion:${request.id}:${kind}`,
    );
  }

  async request(userId: string, actorId: string, reason = 'Self-service account deletion request') {
    const subject = await this.subject(userId);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
        const existing = await tx.accountDeletionRequest.findFirst({
          where: { userId, status: { in: ACTIVE } },
        });
        if (existing) return;
        const requestedAt = new Date();
        const request = await tx.accountDeletionRequest.create({
          data: {
            userId,
            actorId,
            reason,
            requestedAt,
            eligibleAt: new Date(requestedAt.getTime() + 14 * DAY),
            isTestData: subject.isTestData,
          },
        });
        // Unpublish even when financial obligations keep final erasure queued.
        await tx.vendor.updateMany({
          where: { userId },
          data: { status: VendorStatus.suspended },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'account.deletion_requested',
            entityType: 'account_deletion_requests',
            entityId: request.id,
            isTestData: subject.isTestData,
            metadata: { userId, reason, eligibleAt: request.eligibleAt.toISOString() },
          },
        });
        await this.notice(tx, request, subject.email, 'requested:user');
        const fixturePrefix = subject.email.endsWith('@test.feastpot.co.uk')
          ? subject.email.slice(0, subject.email.lastIndexOf('-') + 1)
          : null;
        const admins = await tx.user.findMany({
          where: {
            role: UserRole.admin,
            status: UserStatus.active,
            isTestData: subject.isTestData,
            ...(subject.isTestData
              ? fixturePrefix
                ? { email: { startsWith: fixturePrefix } }
                : { id: actorId }
              : {}),
          },
          select: { id: true, email: true },
        });
        for (const admin of admins) {
          await this.notice(tx, request, admin.email, `requested:admin:${admin.id}`);
          await tx.inboxNotification.create({
            data: {
              userId: admin.id,
              type: 'generic',
              title: 'Account deletion requested',
              body: `Request ${request.id} requires review after the grace period.`,
              link: '/account-deletions',
              metadata: { requestId: request.id, isTestData: subject.isTestData },
            },
          });
        }
      },
      { timeout: 20_000 },
    );
    return this.status(userId);
  }

  async cancel(userId: string, actorId: string, reason = 'Cancelled by account holder') {
    await this.subject(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const request = await tx.accountDeletionRequest.findFirst({
        where: { userId, status: { in: ACTIVE } },
      });
      if (!request) throw new ConflictException('No active deletion request');
      if (request.status === 'processing') {
        throw new ConflictException('Erasure has already started and cannot safely be cancelled');
      }
      await tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      // Never overwrite a separate enforcement suspension or republish without
      // fresh eligibility checks. Cancellation preserves the account, not listing approval.
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'account.deletion_cancelled',
          entityType: 'account_deletion_requests',
          entityId: request.id,
          isTestData: request.isTestData,
          metadata: { reason },
        },
      });
    });
    return this.status(userId);
  }

  async adminList(includeTestData = false) {
    const requests = await this.prisma.accountDeletionRequest.findMany({
      where: includeTestData ? {} : { isTestData: false },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    const items = [];
    for (const request of requests) {
      const blockers = ['cancelled', 'completed'].includes(request.status)
        ? []
        : (await this.status(request.userId)).blockers;
      items.push({ ...request, blockers });
    }
    return { items };
  }

  async adminSummary() {
    const activeCount = await this.prisma.accountDeletionRequest.count({
      where: { isTestData: false, status: { in: ACTIVE } },
    });
    return { activeCount };
  }

  async cancelById(id: string, actorId: string, reason: string) {
    const request = await this.prisma.accountDeletionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Deletion request not found');
    return this.cancel(request.userId, actorId, reason);
  }

  async export(userId: string) {
    await this.subject(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        createdAt: true,
        role: true,
        addresses: true,
        notificationPreferences: true,
        reviews: true,
      },
    });
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      include: { menus: { include: { items: true } }, documents: true, taxProfile: true },
    });
    const orders = await this.prisma.order.findMany({ where: { customerId: userId } });
    const payments = await this.prisma.payment.findMany({ where: { userId } });
    const deletionRequests = await this.prisma.accountDeletionRequest.findMany({
      where: { userId },
    });
    const cateringBookings = await this.prisma.cateringBooking.findMany({
      where: { customerId: userId },
    });
    return {
      format: 'feastpot-personal-data-v1',
      exportedAt: new Date(),
      user,
      vendor,
      orders,
      payments,
      deletionRequests,
      cateringBookings,
    };
  }

  @Cron('0 * * * *')
  async remind() {
    const now = new Date();
    const candidates = await this.prisma.accountDeletionRequest.findMany({
      where: {
        status: { in: ['requested', 'blocked'] },
        reminderAt: null,
        eligibleAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY) },
      },
      take: 100,
    });
    for (const candidate of candidates) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.accountDeletionRequest.updateMany({
          where: { id: candidate.id, reminderAt: null, status: { in: ['requested', 'blocked'] } },
          data: { reminderAt: now },
        });
        if (!changed.count) return;
        const user = await tx.user.findUnique({
          where: { id: candidate.userId },
          select: { email: true },
        });
        if (user) await this.notice(tx, candidate, user.email, 'reminder:user');
      });
    }
  }
}
