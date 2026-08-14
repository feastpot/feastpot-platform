'use client';

import { cn } from '@feastpot/ui';
import { CalendarDays, Users } from 'lucide-react';
import Link from 'next/link';

import type { CateringBooking, CateringBookingStatus } from '@/lib/api/catering-bookings';

const STATUS_CONFIG: Record<
  CateringBookingStatus,
  { label: string; colour: string }
> = {
  QUOTED: { label: 'Quote sent', colour: 'bg-yellow-100 text-yellow-800' },
  DEPOSIT_PAID: { label: 'Deposit paid', colour: 'bg-blue-100 text-blue-800' },
  CONFIRMED: { label: 'Confirmed', colour: 'bg-green-100 text-green-800' },
  BALANCE_PAID: { label: 'Balance paid', colour: 'bg-green-200 text-green-900' },
  COMPLETED: { label: 'Completed', colour: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: 'Cancelled', colour: 'bg-red-100 text-red-700' },
  EXPIRED: { label: 'Expired', colour: 'bg-gray-100 text-gray-500' },
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(pence: number) {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  booking: CateringBooking;
}

/** Card for a CateringBooking in the unified Orders list. */
export function CateringBookingCard({ booking: b }: Props) {
  const st = STATUS_CONFIG[b.status] ?? { label: b.status, colour: 'bg-gray-100 text-gray-600' };

  // Balance is outstanding when the booking is active but the balance has not
  // yet been collected (DEPOSIT_PAID or CONFIRMED state).
  const balanceOutstanding =
    b.balancePence > 0 && (b.status === 'DEPOSIT_PAID' || b.status === 'CONFIRMED');

  return (
    <Link
      href={`/catering/${b.id}/quote`}
      className="fp-card block border border-border bg-white p-4 transition-colors hover:border-teal/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Type + status badges so catering rows stand out in the mixed list */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Catering
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', st.colour)}>
              {st.label}
            </span>
          </div>

          <p className="truncate font-semibold text-dark">{b.customerName}</p>
          <p className="text-sm text-mid">{b.customerEmail}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dark">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-mid" aria-hidden />
              <span className="font-medium">{formatDate(b.eventDate)}</span>
              {b.preferredTime && (
                <span className="text-mid"> at {b.preferredTime}</span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 shrink-0 text-mid" aria-hidden />
              {b.guestCount} guests
            </span>
          </div>

          {b.eventAddress && (
            <p className="mt-1 truncate text-xs text-mid">{b.eventAddress}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-base font-bold text-dark">{formatPounds(b.totalPence)}</p>
          {b.commissionPercent && (
            <p className="text-xs text-mid">{b.commissionPercent}% commission</p>
          )}
          {balanceOutstanding && (
            <p className="text-xs font-medium text-amber-700">
              Balance {formatPounds(b.balancePence)} due
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
