import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VendorMemberRole, VendorMemberStatus } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';

import type { InviteMemberDto, UpdateMemberRoleDto } from './dto/invite-member.dto';

/**
 * T010: per-surface role allow-lists, single source of truth for the
 * server-side RBAC checks. Owner is implicitly in every set (handled
 * by resolveVendorIdByUserId). Keep in sync with the client-side
 * ROLE_PERMISSIONS table in apps/vendor/src/hooks/use-vendor-members.ts.
 */
export const VENDOR_READ_ROLES: VendorMemberRole[] = [
  VendorMemberRole.owner,
  VendorMemberRole.kitchen_manager,
  VendorMemberRole.finance,
  VendorMemberRole.staff,
  VendorMemberRole.delivery_coordinator,
];
export const VENDOR_PROFILE_WRITE_ROLES: VendorMemberRole[] = [VendorMemberRole.owner];
export const VENDOR_AVAILABILITY_ROLES: VendorMemberRole[] = [
  VendorMemberRole.owner,
  VendorMemberRole.kitchen_manager,
  VendorMemberRole.delivery_coordinator,
];
export const VENDOR_MENU_ROLES: VendorMemberRole[] = [
  VendorMemberRole.owner,
  VendorMemberRole.kitchen_manager,
];
export const VENDOR_ORDER_ROLES: VendorMemberRole[] = [
  VendorMemberRole.owner,
  VendorMemberRole.kitchen_manager,
  VendorMemberRole.staff,
  VendorMemberRole.delivery_coordinator,
];
export const VENDOR_COMPLIANCE_ROLES: VendorMemberRole[] = [
  VendorMemberRole.owner,
  VendorMemberRole.kitchen_manager,
  VendorMemberRole.finance,
];
export const VENDOR_PAYOUT_ROLES: VendorMemberRole[] = [
  VendorMemberRole.owner,
  VendorMemberRole.finance,
];

/**
 * T010: vendor team management + RBAC helpers.
 *
 * - `getEffectiveRole` is the single source of truth used by frontend
 *   gates and server-side helpers to decide if a caller can touch a
 *   given vendor surface. It returns `owner` for the original signup
 *   (User.vendor 1:1 relation) and otherwise resolves the active
 *   VendorMember row.
 * - All write methods require `owner` role.
 */
