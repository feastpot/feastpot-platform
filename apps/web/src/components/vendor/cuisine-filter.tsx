'use client';

import Link from 'next/link';

import { cn } from '@feastpot/ui';

/**
 * Cuisine browse list.
 *
 * Two render modes:
 *  - `variant="cards"`  — visual scroll-snap carousel of 88×76px tiles with a
 *                         country flag/emoji and a one-line dish hint. Used
 *                         on the homepage; the audit specifically called for
 *                         this so each row evokes the cuisine, not just labels
 *                         it.
 *  - `variant="pills"`  — compact pill row (the original behaviour). Still
 *                         used inside the /vendors search page where vertical
 *                         space is tight and the filter is one of many.
 *
 * The cards variant lists more cuisines than pills (Congolese, Somali) since
 * the homepage is a "discover what's possible" surface; the search page sticks
 * to the canonical short list to keep the toolbar compact.
 */
const CUISINES_PILLS = ['All', 'Nigerian', 'Ghanaian', 'Jamaican', 'Caribbean', 'Other'] as const;

const CUISINES_CARDS = [
  { label: 'All', emoji: '🌍', dish: 'Everything', value: '' },
  { label: 'Nigerian', emoji: '🇳🇬', dish: 'Jollof · Egusi · Suya', value: 'Nigerian' },
  { label: 'Ghanaian', emoji: '🇬🇭', dish: 'Waakye · Fufu · Kelewele', value: 'Ghanaian' },
  { label: 'Jamaican', emoji: '🇯🇲', dish: 'Jerk · Rice & Peas', value: 'Jamaican' },
  { label: 'Caribbean', emoji: '🌴', dish: 'Oxtail · Curry Goat', value: 'Caribbean' },
  { label: 'Congolese', emoji: '🇨🇩', dish: 'Pondu · Liboke', value: 'Congolese' },
  { label: 'Somali', emoji: '🇸🇴', dish: 'Bariis · Suqaar', value: 'Somali' },
] as const;

interface Props {
  /** Active cuisine label, e.g. "Nigerian". `null` / undefined means "All". */
  active?: string | null;
  /**
   * When set, each entry is rendered as a Link to /vendors?cuisine=...
   * (used on the homepage). When false, parent controls navigation via
   * onSelect (used on the search page where filters are URL-driven).
   */
  href?: boolean;
  onSelect?: (cuisine: string | null) => void;
  /** Optional postcode to preserve when navigating from the homepage pills. */
  postcode?: string | null;
  /** Visual mode — defaults to compact pills for back-compat with /vendors. */
  variant?: 'pills' | 'cards';
}

export function CuisineFilter({ active, href = true, onSelect, postcode, variant = 'pills' }: Props) {
  const current = active ?? 'All';

  if (variant === 'cards') {
    // `scroll-snap-type: x mandatory` is set inline because Tailwind's
    // `snap-x` only sets one half of the property pair; we need the
    // `mandatory` strictness for a confident swipe-to-next feel on iOS.
    return (
      <nav aria-label="Browse cuisines">
        <ul
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {CUISINES_CARDS.map((c) => {
            const isActive = current === c.label;
            const cardCls = cn(
              'flex shrink-0 snap-start flex-col items-center justify-center rounded-2xl px-2 py-2 text-center transition',
              isActive
                ? 'border-2 border-brand bg-brand-light'
                : 'border border-cream-deep bg-white hover:bg-cream',
            );
            const inner = (
              <>
                <span aria-hidden style={{ fontSize: '32px', lineHeight: 1 }}>
                  {c.emoji}
                </span>
                <span
                  className="mt-1"
                  style={{ fontSize: '11px', fontWeight: 700, color: '#1C1C1A' }}
                >
                  {c.label}
                </span>
                <span
                  className="mt-0.5 line-clamp-1"
                  style={{ fontSize: '9px', color: '#9B9894' }}
                >
                  {c.dish}
                </span>
              </>
            );
            const style = { width: '88px', height: '76px' } as const;
            if (href) {
              const params = new URLSearchParams();
              if (postcode) params.set('postcode', postcode);
              if (c.value) params.set('cuisine', c.value);
              const qs = params.toString();
              return (
                <li key={c.label}>
                  <Link href={`/vendors${qs ? `?${qs}` : ''}`} className={cardCls} style={style}>
                    {inner}
                  </Link>
                </li>
              );
            }
            return (
              <li key={c.label}>
                <button
                  type="button"
                  className={cardCls}
                  style={style}
                  onClick={() => onSelect?.(c.value ? c.value : null)}
                >
                  {inner}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  // Pills variant — preserves the original /vendors search-page behaviour.
  return (
    <nav aria-label="Cuisine filter">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CUISINES_PILLS.map((c) => {
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
