'use client';

import { Card, CardContent } from '@feastpot/ui';
import { CalendarDays } from 'lucide-react';
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
 * OrdersDueToday). Helps a vendor plan prep without having to open the
 * orders board.
 */
export function UpcomingOrders({ orders }: { orders: DashboardUpcomingOrder[] }) {
  if (orders.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-mid">Nothing booked for the week ahead.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="flex items-center justify-between gap-3 p-3 transition hover:bg-surface"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-vendor-light text-vendor">
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
