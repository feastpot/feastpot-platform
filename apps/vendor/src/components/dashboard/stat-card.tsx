'use client';

import { cn } from '@feastpot/ui';
import { useEffect, useState } from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  /** e.g. "£" - rendered before the animated number. */
  prefix?: string;
  /** e.g. " orders" - rendered after the animated number. */
  suffix?: string;
  /** % vs last week. Positive = good (teal), negative = bad (red). */
  change?: number;
  /** Emoji label rendered top-left. */
  icon: string;
  /** Visual treatment - picks the soft-tinted surface + accent text. */
  color: 'brand' | 'teal' | 'vendor' | 'gray' | 'amber';
  /** Pulse the icon (used for pending-orders attention). */
  pulse?: boolean;
}

/**
 * Animated count-up stat card used across the vendor dashboard and
 * analytics page. Counts from 0 → final on mount over 800ms with an
 * ease-out cubic. Non-numeric prefix/suffix wrap the number unchanged so
 * the same component renders both "£127" and "12 orders" naturally.
 *
 * NOTE on numeric parsing: when `value` is a string we strip everything
 * except digits and `.`, so e.g. "£87.50" yields 87.50. Callers that pass
 * pre-formatted strings should split the prefix off and pass it via the
 * `prefix` prop instead so the animation is on the bare number.
 */
export function StatCard({
  label,
  value,
  prefix,
  suffix,
  change,
  icon,
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

  // Round-trip currency-style values so we keep up to 2 decimal places when
  // the input had any (£87.50 → animates as integer pounds, then settles at
  // the formatted final). For pure ints (orders, ratings) this is a no-op.
  const hasFraction = numValue % 1 !== 0;
  const display = hasFraction && displayed === Math.round(numValue)
    ? numValue.toFixed(numValue.toString().split('.')[1]?.length === 1 ? 1 : 2)
    : displayed.toString();

  const colorMap: Record<NonNullable<StatCardProps['color']>, string> = {
    brand: 'bg-brand-light border-brand/20',
    teal: 'bg-teal-light border-teal/20',
    vendor: 'bg-vendor-light border-vendor/20',
    amber: 'bg-amber-50 border-amber-200',
    gray: 'bg-surface border-border',
  };

  return (
    <div className={cn('fp-card border p-4 animate-fade-up', colorMap[color])}>
      <div className={cn('mb-1 text-2xl', pulse && 'animate-pulse')} aria-hidden>
        {icon}
      </div>
      <div className="text-[22px] font-black leading-none text-dark">
        {prefix}
        {display}
        {suffix}
      </div>
      <div className="mt-1 text-xs text-mid">{label}</div>
      {change !== undefined && (
        <div
          className={cn(
            'mt-1.5 text-[11px] font-medium',
            change >= 0 ? 'text-teal' : 'text-red-500',
          )}
        >
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs last week
        </div>
      )}
    </div>
  );
}
