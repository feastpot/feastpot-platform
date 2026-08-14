'use client';

import { cn } from '@feastpot/ui';
import {
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileCheck2,
  FileText,
  Headphones,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  PoundSterling,
  QrCode,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Truck,
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

type NavSection = {
  label: string;
  items: ReadonlyArray<NavItem>;
};

/**
 * Grouped sidebar navigation.
 * Sections mirror the brief: Selling / Your kitchen / Growth / Money / Account.
 * Items within each section are ordered for scanning speed (most-used first).
 */
const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    label: 'Selling',
    items: [
      { href: '/',         label: 'Dashboard',         Icon: LayoutDashboard },
      { href: '/orders',   label: 'Orders',             Icon: ClipboardList },
      { href: '/disputes', label: 'Disputes',           Icon: MessageSquareWarning },
    ],
  },
  {
    label: 'Your kitchen',
    items: [
      { href: '/menu',               label: 'Menu',         Icon: UtensilsCrossed },
      { href: '/availability',       label: 'Availability', Icon: Calendar },
      { href: '/settings/delivery',  label: 'Delivery',     Icon: Truck },
      { href: '/settings/profile',   label: 'Profile',      Icon: UserCircle2 },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/share',     label: 'Share and customers',  Icon: QrCode },
      { href: '/analytics', label: 'Analytics',           Icon: BarChart3 },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/earnings',         label: 'Earnings & fees',  Icon: TrendingUp },
      { href: '/payouts',          label: 'Payouts',          Icon: PoundSterling },
      { href: '/tax-information',  label: 'Tax information',  Icon: Receipt },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/compliance',        label: 'Compliance',       Icon: FileCheck2 },
      { href: '/account-status',    label: 'Account status',   Icon: ShieldAlert },
      { href: '/settings/team',     label: 'Team',             Icon: UsersRound },
      { href: '/settings/security', label: 'Security',         Icon: ShieldCheck },
      { href: '/terms',             label: 'Terms & notices',  Icon: FileText },
      { href: '/user-guide',        label: 'User guide',       Icon: BookOpen },
    ],
  },
];

// Flat list used by canVendorRoleAccess (same shape as before).
const ALL_NAV_ITEMS: ReadonlyArray<NavItem> = NAV_SECTIONS.flatMap((s) => s.items);

interface SideNavProps {
  businessName?: string;
}

/**
 * Vertical left-rail navigation for the vendor portal.
 * Renders as a normal flex item (NOT fixed) so the host page can lay it out
 * next to <main> in a flex row without manual padding offsets.
 *
 * Grouped into five labelled sections so the 19-item list is scannable.
 * Role gating is applied per-item inside each section; sections with no
 * visible items are hidden entirely.
 */
export function SideNav({ businessName }: SideNavProps) {
  const pathname = usePathname();
  const { data: roleData } = useMyVendorRole();
  const role = roleData?.role ?? null;
  const router = useRouter();

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: role
      ? section.items.filter((i) => canVendorRoleAccess(role, i.href))
      : section.items,
  })).filter((section) => section.items.length > 0);

  const initials = makeInitials(businessName ?? 'Vendor');

  return (
    <aside
      aria-label="Vendor portal navigation"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex"
    >
      {/* Logo – h-10 keeps element within the 240 px rail at the 3.5:1 aspect
          ratio. The previous h-[144px] overflowed into the main content column. */}
      <div className="flex items-center border-b border-border px-4 py-4">
        <Link href="/" className="flex items-center" aria-label="Feastpot vendor portal">
          <Image
            src="/feastpot-logo.png"
            alt="Feastpot"
            width={560}
            height={160}
            priority
            className="h-10 w-auto max-w-full object-contain object-left"
          />
        </Link>
      </div>

      <div className="px-3 py-3">
        <VendorPill initials={initials} businessName={businessName ?? 'Vendor'} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        <div className="space-y-5">
          {visibleSections.map((section) => (
            <div key={section.label}>
              {/* Section header – small-caps label, muted */}
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-mid/60">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
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
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
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
                        {/* No truncate: all labels fit within the 240 px rail at 14 px */}
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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
        {/* truncate so a 40-char business name stays within the 240 px rail */}
        <p className="truncate text-sm font-semibold text-dark">{businessName}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-mid">Vendor</p>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 text-mid" aria-hidden />
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
        <ChevronUp
          className={cn('h-4 w-4 shrink-0 text-mid transition-transform', !open && 'rotate-180')}
          aria-hidden
        />
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
    case 'owner':              return 'Owner';
    case 'kitchen_manager':    return 'Kitchen Manager';
    case 'finance':            return 'Finance';
    case 'staff':              return 'Staff';
    case 'delivery_coordinator': return 'Delivery';
    default:                   return role;
  }
}

// Re-export the flat list so anything that consumed the old NAV_ITEMS shape
// can still import it (e.g. tests, role-gate checks).
export { ALL_NAV_ITEMS as NAV_ITEMS };
