'use client';

import { Button } from '@feastpot/ui';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bell,
  CalendarHeart,
  ClipboardList,
  ExternalLink,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { API_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles that should see this item. Empty array = visible to all staff roles. */
  roles?: ReadonlyArray<'admin' | 'support' | 'finance' | 'compliance'>;
  /** When true, render as an <a target="_blank"> instead of a <Link>. */
  external?: boolean;
  /** Optional tooltip / description, currently surfaced via the title attribute. */
  description?: string;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: Receipt, roles: ['admin', 'support', 'finance'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['admin', 'support', 'finance', 'compliance'] },
  { href: '/vendors', label: 'Vendors', icon: Store, roles: ['admin', 'compliance', 'support'] },
  { href: '/disputes', label: 'Disputes', icon: AlertTriangle, roles: ['admin', 'support'] },
  { href: '/events', label: 'Events', icon: CalendarHeart, roles: ['admin', 'support'] },
  { href: '/reviews/queue', label: 'Reviews', icon: MessageSquare, roles: ['admin'] },
  { href: '/payouts', label: 'Payouts', icon: Banknote, roles: ['admin', 'finance'] },
  { href: '/discount-codes', label: 'Discount Codes', icon: Tag, roles: ['admin', 'finance'] },
  { href: '/push/compose', label: 'Push broadcast', icon: Bell, roles: ['admin'] },
  { href: '/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['admin', 'compliance'] },
  { href: '/audit-log', label: 'Audit log', icon: Activity, roles: ['admin', 'compliance'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

// Operations links live in their own grouped block at the bottom of the
// sidebar — they point at out-of-app tools (Bull Board) rather than admin
// pages, so they render as external <a target="_blank"> with an external-
// link affordance and are gated to admin-only.
const OPS_NAV: ReadonlyArray<NavItem> = [
  {
    // Bull Board is mounted on the API host (Basic-Auth gated by the API),
    // not on the admin Next app — hence absolute URL via API_URL.
    href: `${API_URL}/admin/queues`,
    label: 'Job queues',
    icon: Layers,
    external: true,
    description: 'Bull Board — inspect failed jobs and DLQ',
    roles: ['admin'],
  },
];

interface AdminShellProps {
  user: {
    name: string;
    email: string;
    role: 'admin' | 'support' | 'finance' | 'compliance';
  };
  children: ReactNode;
}

/**
 * Desktop-first shell: fixed sidebar (240 px) + scrollable main pane. Items
 * are filtered by the current user's role so support agents don't see the
 * vendor approval queue, etc.
 */
export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  const visibleNav = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const visibleOpsNav = OPS_NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-vendor text-white text-sm font-bold">
            FP
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">Feastpot</div>
            <div className="text-xs text-muted-foreground">Admin console</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 px-2">
          {visibleNav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'bg-vendor-light text-vendor-dark'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {visibleOpsNav.length > 0 && (
            <div className="pt-3">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Operations
              </div>
              {visibleOpsNav.map((item) => {
                const Icon = item.icon;
                // External links bypass <Link> (Next prefetch + client routing
                // would try to treat the absolute API URL as an internal route)
                // and use rel="noopener noreferrer" to prevent the popup window
                // from gaining a window.opener handle back into the admin app.
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.description}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          )}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name || user.email}</div>
              <div className="truncate text-xs text-muted-foreground capitalize">{user.role}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="mt-1 w-full justify-start gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
