'use client';

import { Button } from '@feastpot/ui';
import { Bell, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useInboxUnreadCount } from '@/hooks/use-inbox';
import { canVendorRoleAccess, useMyVendorRole } from '@/hooks/use-vendor-members';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/orders', label: 'Orders' },
  { href: '/menu', label: 'Menu' },
  { href: '/availability', label: 'Availability' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/payouts', label: 'Payouts' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/security', label: 'Security' },
  { href: '/help', label: 'Help' },
];

/**
 * T007: in-app inbox bell. Polls /inbox/unread-count every 60s via the
 * shared hook; renders a small red badge when count > 0.
 */
function InboxBadge() {
  const { data } = useInboxUnreadCount();
  const pathname = usePathname();
  const active = pathname === '/notifications';
  const count = data?.count ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
      className={
        'relative inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors ' +
        (active ? 'bg-vendor-light text-vendor-dark' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
      }
    >
      <Bell className="h-4 w-4" />
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
  // T010: hide nav items the current member's role cannot access. Role
  // loads lazily; until it arrives we show everything so the bar doesn't
  // flash empty for owners on first paint.
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

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-vendor text-white text-xs font-bold">FP</span>
            <span className="hidden sm:inline">Vendor</span>
            {businessName && <span className="hidden text-sm text-muted-foreground sm:inline">· {businessName}</span>}
          </Link>
          <nav className="flex items-center gap-1">
            {visibleNavItems.map((item) => {
              // Dashboard ("/") needs an exact match - otherwise EVERY route
              // would highlight it because every path starts with "/".
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (active ? 'bg-vendor-light text-vendor-dark' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <InboxBadge />
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
