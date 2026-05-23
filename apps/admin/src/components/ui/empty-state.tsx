import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Render inside a bordered card (default true). Set false when already
   *  living inside another card or table. */
  bordered?: boolean;
}

/**
 * Friendly empty-state block: soft tinted icon circle, heading, helper
 * copy, and optional primary CTA. Used across discount-codes, users,
 * vendors, orders, etc. when a table/list is empty.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bordered = true,
}: EmptyStateProps) {
  return (
    <div
      className={
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ' +
        (bordered ? 'rounded-xl border border-dashed border-border bg-card' : '')
      }
    >
      {Icon && (
        <span
          aria-hidden="true"
          className="grid h-14 w-14 place-items-center rounded-full bg-teal-light text-teal-dark"
        >
          <Icon className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
