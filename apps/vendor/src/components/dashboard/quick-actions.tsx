'use client';

import { cn } from '@feastpot/ui';
import {
  BarChart3,
  Calendar,
  ChevronRight,
  ClipboardList,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

/**
 * Four quick-action shortcuts shown at the bottom of the dashboard
 * home. Each tile is icon + label + sub-text + chevron, mirroring the
 * mockup. Order matches the priority a vendor needs at a glance:
 * create (menu) → respond (orders) → plan (availability) → learn
 * (analytics).
 *
 * NOTE on "Add menu item" target: see DashboardTopBar — same routing
 * caveat. There's no `/menu/new` route; we route to `/menu` and let
 * the menu list surface the "+ New item" CTA. Update to
 * `/menu/{primaryMenuId}/items/new` once `/vendors/me` exposes a
 * primary menu id.
 */
export function QuickActions() {
  return (
    <div className="fp-card border border-border bg-white p-4">
      <h2 className="text-base font-bold text-dark">Quick actions</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <ActionTile
          href="/menu"
          Icon={Plus}
          tint="teal"
          label="Add menu item"
          hint="Create or add a new dish"
        />
        <ActionTile
          href="/orders"
          Icon={ClipboardList}
          tint="brand"
          label="View orders"
          hint="Manage incoming orders"
        />
        <ActionTile
          href="/availability"
          Icon={Calendar}
          tint="teal"
          label="Availability"
          hint="Manage your schedule"
        />
        <ActionTile
          href="/analytics"
          Icon={BarChart3}
          tint="vendor"
          label="Analytics"
          hint="View performance insights"
        />
      </div>
    </div>
  );
}

function ActionTile({
  href,
  Icon,
  tint,
  label,
  hint,
}: {
  href: string;
  Icon: LucideIcon;
  tint: 'teal' | 'brand' | 'vendor';
  label: string;
  hint: string;
}) {
  const tintBg: Record<typeof tint, string> = {
    teal: 'bg-teal-light text-teal',
    brand: 'bg-brand-light text-brand',
    vendor: 'bg-teal-light text-teal',
  };

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-white p-3 transition-colors hover:border-teal/40 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
    >
      <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', tintBg[tint])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-dark">{label}</p>
        <p className="truncate text-[11px] text-mid">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-mid transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