@Injectable()
export class VendorMembersService {
  private readonly logger = new Logger(VendorMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  // ---------------- role resolution ----------------

  async getEffectiveRole(
    user: AuthUser,
  ): Promise<{ vendorId: string; role: VendorMemberRole } | null> {
    const owned = await this.prisma.vendor.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (owned) return { vendorId: owned.id, role: VendorMemberRole.owner };

    const member = await this.prisma.vendorMember.findFirst({
      where: { userId: user.id, status: VendorMemberStatus.active },
      select: { vendorId: true, role: true },
    });
    if (member) return { vendorId: member.vendorId, role: member.role };
    return null;
  }

  /**
   * Resolves the vendor id for a caller and asserts their effective role
   * is in `allowed`. Owner is always allowed implicitly. Throws 403 if
   * the user has no vendor profile/team membership or an excluded role.
   * Used by every vendor-portal endpoint that needs a server-side RBAC
   * check (orders, menu, availability, compliance, profile, payouts).
   */
  async resolveVendorIdByUserId(
    userId: string,
    allowed: VendorMemberRole[],
  ): Promise<{ vendorId: string; role: VendorMemberRole }> {
    const owned = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (owned) return { vendorId: owned.id, role: VendorMemberRole.owner };

    // Deterministic resolution: prefer a membership whose role is in the
    // allow-list (oldest first, ties broken by id). If none qualifies but
    // the user has an active membership with a different role, surface
    // VENDOR_ROLE_FORBIDDEN so the caller knows they're on a team but
    // their role excludes this action. Only when the user has no active
    // membership at all do we throw NOT_VENDOR_MEMBER.
    const eligible = await this.prisma.vendorMember.findFirst({
      where: { userId, status: VendorMemberStatus.active, role: { in: allowed } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { vendorId: true, role: true },
    });
    if (eligible) return { vendorId: eligible.vendorId, role: eligible.role };

    const anyActive = await this.prisma.vendorMember.findFirst({
      where: { userId, status: VendorMemberStatus.active },
      select: { id: true },
    });
    if (anyActive) {
      throw new ForbiddenException({
        code: 'VENDOR_ROLE_FORBIDDEN',
        message: 'Your role on this vendor team does not include this action',
      });
    }
    throw new ForbiddenException({
      code: 'NOT_VENDOR_MEMBER',
      message: 'No vendor profile or active team membership',
    });
  }

  /**
   * Returns true if the user is allowed to act on the given vendor with
   * one of `allowed` roles. Owner of the vendor always passes. Used by
   * services (orders, compliance) that already know the vendor id.
   */
  async canActOnVendor(
    userId: string,
    vendorId: string,
    allowed: VendorMemberRole[],
  ): Promise<boolean> {
    const owned = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    if (owned?.userId === userId) return true;
    const member = await this.prisma.vendorMember.findFirst({
      where: { userId, vendorId, status: VendorMemberStatus.active },
      select: { role: true },
    });
    return !!member && allowed.includes(member.role);
  }

  async requireOwner(user: AuthUser): Promise<string> {
    const r = await this.getEffectiveRole(user);
    if (!r || r.role !== VendorMemberRole.owner) {
      throw new ForbiddenException({
        code: 'OWNER_REQUIRED',
        message: 'Only the vendor owner can manage team members',
      });
    }
    return r.vendorId;
  }

  // ---------------- queries ----------------

  async listForCaller(user: AuthUser) {
    const eff = await this.getEffectiveRole(user);
    if (!eff) {
      throw new ForbiddenException({ code: 'NOT_VENDOR', message: 'Caller is not a vendor member' });
    }
    const members = await this.prisma.vendorMember.findMany({
      where: { vendorId: eff.vendorId, status: { not: VendorMemberStatus.removed } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    // The vendor `owner` user lives on the Vendor row, not in members. We
    // surface it as a synthetic first row so the UI can render the full
    // team in one list.
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: eff.vendorId },
      select: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    const ownerRow = vendor?.user
      ? {
          id: `owner:${vendor.user.id}`,
          vendorId: eff.vendorId,
          userId: vendor.user.id,
          invitedEmail: vendor.user.email,
          role: VendorMemberRole.owner,
          status: VendorMemberStatus.active,
          invitedById: null,
          acceptedAt: null,
          removedAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          user: vendor.user,
          isOwner: true as const,
        }
      : null;
    return {
      callerRole: eff.role,
      vendorId: eff.vendorId,
      members: [ownerRow, ...members.map((m) => ({ ...m, isOwner: false as const }))].filter(
        Boolean,
      ),
    };
  }

  // ---------------- mutations ----------------

  async invite(user: AuthUser, dto: InviteMemberDto) {
    const vendorId = await this.requireOwner(user);
    if (dto.role === VendorMemberRole.owner) {
      throw new BadRequestException({
        code: 'OWNER_NOT_INVITABLE',
        message: 'Cannot invite another owner. Transfer ownership via support.',
      });
    }
    const email = dto.email.trim().toLowerCase();

    // If the invitee already has a User row, link straight away so they
    // see the vendor on their next sign-in without a "claim invite" hop.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    try {
      const created = await this.prisma.vendorMember.create({
        data: {
          vendorId,
          invitedEmail: email,
          role: dto.role,
          invitedById: user.id,
          userId: existingUser?.id ?? null,
          status: existingUser ? VendorMemberStatus.active : VendorMemberStatus.pending,
          acceptedAt: existingUser ? new Date() : null,
        },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
      if (existingUser) {
        await this.inbox.notify({
          userId: existingUser.id,
          type: 'generic',
          title: 'Added to a vendor team',
          body: `You have been added as ${dto.role.replace(/_/g, ' ')} on a FeastPot vendor account.`,
          link: '/',
          metadata: { vendorId, vendorMemberId: created.id },
        });
      }
      return { ...created, isOwner: false as const };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException({
          code: 'ALREADY_INVITED',
          message: 'That email is already a member of this team',
        });
      }
      throw e;
    }
  }

  async updateRole(user: AuthUser, memberId: string, dto: UpdateMemberRoleDto) {
    const vendorId = await this.requireOwner(user);
    if (dto.role === VendorMemberRole.owner) {
      throw new BadRequestException({
        code: 'OWNER_NOT_ASSIGNABLE',
        message: 'Cannot promote a member to owner via this endpoint',
      });
    }
    const row = await this.prisma.vendorMember.findUnique({ where: { id: memberId } });
    if (!row || row.vendorId !== vendorId) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
    }
    return this.prisma.vendorMember.update({
      where: { id: memberId },
      data: { role: dto.role },
    });
  }

  async remove(user: AuthUser, memberId: string) {
    const vendorId = await this.requireOwner(user);
    const row = await this.prisma.vendorMember.findUnique({ where: { id: memberId } });
    if (!row || row.vendorId !== vendorId) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
    }
    return this.prisma.vendorMember.update({
      where: { id: memberId },
      data: { status: VendorMemberStatus.removed, removedAt: new Date() },
    });
  }
}
