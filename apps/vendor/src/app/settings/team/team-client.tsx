'use client';

import { cn } from '@feastpot/ui';
import {
  BarChart3,
  Calendar,
  ClipboardList,
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  PoundSterling,
  ShieldCheck,
  Trash2,
  UserCircle2,
  UserPlus,
  Users,
  UsersRound,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import {
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
  useVendorMembers,
  type VendorMemberRole,
  type VendorMemberRow,
} from '@/hooks/use-vendor-members';

const ROLE_LABEL: Record<VendorMemberRole, string> = {
  owner: 'Owner',
  kitchen_manager: 'Kitchen Manager',
  finance: 'Finance',
  staff: 'Staff',
  delivery_coordinator: 'Delivery',
};

const INVITABLE_ROLES: VendorMemberRole[] = [
  'kitchen_manager',
  'finance',
  'staff',
  'delivery_coordinator',
];

const ROLE_BLURB: Record<VendorMemberRole, string> = {
  owner: 'Full access to all features and settings.',
  kitchen_manager: 'Manage menu, availability and orders.',
  finance: 'View payouts, earnings and compliance.',
  staff: 'View and update orders.',
  delivery_coordinator: 'Manage orders and availability for dispatch.',
};

/**
 * Tone per role — drives the role pill on each member row. Owner
 * is teal (highest trust), Kitchen Manager vendor-blue, Finance amber
 * (money), Staff and Delivery neutral.
 */
const ROLE_TONE: Record<VendorMemberRole, string> = {
  owner: 'bg-teal-light text-teal-dark',
  kitchen_manager: 'bg-teal-light text-teal-dark',
  finance: 'bg-amber-100 text-amber-800',
  staff: 'bg-surface text-mid border border-border',
  delivery_coordinator: 'bg-surface text-mid border border-border',
};

interface PermSection {
  label: string;
  Icon: typeof LayoutDashboard;
  /** Hex of the leftmost path-test in ROLE_PERMISSIONS this lines up
   *  with. The order here mirrors the side-nav so the per-role pills
   *  read the same way the nav does. */
  path: string;
  tone: string;
}

const ALL_SECTIONS: PermSection[] = [
  { label: 'Dashboard', Icon: LayoutDashboard, path: '/', tone: 'bg-teal-light text-teal-dark' },
  { label: 'Orders', Icon: ClipboardList, path: '/orders', tone: 'bg-teal-light text-teal-dark' },
  { label: 'Menu', Icon: UtensilsCrossed, path: '/menu', tone: 'bg-teal-light text-teal-dark' },
  { label: 'Availability', Icon: Calendar, path: '/availability', tone: 'bg-teal-light text-teal-dark' },
  { label: 'Analytics', Icon: BarChart3, path: '/analytics', tone: 'bg-amber-100 text-amber-800' },
  { label: 'Payouts', Icon: PoundSterling, path: '/payouts', tone: 'bg-amber-100 text-amber-800' },
  { label: 'Compliance', Icon: FileCheck2, path: '/compliance', tone: 'bg-amber-100 text-amber-800' },
  { label: 'Profile', Icon: UserCircle2, path: '/settings/profile', tone: 'bg-surface text-dark border border-border' },
  { label: 'Team', Icon: UsersRound, path: '/settings/team', tone: 'bg-teal-light text-teal-dark' },
  { label: 'Security', Icon: ShieldCheck, path: '/settings/security', tone: 'bg-surface text-dark border border-border' },
];

/**
 * Compact 2-3 permission pills per role, picked to give the vendor
 * a fingerprint of what the role can touch without dumping the full
 * route list. Mirrors ROLE_PERMISSIONS in use-vendor-members.ts but
 * curated for legibility.
 */
const ROLE_PERMS: Record<VendorMemberRole, string[]> = {
  owner: ['/', 'Manage team'],
  kitchen_manager: ['/menu', '/availability', '/orders'],
  finance: ['/payouts', '/compliance', '/analytics'],
  staff: ['/orders'],
  delivery_coordinator: ['/orders', '/availability'],
};

export function TeamClient() {
  const { data, isLoading, error } = useVendorMembers();
  const invite = useInviteMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<VendorMemberRole>('staff');

  const isOwner = data?.callerRole === 'owner';
  const members = data?.members ?? [];

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast({ title: 'Invite sent', description: `${email} can sign in to accept.` });
      setEmail('');
    } catch (err) {
      toast({
        title: 'Could not send invite',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Team</h1>
        <p className="mt-1 text-sm text-mid">
          Invite people to help run the business. Roles control which sections of the vendor portal
          they can use.
        </p>
      </header>

      {error && (
        <div className="fp-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Could not load team.
        </div>
      )}

      {isOwner && (
        <InviteCard
          email={email}
          role={role}
          onEmail={setEmail}
          onRole={setRole}
          onSubmit={onInvite}
          submitting={invite.isPending}
        />
      )}

      <section className="fp-card border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-dark">Team members</h2>
            <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-full bg-surface px-2 text-xs font-bold text-mid">
              {members.length}
            </span>
          </div>
          <Link
            href="/help#roles"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-mid transition-colors hover:text-dark"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            Learn about roles
          </Link>
        </div>

        {isLoading && <p className="px-5 py-6 text-sm text-mid">Loading team…</p>}

        {!isLoading && members.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-mid">
            No team members yet. Invite someone above to get started.
          </p>
        )}

        {!isLoading && members.length > 0 && (
          <>
            {/* Desktop column headers — hidden on small screens where
                the row layout stacks vertically. */}
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_auto_auto] gap-4 border-b border-border bg-surface px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-mid lg:grid">
              <span>Member</span>
              <span>Role</span>
              <span>Access &amp; permissions</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  canEdit={!!isOwner && !m.isOwner}
                  onRoleChange={(newRole) => updateRole.mutate({ id: m.id, role: newRole })}
                  onRemove={() => {
                    if (confirm(`Remove ${m.invitedEmail} from the team?`)) {
                      removeMember.mutate(m.id);
                    }
                  }}
                  removing={removeMember.isPending}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <BuildYourTeamCard
        onInviteFocus={() => {
          const el = document.getElementById('invite-email');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (el as HTMLInputElement).focus();
          }
        }}
        canInvite={!!isOwner}
        empty={members.length === 0}
      />
    </div>
  );
}

// ── Invite card ───────────────────────────────────────────────────

function InviteCard({
  email,
  role,
  onEmail,
  onRole,
  onSubmit,
  submitting,
}: {
  email: string;
  role: VendorMemberRole;
  onEmail: (v: string) => void;
  onRole: (v: VendorMemberRole) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
}) {
  return (
    <section className="fp-card relative overflow-hidden border border-border bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-dark">Invite team member</h2>
          <form
            onSubmit={onSubmit}
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div>
              <label htmlFor="invite-email" className="text-xs font-semibold text-dark">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                placeholder="teamname@example.com"
                value={email}
                onChange={(e) => onEmail(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="text-xs font-semibold text-dark">
                Role
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => onRole(e.target.value as VendorMemberRole)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-2 text-sm text-dark focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-teal px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60 sm:w-auto"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                {submitting ? 'Inviting…' : 'Invite'}
              </button>
            </div>
            <p className="text-xs text-mid sm:col-span-3">{ROLE_BLURB[role]}</p>
          </form>
        </div>
        {/* CSS-only decorative illustration so no new asset is needed. */}
        <div aria-hidden className="hidden self-center md:block">
          <div className="relative h-28 w-32">
            <div className="absolute -left-2 top-2 h-20 w-20 rounded-2xl bg-teal/10" />
            <div className="absolute -right-2 bottom-0 h-14 w-14 rounded-full bg-teal/15" />
            <div className="relative grid h-24 w-24 place-items-center rounded-2xl bg-white shadow-sm">
              <UserPlus className="h-12 w-12 text-teal" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Member row ────────────────────────────────────────────────────

function memberDisplayName(m: VendorMemberRow): string {
  const full = [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ');
  return full || m.user?.email || m.invitedEmail;
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function MemberRow({
  member,
  canEdit,
  onRoleChange,
  onRemove,
  removing,
}: {
  member: VendorMemberRow;
  canEdit: boolean;
  onRoleChange: (r: VendorMemberRole) => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const isPending = member.status === 'pending';
  const isRemoved = member.status === 'removed';
  const name = memberDisplayName(member);
  const initials = memberInitials(name);
  const perms = ROLE_PERMS[member.role] ?? [];

  return (
    <li className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_auto_auto] lg:items-center">
      {/* Member */}
      <div className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-light text-sm font-bold text-teal-dark"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-dark">{name}</p>
          <p className="truncate text-xs text-mid">{member.user?.email ?? member.invitedEmail}</p>
        </div>
      </div>

      {/* Role pill + blurb */}
      <div className="min-w-0">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            ROLE_TONE[member.role],
          )}
        >
          {ROLE_LABEL[member.role]}
        </span>
        <p className="mt-1 text-xs text-mid">{ROLE_BLURB[member.role]}</p>
      </div>

      {/* Access & permissions pills */}
      <div className="flex flex-wrap gap-1.5">
        {perms.map((p) => {
          if (p === 'Manage team') {
            return (
              <PermPill key={p} Icon={Users} label="Manage team" tone="bg-teal-light text-teal-dark" />
            );
          }
          if (p === '/') {
            return (
              <PermPill
                key={p}
                Icon={LayoutDashboard}
                label="All sections"
                tone="bg-teal-light text-teal-dark"
              />
            );
          }
          const section = ALL_SECTIONS.find((s) => s.path === p);
          if (!section) return null;
          return (
            <PermPill key={p} Icon={section.Icon} label={section.label} tone={section.tone} />
          );
        })}
      </div>

      {/* Status badge */}
      <div className="lg:justify-self-end">
        <StatusBadge pending={isPending} removed={isRemoved} />
      </div>

      {/* Actions: role select (owners) + remove */}
      <div className="flex items-center justify-start gap-1.5 lg:justify-end">
        {canEdit && (
          <select
            aria-label={`Role for ${member.invitedEmail}`}
            value={member.role}
            onChange={(e) => onRoleChange(e.target.value as VendorMemberRole)}
            className="h-9 rounded-lg border border-border bg-white px-2 text-xs text-dark focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        )}
        {canEdit && (
          <button
            type="button"
            aria-label={`Remove ${member.invitedEmail}`}
            disabled={removing}
            onClick={onRemove}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white text-mid transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

function PermPill({
  Icon,
  label,
  tone,
}: {
  Icon: typeof LayoutDashboard;
  label: string;
  tone: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
        tone,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

function StatusBadge({ pending, removed }: { pending: boolean; removed: boolean }) {
  if (removed) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-mid">
        Removed
      </span>
    );
  }
  if (pending) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-semibold text-teal-dark">
      Active
    </span>
  );
}

// ── Bottom CTA ────────────────────────────────────────────────────

function BuildYourTeamCard({
  onInviteFocus,
  canInvite,
  empty,
}: {
  onInviteFocus: () => void;
  canInvite: boolean;
  empty: boolean;
}) {
  if (!canInvite) return null;
  return (
    <section className="fp-card relative overflow-hidden border border-teal/30 bg-teal-light p-5">
      <div className="grid items-center gap-4 md:grid-cols-[auto_1fr_auto]">
        {/* Decorative illustration */}
        <div aria-hidden className="hidden md:block">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white shadow-sm">
                <UsersRound className="h-10 w-10 text-teal" />
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-dark">Build your team</h2>
          <p className="mt-1 text-sm text-mid">
            Add team members and assign roles to streamline operations and keep your business
            running smoothly.
          </p>
        </div>
        <button
          type="button"
          onClick={onInviteFocus}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-teal bg-white px-4 text-sm font-semibold text-teal-dark transition-colors hover:bg-teal-light"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {empty ? 'Invite your first team member' : 'Invite another teammate'}
        </button>
      </div>
    </section>
  );
}
