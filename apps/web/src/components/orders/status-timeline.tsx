'use client';

import { Bike, Check, ChefHat, PackageCheck, ShoppingBag, Soup, type LucideIcon } from 'lucide-react';

import { cn } from '@feastpot/ui';

import type { Order, OrderStatus } from '@/lib/api/orders';

interface Stage {
  key: Exclude<OrderStatus, 'cancelled' | 'refunded'>;
  label: string;
  Icon: LucideIcon;
}

const STAGES: Stage[] = [
  { key: 'pending', label: 'Order placed', Icon: ShoppingBag },
  { key: 'accepted', label: 'Vendor accepted', Icon: ChefHat },
  { key: 'preparing', label: 'Being prepared', Icon: Soup },
  { key: 'dispatched', label: 'Out for delivery', Icon: Bike },
  { key: 'delivered', label: 'Delivered', Icon: PackageCheck },
];

const STAGE_INDEX = new Map<OrderStatus, number>(STAGES.map((s, i) => [s.key, i]));

/**
 * Vertical status stepper for the order tracking page.
 *
 * Visual rules per stage:
 *   - completed:  brand-green circle with ✓ + solid connector down
 *   - current:    brand-green circle with the stage Lucide icon + pulsing ring + "In progress" pill
 *   - future:     cream circle with the stage Lucide icon + dashed connector
 *
 * Cancelled/refunded orders are NOT one of the timeline stages — the parent
 * page renders a separate destructive banner for those terminal states. This
 * component just stops painting "current" once it sees a cancelled status.
 */
export function StatusTimeline({ order }: { order: Order }) {
  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  const currentIdx = isCancelled ? -1 : STAGE_INDEX.get(order.status) ?? -1;

  return (
    <ol className="space-y-0">
      {STAGES.map((stage, idx) => {
        const isDone = !isCancelled && idx < currentIdx;
        const isCurrent = !isCancelled && idx === currentIdx;
        const isFuture = isCancelled || idx > currentIdx;
        const isLast = idx === STAGES.length - 1;
        const stamp = stageTimestamp(order, stage.key, isCurrent);

        return (
          <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Connector line down to the next item — sits behind the circle */}
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[18px] top-9 h-[calc(100%-2.25rem)] w-0',
                  isDone ? 'border-l-2 border-brand' : 'border-l-2 border-dashed border-cream-deep',
                )}
              />
            )}

            {/* Stage circle */}
            <span
              className={cn(
                'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                isDone && 'bg-brand text-white',
                isCurrent && 'bg-brand text-white shadow-card',
                isFuture && 'bg-cream text-charcoal-mid',
              )}
              aria-hidden
            >
              {isCurrent && (
                <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-40" />
              )}
              <span className="relative flex">
                {isDone ? <Check className="h-4 w-4" aria-hidden /> : <stage.Icon className="h-4 w-4" aria-hidden />}
              </span>
            </span>

            {/* Label + timestamp */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p
                  className={cn(
                    'text-sm',
                    isCurrent && 'font-display font-black text-charcoal',
                    isDone && 'font-bold text-charcoal',
                    isFuture && 'font-medium text-charcoal-mid',
                  )}
                >
                  {stage.label}
                </p>
                {isCurrent && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    In progress
                  </span>
                )}
              </div>
              {stamp && <p className="mt-0.5 text-xs font-medium text-charcoal-mid">{stamp}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function stageTimestamp(order: Order, stage: Stage['key'], isCurrent: boolean): string | null {
  switch (stage) {
    case 'pending':
      return order.createdAt ? `Placed at ${formatTime(order.createdAt)}` : null;
    case 'accepted':
      return order.acceptedAt ? `Accepted at ${formatTime(order.acceptedAt)}` : null;
    case 'dispatched':
      return order.dispatchedAt ? `Dispatched at ${formatTime(order.dispatchedAt)}` : null;
    case 'delivered':
      if (order.deliveredAt) return `Delivered at ${formatTime(order.deliveredAt)}`;
      if (isCurrent && order.scheduledFor) return `Expected by ${formatTime(order.scheduledFor)}`;
      return null;
    default:
      return null;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
