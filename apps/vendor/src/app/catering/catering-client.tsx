'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { CateringBooking } from '@/lib/api/catering-bookings';
import { useVendorCateringBookings } from '@/hooks/use-catering-bookings';
import { useAuth } from '@/lib/auth/auth-provider';

const STATUS_LABELS: Record<string, { label: string; colour: string }> = {
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

function formatPounds(p: number) {
  return `£${(p / 100).toFixed(2)}`;
}

export function CateringClient({ vendorId }: { vendorId: string }) {
  const { accessToken } = useAuth();
  const { data: bookings, isLoading, error } = useVendorCateringBookings(accessToken);
  const [filter, setFilter] = useState<string>('all');

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading bookings…</p>;
  if (error) return <p className="text-sm text-destructive">Failed to load catering bookings.</p>;

  const filtered =
    filter === 'all' ? (bookings ?? []) : (bookings ?? []).filter((b) => b.status === filter);

  const upcoming = (bookings ?? []).filter(
    (b) =>
      ['QUOTED', 'DEPOSIT_PAID', 'CONFIRMED', 'BALANCE_PAID'].includes(b.status) &&
      new Date(b.eventDate) > new Date(),
  ).length;

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Upcoming events</p>
          <p className="text-2xl font-bold">{upcoming}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total bookings</p>
          <p className="text-2xl font-bold">{bookings?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Confirmed GMV</p>
          <p className="text-2xl font-bold">
            {formatPounds(
              (bookings ?? [])
                .filter((b) => ['CONFIRMED', 'BALANCE_PAID', 'COMPLETED'].includes(b.status))
                .reduce((s, b) => s + b.totalPence, 0),
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold">
            {(bookings ?? []).filter((b) => b.status === 'COMPLETED').length}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {['all', 'QUOTED', 'CONFIRMED', 'BALANCE_PAID', 'COMPLETED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === s
                ? 'bg-primary text-primary-foreground'
                : 'border bg-background text-muted-foreground hover:bg-accent'
            }`}
          >
            {s === 'all' ? 'All' : (STATUS_LABELS[s]?.label ?? s)}
          </button>
        ))}
      </div>

      {/* New quote CTA */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filtered.length} booking{filtered.length !== 1 ? 's' : ''}
        </h2>
        <Link
          href="/catering/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New catering quote
        </Link>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No catering bookings yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When admin routes a catering enquiry to you, create a quote here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking: b }: { booking: CateringBooking }) {
  const st = STATUS_LABELS[b.status] ?? { label: b.status, colour: 'bg-gray-100 text-gray-600' };
  return (
    <Link
      href={`/catering/${b.id}/quote`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">{b.customerName}</p>
          <p className="text-sm text-muted-foreground">{b.customerEmail}</p>
          <p className="mt-1 text-sm">
            <span className="font-medium">{formatDate(b.eventDate)}</span>
            {b.preferredTime && (
              <span className="text-muted-foreground"> at {b.preferredTime}</span>
            )}{' '}
            &bull; {b.guestCount} guests
          </p>
          {b.eventAddress && (
            <p className="text-xs text-muted-foreground truncate">{b.eventAddress}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.colour}`}>
            {st.label}
          </span>
          <p className="text-sm font-bold">{formatPounds(b.totalPence)}</p>
          {b.commissionPercent && (
            <p className="text-xs text-muted-foreground">{b.commissionPercent}% commission</p>
          )}
        </div>
      </div>
    </Link>
  );
}
