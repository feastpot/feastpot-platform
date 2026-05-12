'use client';

import { Check } from 'lucide-react';

import { cn } from '@feastpot/ui';

import type { Order, OrderStatus } from '@/lib/api/orders';

interface Stage {
  key: Exclude<OrderStatus, 'cancelled' | 'refunded'>;
  label: string;
  icon: string;
}

const STAGES: Stage[] = [
  { key: 'pending', label: 'Order placed', icon: '🛒' },
  { key: 'accepted', label: 'Vendor accepted', icon: '👨\u200d🍳' },
  { key: 'preparing', label: 'Being prepared', icon: '🍲' },
  { key: 'dispatched', label: 'Out for delivery', icon: '🚗' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
];

const STAGE_INDEX = new Map<OrderStatus, number>(STAGES.map((s, i) => [s.key, i]));

/**
 * Vertical status stepper for the order tracking page.
 *
 * Visual rules per stage:
 *   - completed:  teal circle with ✓ + solid connector down
 *   - current:    brand circle with the stage emoji + pulsing ring + "In progress"
 *   - future:     muted circle with the stage emoji + dashed connector
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
                  isDone ? 'border-l-2 border-teal' : 'border-l-2 border-dashed border-gray-200',
                )}
              />
            )}

            {/* Stage circle */}
            <span
              className={cn(
                'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base',
                isDone && 'bg-teal text-white',
                isCurrent && 'bg-brand text-white',
                isFuture && 'bg-gray-100 text-mid',
              )}
              aria-hidden
            >
              {/* Pulsing ring for the current stage. Two layers — the ping
                  animation needs its own absolute element, the inner one
                  shows the icon. */}
              {isCurrent && (
                <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-40" />
              )}
              <span className="relative">
                {isDone ? <Check className="h-4 w-4" aria-hidden /> : stage.icon}
              </span>
            </span>

            {/* Label + timestamp */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p
                  className={cn(
                    'text-sm',
                    isCurrent && 'font-semibold text-dark',
                    isDone && 'font-medium text-dark',
                    isFuture && 'text-mid',
                  )}
                >
                  {stage.label}
                </p>
                {isCurrent && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                    In progress
                  </span>
                )}
              </div>
              {stamp && <p className="mt-0.5 text-xs text-mid">{stamp}</p>}
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
