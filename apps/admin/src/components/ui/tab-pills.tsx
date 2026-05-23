'use client';

import type { ReactNode } from 'react';

export interface TabPillItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional count badge rendered to the right of the label. */
  count?: number;
  /** Tone of the count badge when this tab is inactive. Defaults to neutral. */
  countTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export interface TabPillsProps<T extends string> {
  items: ReadonlyArray<TabPillItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

const COUNT_TONE_INACTIVE: Record<NonNullable<TabPillItem<string>['countTone']>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-teal-light text-teal-dark',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-vendor-light text-vendor-dark',
};

/**
 * Pill-style segmented filter bar with optional per-tab count badges.
 * Active tab uses the dark teal primary; inactive tabs are outlined
 * with a tinted count badge. Mirrors the "All / Auto approved / Held /
 * Approved / Rejected" pattern in the reviews-queue and vendors mockups.
 */
export function TabPills<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: TabPillsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm"
    >
      {items.map((item) => {
        const active = item.value === value;
        const countCls = active
          ? 'bg-primary-foreground/15 text-primary-foreground'
          : COUNT_TONE_INACTIVE[item.countTone ?? 'neutral'];
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ' +
              (active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')
            }
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${countCls}`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
