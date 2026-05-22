'use client';

import { cn } from '@feastpot/ui';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileCheck2,
  Headphones,
  LayoutDashboard,
  LogOut,
  PoundSterling,
  ShieldCheck,
  UserCircle2,
  UsersRound,
  UtensilsCrossed,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { canVendorRoleAccess, useMyVendorRole } from '@/hooks/use-vendor-members';
import { createClient } from '@/lib/supabase/client';

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', Icon: ClipboardList },
  { href: '/menu', label: 'Menu', Icon: UtensilsCrossed },
  { href: '/availability', label: 'Availability', Icon: Calendar },
  { href: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/payouts', label: 'Payouts', Icon: PoundSterling },
  { href: '/compliance', label: 'Compliance', Icon: FileCheck2 },
  { href: '/settings/profile', label: 'Profile', Icon: UserCircle2 },
  { href: '/settings/team', label: 'Team', Icon: UsersRound },
  { href: '/settings/security', label: 'Security', Icon: ShieldCheck },
];

interface SideNavProps {
  businessName?: string;
}

/**
 * Vertical left-rail navigation for the vendor portal. Replaces the
 * earlier horizontal `TopNav`. Renders as a normal flex item (NOT
 * fixed) so the host page can lay it out next to <main> in a flex row
 * without manual padding offsets — see apps/vendor/src/app/page.tsx
 * for the host-side flex wrapper.
 *
 * Role gating mirrors the old top-nav: while role data is loading we
 * show everything so the bar doesn't flash empty for owners on first
 * paint, then we filter on first response.
 */
export function SideNav({ businessName }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: roleData } = useMyVendorRole();
  const role = roleData?.role ?? null;
  const visibleNavItems = role
    ? NAV_ITEMS.filter((i) => canVendorRoleAccess(role, i.href))
    : NAV_ITEMS;

  const initials = makeInitials(businessName ?? 'Vendor');

  return (
    <aside
      aria-label="Vendor portal navigation"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex"
    >
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link href="/" className="flex items-center" aria-label="FeastPot vendor portal">
          <Image
            src="/feastpot-logo.png"
            alt="FeastPot"
            width={140}
            height={40}
            priority
            className="h-9 w-auto object-contain"
          />
        </Link>
      </div>

      <div className="px-3 py-3">
        <VendorPill initials={initials} businessName={businessName ?? 'Vendor'} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {visibleNavItems.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.Icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-teal-light text-teal-dark'
                      : 'text-mid hover:bg-surface hover:text-dark',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0',
                      active ? 'text-teal' : 'text-mid group-hover:text-dark',
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border bg-surface/60 px-3 py-3">
        <SupportCard />
      </div>

      <div className="border-t border-border bg-white px-3 py-3">
        <OwnerProfilePill onSignOut={() => void signOut(router)} />
      </div>
    </aside>
  );
}

function VendorPill({ initials, businessName }: { initials: string; businessName: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-white px-3 py-2.5">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-light text-sm font-bold text-teal-dark"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-dark">{businessName}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-mid">Vendor</p>
      </div>
      <ChevronDown className="h-4 w-4 text-mid" aria-hidden />
    </div>
  );
}

function SupportCard() {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-light text-teal"
        >
          <Headphones className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-dark">Need help?</p>
          <p className="text-[11px] text-mid">We&apos;re here for you</p>
        </div>
      </div>
      <Link
        href="/help"
        className="mt-2.5 flex items-center justify-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-dark"
      >
        Contact support
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function OwnerProfilePill({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const { data: roleData } = useMyVendorRole();
  const role = roleData?.role ?? null;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = email ? email.split('@')[0]!.replace(/[._-]/g, ' ') : 'Signed in';
  const initials = makeInitials(displayName);
  const roleLabel = role ? formatRole(role) : 'Member';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal text-xs font-bold text-white"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold capitalize text-dark">{displayName}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-mid">{roleLabel}</p>
        </div>
        <ChevronUp className={cn('h-4 w-4 text-mid transition-transform', !open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-dark transition-colors hover:bg-surface focus:bg-surface focus:outline-none"
          >
            <LogOut className="h-4 w-4 text-mid" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

async function signOut(router: ReturnType<typeof useRouter>) {
  const supabase = createClient();
  await supabase.auth.signOut();
  router.push('/sign-in');
  router.refresh();
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatRole(role: string): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'kitchen_manager':
      return 'Kitchen Manager';
    case 'finance':
      return 'Finance';
    case 'staff':
      return 'Staff';
    case 'delivery_coordinator':
      return 'Delivery';
    default:
      return role;
  }
}

