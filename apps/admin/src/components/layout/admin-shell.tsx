'use client';

import { Button } from '@feastpot/ui';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bell,
  CalendarHeart,
  ChevronUp,
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
  UtensilsCrossed,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { API_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

type StaffRole = 'admin' | 'support' | 'finance' | 'compliance';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles that should see this item. Empty array = visible to all staff roles. */
  roles?: ReadonlyArray<StaffRole>;
  /** When true, render as an <a target="_blank"> instead of a <Link>. */
  external?: boolean;
  /** Optional tooltip / description, currently surfaced via the title attribute. */
  description?: string;
}

const MAIN_NAV: ReadonlyArray<NavItem> = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: Receipt, roles: ['admin', 'support', 'finance'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['admin', 'support', 'finance', 'compliance'] },
  { href: '/vendors', label: 'Vendors', icon: Store, roles: ['admin', 'compliance', 'support'] },
  {
    href: '/vendor-applications',
    label: 'Applications',
    icon: ClipboardList,
    roles: ['admin', 'compliance', 'support'],
  },
  { href: '/disputes', label: 'Disputes', icon: AlertTriangle, roles: ['admin', 'support'] },
  { href: '/events', label: 'Events', icon: CalendarHeart, roles: ['admin', 'support'] },
  { href: '/menus/queue', label: 'Menu moderation', icon: UtensilsCrossed, roles: ['admin'] },
  { href: '/reviews/queue', label: 'Reviews', icon: MessageSquare, roles: ['admin'] },
  { href: '/payouts', label: 'Payouts', icon: Banknote, roles: ['admin', 'finance'] },
  { href: '/discount-codes', label: 'Discount Codes', icon: Tag, roles: ['admin', 'finance'] },
  { href: '/push/compose', label: 'Push broadcast', icon: Bell, roles: ['admin'] },
  { href: '/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['admin', 'compliance'] },
  { href: '/audit-log', label: 'Audit log', icon: Activity, roles: ['admin', 'compliance'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

const OPS_NAV: ReadonlyArray<NavItem> = [
  {
    href: `${API_URL}/admin/queues`,
    label: 'Job queues',
    icon: Layers,
    external: true,
    description: 'Bull Board - inspect failed jobs and DLQ',
    roles: ['admin'],
  },
];

interface AdminShellProps {
  user: {
    name: string;
    email: string;
    role: StaffRole;
  };
  children: ReactNode;
}

function initialsFor(name: string, email: string): string {
  const source = (name || email).trim();
  if (!source) return 'SA';
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? source;
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || 'SA';
}

/**
 * Desktop-first shell for the FeastPot admin console.
 *
 * Redesign notes (vs previous version):
 *   - Real FeastPot logo + "Admin console" subtitle in the top-left.
 *   - Nav split into MAIN / OPERATIONS sections matching the mockups.
 *   - Active item uses the deep-teal --primary token (white text on
 *     hsl(161 76% 18%)) instead of the old vendor-blue tint.
 *   - User pill at the bottom shows initials avatar + name + role, with
 *     a chevron affordance and a divided Sign out row.
 *
 * Functionality preserved verbatim: role-filtered nav, external Bull
 * Board link with rel="noopener noreferrer", sign-out via Supabase
 * client + router.refresh().
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

  const visibleMain = MAIN_NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const visibleOps = OPS_NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const initials = initialsFor(user.name, user.email);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside
        aria-label="Admin console navigation"
        className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <Link href="/" className="flex items-center gap-3" aria-label="FeastPot admin console">
            <Image
              src="/feastpot-logo.png"
              alt="FeastPot"
              width={140}
              height={40}
              priority
              className="h-9 w-auto object-contain"
            />
            <span className="sr-only">Admin console</span>
          </Link>
        </div>
        <div className="px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Admin console
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
            Main
          </div>
          <ul className="space-y-0.5">
            {visibleMain.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                      (active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {visibleOps.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                Operations
              </div>
              <ul className="space-y-0.5">
                {visibleOps.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={item.description}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        {/* User pill */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal text-sm font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {user.name || user.email}
              </div>
              <div className="truncate text-xs capitalize text-muted-foreground">
                {user.role}
              </div>
            </div>
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="mt-1 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
