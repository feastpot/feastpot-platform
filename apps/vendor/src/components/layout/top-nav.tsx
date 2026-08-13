'use client';

import { Button, cn } from '@feastpot/ui';
import { Bell, LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useInboxUnreadCount } from '@/hooks/use-inbox';
import { canVendorRoleAccess, useMyVendorRole } from '@/hooks/use-vendor-members';
import { createClient } from '@/lib/supabase/client';

/**
 * Mobile-only top bar rendered inside the md:hidden wrapper in VendorPortalLayout.
 * On desktop (>=768px) the SideNav takes over entirely.
 *
 * Two-row structure prevents the business name from colliding with nav labels:
 *   Row 1  h-14  logo | business name (truncated) | bell | sign-out
 *   Row 2  auto  horizontally-scrollable nav strip (whitespace-nowrap items)
 *
 * The scrollable strip lets all nav items fit without wrapping at any width,
 * matching the SideNav item set exactly so mobile and desktop are consistent.
 */

// Keep in sync with NAV_SECTIONS in side-nav.tsx (same routes, shorter labels
// to fit the horizontally-scrolling mobile strip).
const NAV_ITEMS = [
  { href: '/',                    label: 'Dashboard' },
  { href: '/orders',              label: 'Orders' },
  { href: '/disputes',            label: 'Disputes' },
  { href: '/catering',            label: 'Catering' },
  { href: '/menu',                label: 'Menu' },
  { href: '/availability',        label: 'Availability' },
  { href: '/settings/delivery',   label: 'Delivery' },
  { href: '/settings/profile',    label: 'Profile' },
  { href: '/share',               label: 'Share' },
  { href: '/referrals',           label: 'Referrals' },
  { href: '/analytics',           label: 'Analytics' },
  { href: '/earnings',            label: 'Earnings' },
  { href: '/payouts',             label: 'Payouts' },
  { href: '/tax-information',     label: 'Tax' },
  { href: '/compliance',          label: 'Compliance' },
  { href: '/account-status',      label: 'Account' },
  { href: '/settings/team',       label: 'Team' },
  { href: '/settings/security',   label: 'Security' },
  { href: '/terms',               label: 'Terms' },
  { href: '/user-guide',          label: 'Guide' },
  { href: '/help',                label: 'Help' },
] as const;

function InboxBadge() {
  const { data } = useInboxUnreadCount();
  const pathname = usePathname();
  const active = pathname === '/notifications';
  const count = data?.count ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        active ? 'bg-teal-light text-teal-dark' : 'text-mid hover:bg-surface hover:text-dark',
      )}
    >
      <Bell className="h-4 w-4" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export function TopNav({ businessName }: { businessName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: roleData } = useMyVendorRole();
  const role = roleData?.role ?? null;
  const visibleNavItems = role
    ? NAV_ITEMS.filter((i) => canVendorRoleAccess(role, i.href))
    : NAV_ITEMS;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  // Display name: show provided name, fall back to "Vendor" so there is never
  // a blank gap where the name should appear.
  const displayName = businessName?.trim() || 'Vendor';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      {/* Row 1: logo + business name + actions */}
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Logo: h-8 (32 px) keeps element width to ~112 px at 3.5:1 ratio,
              safely within any mobile viewport. Previously h-28 gave ~420 px. */}
          <Link
            href="/"
            className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Feastpot vendor portal"
          >
            <Image
              src="/feastpot-logo.png"
              alt="Feastpot"
              width={480}
              height={128}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>

          {/* Business name: truncated so a 40-char name never pushes action
              buttons off screen. max-w-[10rem] gives up to ~20 chars before
              truncation on 375 px; sm:max-w-[14rem] gives more room at 640 px. */}
          <span
            className="max-w-[10rem] truncate text-sm font-medium text-mid sm:max-w-[14rem]"
            title={displayName}
          >
            {displayName}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <InboxBadge />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="gap-1.5 focus-visible:ring-2 focus-visible:ring-brand"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>

      {/* Row 2: nav strip - scrolls horizontally, never wraps.
          scrollbar-width: none hides the scrollbar on Firefox;
          [&::-webkit-scrollbar]:hidden covers Chrome/Safari. */}
      <div
        className="overflow-x-auto border-t border-border/40 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <nav
          className="flex items-center gap-0.5 px-2 pb-1.5 pt-1"
          aria-label="Main navigation"
        >
          {visibleNavItems.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  active
                    ? 'bg-teal-light text-teal-dark'
                    : 'text-mid hover:bg-surface hover:text-dark',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
