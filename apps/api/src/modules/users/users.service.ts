import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { UserStatus } from '@prisma/client';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferralService } from '../loyalty/referral.service';

import type { SyncUserDto, UpdateUserDto, UpdateUserStatusDto } from './dto/update-user.dto';

const PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

type UserProfileRow = Pick<User, keyof typeof PROFILE_SELECT>;

export interface UserProfile extends UserProfileRow {
  fullName: string | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly referrals: ReferralService,
  ) {}

  /**
   * Mirror a freshly-signed-up Supabase user into public.users (idempotent
   * upsert keyed on the Supabase user id) and process their referral code
   * if the signup carried one. Safe to re-call: every call is a no-op
   * when nothing has actually changed, and the referral handler itself
   * is one-per-user.
   */
  async sync(userId: string, dto: SyncUserDto) {
    // Pull the Supabase user so we have the canonical email - the public.users
    // row is keyed on the same UUID as Supabase auth.users.id. We also
    // read user_metadata for fields the email-confirmation callback flow
    // doesn't get a chance to repost (the auth/callback route calls this
    // endpoint with an empty body once the session is established).
    const { data: authUser, error } = await this.supabase
      .getClient()
      .auth.admin.getUserById(userId);
    if (error || !authUser?.user?.email) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Supabase user not found' });
    }
    const email = authUser.user.email;
    const meta = (authUser.user.user_metadata ?? {}) as Record<string, unknown>;
    const pick = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : undefined);
    const firstName = dto.firstName ?? pick('firstName') ?? null;
    const lastName = dto.lastName ?? pick('lastName') ?? null;
    const phone = dto.phone ?? pick('phone') ?? null;
    const referralCode = dto.referralCode ?? pick('referralCode');

    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email, firstName, lastName, phone },
      update: {
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        phone: phone ?? undefined,
      },
    });

    // T010: claim any pending vendor-team invitations that were sent to
    // this email before the User row existed. Idempotent: only flips
    // rows still in `pending` with a null userId.
    try {
      const claimed = await this.prisma.vendorMember.updateMany({
        where: {
          invitedEmail: email.toLowerCase(),
          userId: null,
          status: 'pending',
        },
        data: {
          userId,
          status: 'active',
          acceptedAt: new Date(),
        },
      });
      if (claimed.count > 0) {
        this.logger.log(`Claimed ${claimed.count} pending vendor invite(s) for ${email}`);
      }
    } catch (e) {
      this.logger.warn(`Vendor invite claim failed for ${userId}: ${(e as Error).message}`);
    }

    if (referralCode) {
      try {
        await this.referrals.processReferral(userId, referralCode);
      } catch (e) {
        this.logger.warn(`processReferral failed for ${userId}: ${(e as Error).message}`);
      }
    }
    return { synced: true };
  }

  /**
   * Returns the canonical profile for the calling user. Read from Postgres
   * (not the Supabase JWT) so newly-promoted staff don't have to re-issue a
   * token to see the new role here.
   */
  async getMe(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return this.toProfile(user);
  }

  /**
   * Partial update of the calling user's own profile.
   *
   * - `fullName` is split on the first whitespace into firstName/lastName so
   *   the existing schema columns stay populated; we still surface a
   *   computed `fullName` back to the client.
   * - `phone` is mirrored to Supabase Auth so SMS-based flows (OTP, password
   *   reset by phone) keep working. If Supabase rejects the phone we surface
   *   the failure as a 400 rather than silently keeping the public.users
   *   table in disagreement with auth.users.
   */
  async updateMe(userId: string, dto: UpdateUserDto): Promise<UserProfile> {
    const data: Prisma.UserUpdateInput = {};

    if (dto.fullName !== undefined) {
      const [firstName, ...rest] = dto.fullName.trim().split(/\s+/);
      data.firstName = firstName ?? null;
      data.lastName = rest.length > 0 ? rest.join(' ') : null;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl;
    }

    if (dto.phone !== undefined) {
      const { error } = await this.supabase
        .getClient()
        .auth.admin.updateUserById(userId, { phone: dto.phone });
      if (error) {
        this.logger.warn(`Supabase phone update failed for ${userId}: ${error.message}`);
        throw new ForbiddenException({
          code: 'PHONE_UPDATE_REJECTED',
          message: error.message,
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
    return this.toProfile(updated);
  }

  /**
   * Admin-only status change. We block self-edits to stop an admin from
   * accidentally locking themselves out, and write an audit_logs row with
   * before/after state for the compliance trail.
   */
  async updateStatus(userId: string, dto: UpdateUserStatusDto, actorId: string) {
    if (userId === actorId) {
      throw new ForbiddenException({
        code: 'CANNOT_CHANGE_OWN_STATUS',
        message: 'Admins cannot change their own status',
      });
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status },
        select: PROFILE_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'user.status_changed',
          entityType: 'users',
          entityId: userId,
          metadata: {
            previousState: { status: existing.status },
            newState: { status: dto.status, reason: dto.reason ?? null },
          } as Prisma.JsonObject,
        },
      });
      return u;
    });

    // After the DB transaction commits, revoke Supabase tokens for the
    // affected user so a hard delete actually severs their session. We do
    // this last so a transient Supabase outage can't roll back a write
    // that's already audited.
    if (dto.status === UserStatus.deleted) {
      const { error } = await this.supabase.getClient().auth.admin.deleteUser(userId);
      if (error) {
        this.logger.warn(`Supabase deleteUser failed for ${userId}: ${error.message}`);
      }
    }

    return this.toProfile(updated);
  }

  /**
   * Self-service account deletion. Soft-deletes the public.users row
   * (status=deleted) and revokes the Supabase auth user so all sessions
   * end. The orders/audit history is preserved by the DB schema (FKs
   * use SetNull / Cascade per relationship), so we don't have to touch
   * dependent rows here.
   */
  async deleteMe(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.deleted },
      select: { id: true },
    });

    const { error } = await this.supabase.getClient().auth.admin.deleteUser(userId);
    if (error) {
      this.logger.warn(`Supabase deleteUser failed for ${userId}: ${error.message}`);
    }
  }

  private toProfile(row: UserProfileRow): UserProfile {
    const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null;
    return { ...row, fullName };
  }
}
