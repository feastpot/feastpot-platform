'use client';

import { Card, CardContent } from '@feastpot/ui';
import { Bike, CalendarCheck2, Clock, Package } from 'lucide-react';
import Link from 'next/link';

import type { DashboardOrderDue } from '@/hooks/use-vendor-dashboard';

function formatTime(iso: string | null): string {
  if (!iso) return 'No time set';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'accepted':
      return 'Accepted';
    case 'needs_clarification':
      return 'Awaiting answer';
    case 'preparing':
      return 'Preparing';
    case 'ready':
      return 'Ready';
    case 'dispatched':
      return 'Out for delivery';
    default:
      return status.replace(/_/g, ' ');
  }
}

/**
 * Compact "orders due today" panel: scheduled-for window in the next
 * 24h, status badge, customer + delivery type at a glance. Empty
 * state matches the dashboard mockup — a soft circle holding a
 * calendar-check icon, with cheerful explanatory copy below.
 */
export function OrdersDueToday({ orders }: { orders: DashboardOrderDue[] }) {
  if (orders.length === 0) {
    return (
      <Card className="border border-border bg-white">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <span
            aria-hidden
            className="grid h-16 w-16 place-items-center rounded-full bg-teal-light text-teal"
          >
            <CalendarCheck2 className="h-7 w-7" />
          </span>
          <div>
            <p className="text-sm font-semibold text-dark">
              No orders scheduled for today.
            </p>
            <p className="mt-1 text-xs text-mid">
              New orders will appear here as soon as they come in.
            </p>
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
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-vendor-light text-vendor">
                {o.deliveryType === 'delivery' ? (
                  <Bike className="h-5 w-5" aria-hidden />
                ) : (
                  <Package className="h-5 w-5" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-dark">
                  {o.customerName}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-mid">
                  <Clock className="h-3 w-3" aria-hidden />
                  {formatTime(o.scheduledFor)} · {o.itemCount} item
                  {o.itemCount === 1 ? '' : 's'} · #{o.code}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-sm font-bold text-brand">
                {formatMoney(o.totalPence)}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-mid">
                {statusLabel(o.status)}
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
