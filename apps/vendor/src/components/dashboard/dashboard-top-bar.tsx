'use client';

import { Bell, HelpCircle, Plus } from 'lucide-react';
import Link from 'next/link';

import { useInboxUnreadCount } from '@/hooks/use-inbox';

/**
 * Action row pinned to the top of the dashboard's main column.
 *
 * Renders the primary "+ Add menu item" CTA, the inbox bell (with
 * unread badge — same hook as the old `TopNav`), and a help shortcut.
 *
 * NOTE on the "Add menu item" target: there is no `/menu/new` route —
 * the vendor app's item editor lives under `/menu/[menuId]/items/[id]`
 * and a new item is minted via `/menu/[menuId]/items/new`. Without a
 * primary-menu id on `/vendors/me` we route to `/menu` so the vendor
 * picks the menu first. Mirror the QuickActions component if/when
 * `/vendors/me` exposes a primary menu id.
 */
export function DashboardTopBar() {
  const { data } = useInboxUnreadCount();
  const count = data?.count ?? 0;

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href="/menu"
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-teal px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add menu item
      </Link>
      <Link
        href="/notifications"
        aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-white text-mid transition-colors hover:bg-surface hover:text-dark"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
      <Link
        href="/help"
        aria-label="Help"
        className="grid h-10 w-10 place-items-center rounded-full border border-border bg-white text-mid transition-colors hover:bg-surface hover:text-dark"
      >
        <HelpCircle className="h-[18px] w-[18px]" aria-hidden />
      </Link>
    </div>
  );
}
