import type { ReactNode } from 'react';

import { cn } from '@feastpot/ui';

/**
 * Wireframe primitives (2026-05-16 ordering-flow redesign).
 *
 * Three small composable parts that get reused across the customer
 * ordering flow (browse, vendor profile, checkout, tracking) so each
 * page renders the same wireframe DNA without re-deriving inline
 * styles. Brand palette: green #00843D, gold #F6B400, red #E30613,
 * cream #FFFDF7.
 */

/** Green uppercase eyebrow + bold display heading + optional lede. */
export function SectionHeader({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 max-w-3xl', className)}>
      {eyebrow && (
        <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-2xl font-black tracking-tight text-charcoal md:text-3xl">
        {title}
      </h2>
      {body && (
        <p className="mt-2 text-sm font-medium leading-6 text-charcoal-mid md:text-base">
          {body}
        </p>
      )}
    </div>
  );
}

/**
 * Numbered panel title — black circle + bold heading. Used for ordered
 * sections (checkout steps, vendor menu categories) where a sequence
 * helps the user track progress through a flow.
 */
export function PanelTitle({
  num,
  title,
  className,
  size = 'md',
}: {
  num: number | string;
  title: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const dot = size === 'sm' ? 'h-6 w-6 text-[11px]' : 'h-7 w-7 text-xs';
  const heading =
    size === 'sm' ? 'text-base font-black' : 'text-lg font-black md:text-xl';
  return (
    <div className={cn('mb-3 flex items-center gap-2.5', className)}>
      <span
        aria-label={`Step ${num}`}
        role="img"
        className={cn(
          'grid shrink-0 place-items-center rounded-full bg-charcoal font-black text-white',
          dot,
        )}
      >
        {num}
      </span>
      <h2 className={cn('font-display tracking-tight text-charcoal', heading)}>
        {title}
      </h2>
    </div>
  );
}
