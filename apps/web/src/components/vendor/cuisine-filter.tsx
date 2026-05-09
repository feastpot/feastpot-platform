'use client';

import Link from 'next/link';

import { cn } from '@feastpot/ui';

const CUISINES = ['All', 'Nigerian', 'Ghanaian', 'Jamaican', 'Caribbean', 'Other'] as const;

interface Props {
  /** Active cuisine label, e.g. "Nigerian". `null` / undefined means "All". */
  active?: string | null;
  /**
   * When set, each pill is rendered as a Link to /vendors?cuisine=...
   * (used on the homepage). When false, parent controls navigation via
   * onSelect (used on the search page where filters are URL-driven anyway).
   */
  href?: boolean;
  onSelect?: (cuisine: string | null) => void;
  /** Optional postcode to preserve when navigating from the homepage pills. */
  postcode?: string | null;
}

/**
 * Horizontal-scroll cuisine pill row. `overflow-x-auto` + `snap` so it feels
 * native on mobile; `[scrollbar-width:none]` hides the scrollbar without
 * disabling scrolling itself.
 */
export function CuisineFilter({ active, href = true, onSelect, postcode }: Props) {
  const current = active ?? 'All';
  return (
    <nav aria-label="Cuisine filter">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CUISINES.map((c) => {
          const isActive = current === c;
          const pillCls = cn(
            'snap-start whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition',
            isActive
              ? 'border-brand bg-brand text-white'
              : 'border-border bg-background text-foreground hover:bg-muted',
          );

          if (href) {
            const params = new URLSearchParams();
            if (postcode) params.set('postcode', postcode);
            if (c !== 'All') params.set('cuisine', c);
            const qs = params.toString();
            return (
              <li key={c}>
                <Link href={`/vendors${qs ? `?${qs}` : ''}`} className={pillCls}>
                  {c}
                </Link>
              </li>
            );
          }

          return (
            <li key={c}>
              <button type="button" className={pillCls} onClick={() => onSelect?.(c === 'All' ? null : c)}>
                {c}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
