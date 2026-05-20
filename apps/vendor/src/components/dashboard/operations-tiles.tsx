'use client';

import { cn } from '@feastpot/ui';
import { Banknote, CalendarHeart, ImageOff } from 'lucide-react';
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
 * Three-tile row showing money + event + menu signal. Each tile is a
 * link to the page where the vendor can act on it. Colour escalates
 * only when there's actually a number to draw attention to.
 */
export function OperationsTiles({ eventEnquiries, nextPayout, menuHealth }: Props) {
  const totalWarnings = menuHealth.missingImages + menuHealth.missingAllergens;

  const enquiriesTone = eventEnquiries.pending > 0
    ? 'border-vendor/40 bg-vendor-light'
    : 'border-border bg-surface';
  const menuTone = totalWarnings > 0
    ? 'border-amber-300 bg-amber-50'
    : 'border-border bg-surface';
  const payoutTone = nextPayout
    ? 'border-brand/30 bg-brand-light'
    : 'border-border bg-surface';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile
        href="/events"
        className={enquiriesTone}
        icon={<CalendarHeart className="h-5 w-5 text-vendor" aria-hidden />}
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

      <Tile
        href="/payouts"
        className={payoutTone}
        icon={<Banknote className="h-5 w-5 text-brand" aria-hidden />}
        label="Next payout"
        primary={
          nextPayout
            ? formatMoney(nextPayout.amountPence)
            : 'Nothing accruing'
        }
        secondary={
          nextPayout
            ? `${payoutStateLabel(nextPayout.state)} · ${nextPayout.orderCount} order${
                nextPayout.orderCount === 1 ? '' : 's'
              }${nextPayout.expectedDate ? ` · ${formatShortDate(nextPayout.expectedDate)}` : ''}`
            : 'Earnings show here once you have orders'
        }
      />

      <Tile
        href="/menu"
        className={menuTone}
        icon={
          <ImageOff
            className={cn('h-5 w-5', totalWarnings > 0 ? 'text-amber-700' : 'text-mid')}
            aria-hidden
          />
        }
        label="Menu warnings"
        primary={
          totalWarnings === 0
            ? 'All set'
            : `${totalWarnings} to fix`
        }
        secondary={
          totalWarnings === 0
            ? 'Live items have images and allergens'
            : describeMenuWarnings(menuHealth)
        }
      />
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
    parts.push(
      `${h.missingAllergens} missing allergen${h.missingAllergens === 1 ? '' : 's'}`,
    );
  }
  return parts.join(' · ');
}

function Tile({
  href,
  className,
  icon,
  label,
  primary,
  secondary,
}: {
  href: string;
  className: string;
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'fp-card border p-3 transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-vendor',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide text-mid">
          {label}
        </span>
      </div>
      <p className="text-base font-bold text-dark">{primary}</p>
      <p className="mt-1 text-xs text-mid">{secondary}</p>
    </Link>
  );
}
