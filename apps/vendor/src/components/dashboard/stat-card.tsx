'use client';

import { cn } from '@feastpot/ui';
import {
  HourglassIcon,
  PoundSterling,
  ShoppingBag,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export type StatCardIconKey = 'revenue' | 'orders' | 'pending' | 'rating';

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Optional small line under the value (e.g. "No sales yet today"). */
  hint?: string;
  /** e.g. "£" — rendered before the animated number. */
  prefix?: string;
  /** e.g. " orders" — rendered after the animated number. */
  suffix?: string;
  /** % vs last week. Positive = good (teal), negative = bad (red). */
  change?: number;
  /** Which icon to show in the top-left tinted square. */
  iconKey: StatCardIconKey;
  /** Visual treatment — picks the icon-tile colour. */
  color: 'brand' | 'teal' | 'vendor' | 'amber';
  /** Pulse the icon (used for pending-orders attention). */
  pulse?: boolean;
}

const ICONS: Record<StatCardIconKey, LucideIcon> = {
  revenue: PoundSterling,
  orders: ShoppingBag,
  pending: HourglassIcon,
  rating: Star,
};

/**
 * Animated count-up stat card used across the vendor dashboard and
 * analytics page.
 *
 * Visual layout (matches the mockup):
 *   ┌──────────────────────────────┐
 *   │ [icon] LABEL                 │
 *   │                              │
 *   │ £127                         │   ← big value
 *   │ Hint copy                    │   ← optional secondary line
 *   └──────────────────────────────┘
 *
 * The icon sits in a soft-tinted rounded square in the top-left,
 * coloured by the `color` prop. Labels go ABOVE the value (not below
 * as in the earlier version) so the user reads label-then-number.
 *
 * Count-up runs over 800ms with an ease-out cubic. Non-numeric
 * prefix/suffix wrap the number unchanged so the same component
 * renders both "£127" and "12 orders" naturally. When `value` is a
 * string we strip everything except digits and `.`, so "£87.50"
 * yields 87.50; callers that pass pre-formatted strings should split
 * the prefix off via the `prefix` prop so the animation runs on the
 * bare number.
 */
export function StatCard({
  label,
  value,
  hint,
  prefix,
  suffix,
  change,
  iconKey,
  color,
  pulse,
}: StatCardProps) {
  const numValue =
    typeof value === 'number'
      ? value
      : parseFloat(value.toString().replace(/[^0-9.]/g, '')) || 0;

  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const duration = 800;
    const startTime = performance.now();
    let raf = 0;
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * numValue));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [numValue]);

  const hasFraction = numValue % 1 !== 0;
  const display = hasFraction && displayed === Math.round(numValue)
    ? numValue.toFixed(numValue.toString().split('.')[1]?.length === 1 ? 1 : 2)
    : displayed.toString();

  const tileTone: Record<NonNullable<StatCardProps['color']>, string> = {
    brand: 'bg-brand-light text-brand',
    teal: 'bg-teal-light text-teal',
    vendor: 'bg-vendor-light text-vendor',
    amber: 'bg-amber-50 text-amber-600',
  };

  const Icon = ICONS[iconKey];

  return (
    <div className="fp-card animate-fade-up border border-border bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
            tileTone[color],
            pulse && 'animate-pulse',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mid">
          {label}
        </p>
      </div>
      <p className="mt-3 text-[28px] font-black leading-none text-dark">
        {prefix}
        {display}
        {suffix}
      </p>
      {hint && <p className="mt-1.5 text-xs text-mid">{hint}</p>}
      {change !== undefined && (
        <p
          className={cn(
            'mt-1.5 text-[11px] font-medium',
            change >= 0 ? 'text-teal' : 'text-red-500',
          )}
        >
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs last week
        </p>
      )}
    </div>
  );
}
