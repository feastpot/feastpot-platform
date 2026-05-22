'use client';

import { Card, CardContent } from '@feastpot/ui';
import { CalendarDays, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';

import type { DashboardUpcomingOrder } from '@/hooks/use-vendor-dashboard';

function formatDay(iso: string | null): string {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Forward-looking panel: next 7 days, excluding today (today lives in
 * OrdersDueToday). Helps a vendor plan prep without having to open
 * the orders board. Empty state mirrors `OrdersDueToday` so the two
 * stacked cards read as a pair on the mockup.
 */
export function UpcomingOrders({ orders }: { orders: DashboardUpcomingOrder[] }) {
  if (orders.length === 0) {
    return (
      <Card className="border border-border bg-white">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <span
            aria-hidden
            className="grid h-16 w-16 place-items-center rounded-full bg-teal-light text-teal"
          >
            <ClipboardCheck className="h-7 w-7" />
          </span>
          <div>
            <p className="text-sm font-semibold text-dark">
              Nothing booked for the week ahead.
            </p>
            <p className="mt-1 text-xs text-mid">You&rsquo;re all clear!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-white">
      <CardContent className="divide-y divide-border p-0">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="flex items-center justify-between gap-3 p-3 transition hover:bg-surface"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-teal-light text-teal">
                <CalendarDays className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-dark">
                  {formatDay(o.scheduledFor)} · {formatTime(o.scheduledFor)}
                </p>
                <p className="truncate text-xs text-mid">
                  {o.customerName} · #{o.code}
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-brand">
              {formatMoney(o.totalPence)}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
