import type { ReactNode } from 'react';

export type StatusTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'brand';

const TONE_CLASSES: Record<StatusTone, { wrap: string; dot: string }> = {
  success: { wrap: 'bg-teal-light text-teal-dark', dot: 'bg-teal' },
  warning: { wrap: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  danger: { wrap: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  info: { wrap: 'bg-vendor-light text-vendor-dark', dot: 'bg-vendor' },
  neutral: { wrap: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  brand: { wrap: 'bg-brand-light text-brand-dark', dot: 'bg-brand' },
};

export interface StatusPillProps {
  tone?: StatusTone;
  children: ReactNode;
  /** Hide the leading dot if false. Defaults to true. */
  withDot?: boolean;
}

/**
 * Compact status indicator: colored dot + label inside a softly tinted
 * pill. Used for vendor status, payout state, dispute severity, review
 * moderation state, etc. Tone names are functional (success/warning/...)
 * not color-named, so callers don't have to think about palettes.
 */
export function StatusPill({ tone = 'neutral', children, withDot = true }: StatusPillProps) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${t.wrap}`}
    >
      {withDot && (
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      )}
      {children}
    </span>
  );
}
