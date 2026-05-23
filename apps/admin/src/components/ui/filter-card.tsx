import type { ReactNode } from 'react';

export interface FilterCardProps {
  children: ReactNode;
  /** Right-aligned actions (e.g. Apply / Clear / Reset buttons). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Rounded white card that wraps a row of labeled filter controls.
 * Matches the audit-log and orders mockups where every filter sits
 * in its own labeled column inside a single elevated card.
 *
 * Layout: callers supply the inner grid (e.g. `grid-cols-2 md:grid-cols-4`)
 * via children so each page can decide its own column count.
 */
export function FilterCard({ children, actions, className }: FilterCardProps) {
  return (
    <div
      className={
        'rounded-xl border border-border bg-card p-4 shadow-sm ' + (className ?? '')
      }
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">{children}</div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
