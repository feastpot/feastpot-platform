import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@feastpot/ui';

export interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Mobile-first page container for the customer PWA.
 *
 * `max-w-lg` keeps the hit-target rhythm thumb-friendly on phones, then
 * widens responsively (sm → 2xl, md → 4xl, lg → 5xl) so desktop browsers
 * don't render a narrow column with empty gutters either side.
 * `pb-20` reserves space so the fixed bottom nav never overlaps the last
 * row of content. We deliberately do NOT use the more generous `PageShell`
 * exported by `@feastpot/ui` here — that component targets the wider
 * vendor/admin desktop UIs.
 */
export function PageShell({ className, children, ...props }: PageShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-lg px-4 pb-20 pt-2 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
