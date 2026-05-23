import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type StatTone = 'teal' | 'brand' | 'amber' | 'red' | 'blue' | 'neutral';

const TONE_CLASSES: Record<StatTone, { bg: string; fg: string }> = {
  teal: { bg: 'bg-teal-light', fg: 'text-teal-dark' },
  brand: { bg: 'bg-brand-light', fg: 'text-brand-dark' },
  amber: { bg: 'bg-amber-100', fg: 'text-amber-700' },
  red: { bg: 'bg-red-100', fg: 'text-red-700' },
  blue: { bg: 'bg-vendor-light', fg: 'text-vendor-dark' },
  neutral: { bg: 'bg-muted', fg: 'text-muted-foreground' },
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Small caption rendered below the value (e.g. "vs last week", "5.0% of payout amount"). */
  caption?: ReactNode;
  /** Optional trailing accent (e.g. delta arrow). Rendered to the right of the value row. */
  trailing?: ReactNode;
}

/**
 * KPI tile used across the admin console. Rounded card with a tinted
 * square icon, small uppercase-ish label, big value, and optional caption.
 * Pure presentational - all numbers and formatting are passed in.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'teal',
  caption,
  trailing,
}: StatCardProps) {
  const t = TONE_CLASSES[tone];
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      {Icon && (
        <span
          aria-hidden="true"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${t.bg} ${t.fg}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="truncate text-2xl font-extrabold leading-none tracking-tight text-foreground">
            {value}
          </div>
          {trailing}
        </div>
        {caption && (
          <div className="mt-1 text-xs text-muted-foreground">{caption}</div>
        )}
      </div>
    </div>
  );
}
