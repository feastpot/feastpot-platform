'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@feastpot/ui';

/**
 * Wireframe "Party trays / Family pots / Weekly meals / Event catering /
 * Small chops / Freezer packs" chip row. These are merchandising buckets
 * shown directly under the search bar; selecting one writes `?category=` to
 * the URL.
 *
 * The vendor API doesn't (yet) expose a category-bucket filter, so the
 * /vendors page falls the chip through to the free-text `q` parameter when
 * no explicit query is present — close enough to "show me kitchens that do
 * party trays" without inventing a fake field. When the API ships a real
 * category facet, swap to a dedicated query param here without touching the
 * UI surface.
 */
const CATEGORIES = [
  'Party trays',
  'Family pots',
  'Weekly meals',
  'Event catering',
  'Small chops',
  'Freezer packs',
] as const;

export function CategoryChips() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const active = params?.get('category');

  const set = (next: string | null) => {
    const sp = new URLSearchParams(params?.toString() ?? '');
    if (next) sp.set('category', next);
    else sp.delete('category');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname ?? '/vendors', { scroll: false });
  };

  return (
    <div
      role="group"
      aria-label="Category"
      className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1"
    >
      {CATEGORIES.map((cat) => {
        const isActive = active === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => set(isActive ? null : cat)}
            aria-pressed={isActive}
            className={cn(
              'shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition',
              isActive
                ? 'border-brand bg-brand-light text-brand-dark'
                : 'border-cream-deep bg-white text-charcoal-mid hover:border-brand/40 hover:text-charcoal',
            )}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
