import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, UserStatus } from '@prisma/client';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * FR-ADM-002 - admin power tools for user + order management.
 *
 * All mutations write to AuditLog. The schema only has a `metadata` JSON
 * column on AuditLog (no dedicated previousState/newState), so we bundle
 * `{ previousState, newState }` inside metadata for forensic reconstruction.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly loyalty: LoyaltyService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Look up a user by email (case-insensitive) and decorate with loyalty
   * balance, lifetime spend, and the last 10 orders. Throws 404 when not
   * found so the admin UI can show a clean "no user" empty state.
   */
  async findByEmail(email: string) {
    const trimmed = (email ?? '').trim();
    if (!trimmed) throw new NotFoundException({ code: 'EMAIL_REQUIRED', message: 'Email is required' });

    // Prisma's `@unique` on User.email is case-sensitive at the DB layer; we
    // do a single-row lookup with `mode: 'insensitive'` to match e.g.
    // "Alice@Example.com" entered by support agents.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: trimmed, mode: 'insensitive' } },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalPence: true,
            createdAt: true,
            vendor: { select: { id: true, businessName: true } },
            items: { select: { nameSnapshot: true, quantity: true } },
          },
        },
        vendor: { select: { id: true, businessName: true, status: true } },
        _count: { select: { orders: true } },
      },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'No user found with that email' });

    const [loyaltyBalance, lifetimeAgg] = await Promise.all([
      this.loyalty.getBalance(user.id),
      this.prisma.order.aggregate({
        where: { customerId: user.id, status: OrderStatus.delivered },
        _sum: { totalPence: true },
      }),
    ]);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      vendor: user.vendor,
      orderCount: user._count.orders,
      loyaltyBalance,
      lifetimeSpendPence: lifetimeAgg._sum.totalPence ?? 0,
      orders: user.orders,
    };
  }

  /**
   * Issue goodwill credit as loyalty points (1 pence = 1 point - same
   * conversion the customer-facing redemption stepper uses). Audited via
   * LoyaltyService.adjustPoints which writes its own AuditLog row, plus
   * we also notify the customer.
   */
  async issueCredit(userId: string, amountPence: number, reason: string, adminUserId: string): Promise<void> {
    if (!Number.isInteger(amountPence) || amountPence <= 0) {
      throw new ForbiddenException({ code: 'INVALID_AMOUNT', message: 'amountPence must be a positive integer' });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    await this.loyalty.adjustPoints(userId, amountPence, reason, adminUserId);
    await this.notifications.enqueue('account_credit_issued', {
      userId,
      amountPence,
      reason,
      customerName: user.firstName ?? '',
    });
  }

  /**
   * Suspend a user: flips public.users.status → suspended (which the global
   * SupabaseAuthGuard re-checks on every request, so all in-flight JWTs
   * stop working immediately) and revokes all Supabase auth sessions
   * globally so refresh tokens can't issue a new JWT.
   *
   * Self-suspension is blocked - admins should never be able to lock
   * themselves out by accident.
   */
  async suspendUser(userId: string, reason: string, adminUserId: string): Promise<void> {
    if (userId === adminUserId) {
      throw new ForbiddenException({ code: 'CANNOT_SUSPEND_SELF', message: 'You cannot suspend your own account' });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    await this.prisma.user.update({ where: { id: userId }, data: { status: UserStatus.suspended } });

    // Global sign-out: revokes ALL refresh tokens across devices. We log
    // failures but don't throw - the DB-side status flip is the real
    // enforcement (re-checked on every request); Supabase global sign-out
    // is a defence-in-depth that shortens the window where an existing
    // JWT could keep working.
    try {
      await this.supabase.getClient().auth.admin.signOut(userId, 'global');
    } catch (err) {
      this.logger.warn(
        `Supabase global signOut failed for ${userId}: ${(err as Error).message ?? err}`,
      );
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        entityType: 'users',
        entityId: userId,
        action: 'user.suspended',
        metadata: {
          reason,
          previousState: { status: user.status },
          newState: { status: UserStatus.suspended },
        } as Prisma.JsonObject,
      },
    });

    await this.notifications.enqueue('account_suspended', { userId, reason });
  }

  async reinstateUser(userId: string, reason: string, adminUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    await this.prisma.user.update({ where: { id: userId }, data: { status: UserStatus.active } });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        entityType: 'users',
        entityId: userId,
        action: 'user.reinstated',
        metadata: {
          reason,
          previousState: { status: user.status },
          newState: { status: UserStatus.active },
        } as Prisma.JsonObject,
      },
    });
  }

  /**
   * Force an order into any status - for emergency repair work (e.g. a
   * vendor confirmed delivery in person but their app crashed before they
   * could mark it delivered). Bypasses the normal state machine in
   * OrdersService; that's intentional and the reason is audited.
   */
  async overrideOrderStatus(
    orderId: string,
    status: OrderStatus,
    reason: string,
    adminUserId: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (order.status === status) return order;

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        entityType: 'orders',
        entityId: orderId,
        action: 'admin.order_status_override',
        metadata: {
          reason,
          previousState: { status: order.status },
          newState: { status },
        } as Prisma.JsonObject,
      },
    });
    return updated;
  }

  /**
   * GDPR / DSAR data export. Returns the customer-facing "subject access"
   * payload: profile + orders + reviews + disputes + loyalty history +
   * audit-log entries the user themselves performed.
   *
   * SECURITY: explicit `select` excludes `passwordHash` and any other
   * credential material. Never spread `findUnique({ where })` here without
   * a whitelist - the User row carries auth secrets.
   *
   * The export action itself writes an AuditLog row (action
   * `admin.user_exported`) so we have a tamper-evident record of who
   * pulled subject data and when.
   */
  async exportUserData(userId: string, adminUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatarUrl: true,
        phone: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const [orders, reviews, disputes, loyalty, auditEntries] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      this.prisma.review.findMany({ where: { customerId: userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.dispute.findMany({
        where: { OR: [{ raisedById: userId }, { order: { customerId: userId } }] },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loyaltyPoint.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        entityType: 'users',
        entityId: userId,
        action: 'admin.user_exported',
        metadata: {
          orderCount: orders.length,
          reviewCount: reviews.length,
          disputeCount: disputes.length,
          loyaltyEntryCount: loyalty.length,
        } as Prisma.JsonObject,
      },
    });

    return { user, orders, reviews, disputes, loyalty, auditEntries, exportedAt: new Date() };
  }
}
