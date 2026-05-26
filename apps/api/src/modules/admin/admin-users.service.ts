import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, UserRole, UserStatus } from '@prisma/client';

import type { JoinedRange, ListAdminUsersDto } from './dto/list-admin-users.dto';
import type { StaffRoleValue } from './dto/admin-user-actions.dto';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { staffPortalInviteTemplate } from '../notifications/templates/staff-portal-invite.template';

const STAFF_ROLE_LABELS: Record<StaffRoleValue, string> = {
  admin: 'Admin',
  support: 'Support',
  finance: 'Finance',
  compliance: 'Compliance',
};

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
    private readonly config: ConfigService,
    private readonly email: EmailProvider,
  ) {}

  /**
   * Provision a new staff user (admin/support/finance/compliance).
   *
   * Mirrors the vendor-application approval flow:
   *   1. Pre-flight: email collision check against Prisma User table.
   *   2. Create Supabase auth user (email_confirm: true so the magic link
   *      is itself the confirmation step).
   *   3. Insert Prisma User row pinned to the Supabase uid (same convention
   *      as users.service.sync) — wrapped in a try/catch that compensates by
   *      deleting the orphan Supabase user on failure.
   *   4. Audit-log the creation.
   *   5. Best-effort magic-link invite email (does NOT unwind on failure;
   *      the admin can resend by changing nothing and re-saving, or via
   *      the existing "Add user" → same email flow once a resend route is
   *      added).
   *
   * SECURITY: the caller's role is checked at the controller layer
   * (`@Roles(UserRole.admin)`). This method assumes the caller IS an
   * admin — it does not re-verify.
   */
  async createStaffUser(
    dto: {
      email: string;
      firstName: string;
      lastName: string;
      role: StaffRoleValue;
      sendInvite?: boolean;
    },
    actorId: string,
  ): Promise<{ id: string; email: string; role: UserRole; inviteEmailSent: boolean }> {
    const normalisedEmail = dto.email.trim().toLowerCase();
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();

    // Pre-flight: avoid hitting a unique-constraint blow-up inside the
    // post-Supabase compensation window.
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: normalisedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: `A user with email ${normalisedEmail} already exists.`,
      });
    }

    const supabaseAdmin = this.supabase.getClient().auth.admin;
    const { data: created, error: createErr } = await supabaseAdmin.createUser({
      email: normalisedEmail,
      email_confirm: true,
      // `app_metadata` is server-managed and is what SupabaseAuthGuard
      // trusts for role (along with the top-level JWT claim). NEVER put
      // role in `user_metadata` — that field is user-writable in client
      // SDKs and would be a privilege-escalation vector.
      app_metadata: { role: dto.role },
      user_metadata: {
        source: 'admin_console_invite',
        invitedBy: actorId,
        fullName: `${firstName} ${lastName}`.trim(),
      },
    });
    if (createErr || !created?.user?.id) {
      this.logger.error(
        `Supabase createUser failed for staff invite ${normalisedEmail}: ${createErr?.message ?? 'no user returned'}`,
      );
      throw new InternalServerErrorException({
        code: 'SUPABASE_CREATE_USER_FAILED',
        message: createErr?.message ?? 'Supabase did not return a user',
      });
    }
    const supabaseUserId = created.user.id;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: supabaseUserId,
            email: normalisedEmail,
            firstName,
            lastName,
            role: dto.role,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            entityType: 'users',
            entityId: supabaseUserId,
            action: 'admin.user_created',
            metadata: {
              previousState: null,
              newState: {
                email: normalisedEmail,
                firstName,
                lastName,
                role: dto.role,
              },
            } as Prisma.JsonObject,
          },
        });
      });
    } catch (err) {
      // Compensate — orphan auth user blocks email re-use forever.
      try {
        await this.supabase.getClient().auth.admin.deleteUser(supabaseUserId);
      } catch (delErr) {
        this.logger.error(
          `COMPENSATION FAILED: could not delete orphaned Supabase user ${supabaseUserId} after staff-create tx failure: ${(delErr as Error).message} — manual cleanup required.`,
        );
      }
      throw err;
    }

    // Best-effort magic-link invite.
    let inviteEmailSent = false;
    if (dto.sendInvite !== false) {
      const adminPortalUrl =
        this.config.get<string>('ADMIN_URL') ?? 'https://admin.feastpot.co.uk';
      try {
        const { data: linkData, error: linkErr } = await this.supabase
          .getClient()
          .auth.admin.generateLink({
            type: 'magiclink',
            email: normalisedEmail,
            options: { redirectTo: `${adminPortalUrl}/sign-in` },
          });
        const magicLinkUrl = linkData?.properties?.action_link;
        if (linkErr || !magicLinkUrl) {
          this.logger.error(
            `Magic link generation failed for staff invite ${supabaseUserId}: ${linkErr?.message ?? 'no action_link'} — user was provisioned but did NOT receive an invite email.`,
          );
        } else {
          const tmpl = staffPortalInviteTemplate({
            firstName,
            roleLabel: STAFF_ROLE_LABELS[dto.role],
            magicLinkUrl,
            expiresInDays: 7,
          });
          await this.email.send({
            to: normalisedEmail,
            subject: tmpl.subject,
            html: tmpl.html,
          });
          inviteEmailSent = true;
        }
      } catch (err) {
        this.logger.error(
          `Staff invite email pipeline threw for ${supabaseUserId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      id: supabaseUserId,
      email: normalisedEmail,
      role: dto.role,
      inviteEmailSent,
    };
  }

  /**
   * Change a user's role. Admin-only at the controller layer.
   *
   * Guard-rails:
   *   - You cannot change your own role (prevents accidental self-demotion).
   *   - You cannot demote the last remaining active admin (prevents bricking
   *     the admin console entirely).
   *   - Customer/vendor roles can only be REASSIGNED to a staff role here;
   *     promoting a customer to staff is allowed but a vendor cannot be
   *     converted to staff (their Vendor row would dangle) — block that.
   *
   * On success:
   *   - Update Prisma User.role (source of truth read by /users/me).
   *   - Sync the new role into Supabase user_metadata so any downstream
   *     consumers reading the JWT see it too. Best-effort.
   *   - Global Supabase sign-out so any in-flight JWT carrying stale
   *     metadata gets refreshed. Best-effort.
   *   - Audit-log the change.
   */
  async updateUserRole(
    userId: string,
    newRole: StaffRoleValue,
    reason: string,
    actorId: string,
  ): Promise<void> {
    if (userId === actorId) {
      throw new ForbiddenException({
        code: 'CANNOT_CHANGE_OWN_ROLE',
        message: 'You cannot change your own role.',
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, email: true, vendor: { select: { id: true } } },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (user.role === newRole) {
      throw new BadRequestException({
        code: 'ROLE_UNCHANGED',
        message: 'User already has that role.',
      });
    }
    if (user.role === UserRole.vendor || user.vendor) {
      throw new ForbiddenException({
        code: 'CANNOT_CONVERT_VENDOR',
        message:
          'This user is a vendor — converting them to staff would orphan their Vendor record. Suspend the vendor and create a separate staff account instead.',
      });
    }

    // Atomic last-admin guard + role update under Serializable isolation
    // so two concurrent demotions can't both see count > 1 and commit,
    // leaving zero active admins. If they race, Postgres will fail one
    // tx with a serialization error which Prisma surfaces as P2034.
    const isDemotingAdmin = user.role === UserRole.admin && newRole !== UserRole.admin;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          if (isDemotingAdmin) {
            // Re-fetch inside the tx to make the read part of the snapshot.
            const activeAdminCount = await tx.user.count({
              where: { role: UserRole.admin, status: UserStatus.active },
            });
            if (activeAdminCount <= 1) {
              throw new ForbiddenException({
                code: 'LAST_ADMIN',
                message:
                  'Cannot demote the last active admin — promote another user to admin first.',
              });
            }
          }
          await tx.user.update({ where: { id: userId }, data: { role: newRole } });
          await tx.auditLog.create({
            data: {
              actorId,
              entityType: 'users',
              entityId: userId,
              action: 'admin.user_role_changed',
              metadata: {
                reason,
                previousState: { role: user.role },
                newState: { role: newRole },
              } as Prisma.JsonObject,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      // P2034 = "Transaction failed due to a write conflict or a deadlock"
      // — the canonical Serializable retry signal. Surface as 409 so the
      // admin retries rather than seeing a generic 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2034'
      ) {
        throw new ConflictException({
          code: 'CONCURRENT_ROLE_CHANGE',
          message: 'Another role change was committed at the same time — please retry.',
        });
      }
      throw err;
    }

    // Propagate the role into Supabase `app_metadata` so freshly-issued
    // JWTs carry the new role. (Existing in-flight access tokens still
    // expire on their own — Supabase access tokens are not revocable
    // individually; global signOut below kills refresh tokens.)
    try {
      await this.supabase.getClient().auth.admin.updateUserById(userId, {
        app_metadata: { role: newRole },
      });
    } catch (err) {
      this.logger.warn(
        `Supabase updateUserById(app_metadata) failed for ${userId} during role change: ${(err as Error).message}`,
      );
    }
    try {
      await this.supabase.getClient().auth.admin.signOut(userId, 'global');
    } catch (err) {
      this.logger.warn(
        `Supabase global signOut failed for ${userId} during role change: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Paginated, filterable list of users for the admin Users table view.
   * Returns lightweight rows (no per-user N+1) — orders count + lifetime
   * spend are computed in two batched aggregates for the page slice.
   *
   * Cursor uses `(createdAt, id)` so ties are stable (createdAt has ms
   * precision but multiple seed rows can land on the same tick).
   */
  async listUsers(dto: ListAdminUsersDto) {
    const limit = dto.limit ?? 25;
    const cursor = dto.cursor ? this.decodeUserCursor(dto.cursor) : null;

    const where: Prisma.UserWhereInput = {};
    if (dto.role) where.role = dto.role;
    if (dto.status) where.status = dto.status;
    if (dto.joined) where.createdAt = { gte: this.joinedRangeStart(dto.joined) };
    if (dto.q) {
      const q = dto.q.trim();
      if (q.length > 0) {
        where.OR = [
          { email: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    const cursorWhere: Prisma.UserWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { AND: [where, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1, // fetch one extra to know if there's a next page
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          avatarUrl: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // One aggregate query for lifetime spend across the page slice rather
    // than N round-trips; result is grouped by customerId.
    const userIds = page.map((u) => u.id);
    const spendByUser = new Map<string, number>();
    if (userIds.length > 0) {
      const spendRows = await this.prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: userIds }, status: OrderStatus.delivered },
        _sum: { totalPence: true },
      });
      for (const r of spendRows) {
        spendByUser.set(r.customerId, r._sum.totalPence ?? 0);
      }
    }

    const data = page.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      status: u.status,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt,
      orderCount: u._count.orders,
      lifetimeSpendPence: spendByUser.get(u.id) ?? 0,
    }));

    const last = page[page.length - 1];
    return {
      data,
      total,
      nextCursor: hasMore && last ? this.encodeUserCursor(last.createdAt, last.id) : null,
    };
  }

  private joinedRangeStart(range: JoinedRange): Date {
    const now = new Date();
    const start = new Date(now);
    switch (range) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        return start;
      case 'week':
        start.setDate(start.getDate() - 7);
        return start;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        return start;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        return start;
    }
  }

  private encodeUserCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
  }

  private decodeUserCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (!iso || !id) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return { createdAt: d, id };
    } catch {
      return null;
    }
  }

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
