import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Editorial page header used by every admin route. Renders a large,
 * extra-bold display title with a short brand-orange underline accent
 * (matches the FeastPot admin redesign), an optional sub-description,
 * and a right-aligned actions slot for primary CTAs (Export, New, etc.).
 *
 * Pure presentational change - the API (title/description/actions) is
 * unchanged so every existing page still works without edits.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <span
          aria-hidden="true"
          className="mt-1 block h-1 w-12 rounded-full bg-brand"
        />
        {description && (
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
