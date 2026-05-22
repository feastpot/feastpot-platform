'use client';

import { cn } from '@feastpot/ui';
import { AlertTriangle, ChevronRight, MessageSquare, Wallet } from 'lucide-react';
import Link from 'next/link';

import type {
  DashboardEventEnquiries,
  DashboardMenuHealth,
  DashboardNextPayout,
} from '@/hooks/use-vendor-dashboard';

function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

interface Props {
  eventEnquiries: DashboardEventEnquiries;
  nextPayout: DashboardNextPayout | null;
  menuHealth: DashboardMenuHealth;
}

/**
 * Right-column summary card used on the dashboard. Vertical 3-row
 * layout (event enquiries / next payout / menu warnings) — replaces
 * the horizontal `OperationsTiles` for this surface only. Each row
 * shows a soft-tinted icon square + label + primary signal, and the
 * whole row is a link to the page where the vendor can act.
 *
 * The horizontal `OperationsTiles` is still used elsewhere; this
 * component is dashboard-specific.
 */
export function AtAGlance({ eventEnquiries, nextPayout, menuHealth }: Props) {
  const totalWarnings = menuHealth.missingImages + menuHealth.missingAllergens;

  return (
    <div className="fp-card overflow-hidden border border-border bg-white">
      <div className="px-4 pt-4">
        <h2 className="text-base font-bold text-dark">At a glance</h2>
      </div>
      <ul className="mt-3 divide-y divide-border">
        <Row
          href="/events"
          tint="vendor"
          icon={<MessageSquare className="h-[18px] w-[18px] text-vendor" aria-hidden />}
          label="Event enquiries"
          primary={
            eventEnquiries.pending === 0
              ? 'None to quote'
              : `${eventEnquiries.pending} to quote`
          }
          secondary={
            eventEnquiries.nextEventDate
              ? `Soonest: ${formatShortDate(eventEnquiries.nextEventDate)}`
              : 'Customers will appear here when they ask'
          }
        />
        <Row
          href="/payouts"
          tint={nextPayout ? 'brand' : 'surface'}
          icon={
            <Wallet
              className={cn('h-[18px] w-[18px]', nextPayout ? 'text-brand' : 'text-mid')}
              aria-hidden
            />
          }
          label="Next payout"
          primary={nextPayout ? formatMoney(nextPayout.amountPence) : 'Nothing accruing'}
          secondary={
            nextPayout
              ? `${payoutStateLabel(nextPayout.state)} · ${nextPayout.orderCount} order${
                  nextPayout.orderCount === 1 ? '' : 's'
                }${nextPayout.expectedDate ? ` · ${formatShortDate(nextPayout.expectedDate)}` : ''}`
              : 'Earnings show here once you have orders'
          }
        />
        <Row
          href="/menu"
          tint={totalWarnings > 0 ? 'amber' : 'surface'}
          icon={
            <AlertTriangle
              className={cn(
                'h-[18px] w-[18px]',
                totalWarnings > 0 ? 'text-amber-600' : 'text-mid',
              )}
              aria-hidden
            />
          }
          label="Menu warnings"
          primary={totalWarnings === 0 ? 'All set' : `${totalWarnings} to fix`}
          secondary={
            totalWarnings === 0
              ? 'Live items have images and allergens'
              : describeMenuWarnings(menuHealth)
          }
        />
      </ul>
    </div>
  );
}

function payoutStateLabel(state: DashboardNextPayout['state']): string {
  switch (state) {
    case 'accruing':
      return 'Accruing';
    case 'pending_approval':
      return 'On hold';
    case 'approved':
      return 'Approved';
    case 'transferring':
      return 'Transferring';
  }
}

function describeMenuWarnings(h: DashboardMenuHealth): string {
  const parts: string[] = [];
  if (h.missingImages > 0) {
    parts.push(`${h.missingImages} missing image${h.missingImages === 1 ? '' : 's'}`);
  }
  if (h.missingAllergens > 0) {
    parts.push(`${h.missingAllergens} missing allergen${h.missingAllergens === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

function Row({
  href,
  tint,
  icon,
  label,
  primary,
  secondary,
}: {
  href: string;
  tint: 'vendor' | 'brand' | 'amber' | 'surface';
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  const tintBg: Record<typeof tint, string> = {
    vendor: 'bg-vendor-light',
    brand: 'bg-brand-light',
    amber: 'bg-amber-50',
    surface: 'bg-surface',
  };

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface focus:outline-none focus-visible:bg-surface"
      >
        <span
          aria-hidden
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
            tintBg[tint],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-mid">{label}</p>
          <p className="truncate text-sm font-bold text-dark">{primary}</p>
          <p className="truncate text-[11px] text-mid">{secondary}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-mid" aria-hidden />
      </Link>
    </li>
  );
}
