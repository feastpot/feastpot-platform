'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { VendorSortBy } from '@/lib/api/vendors';

const SORTS: { value: '' | VendorSortBy; label: string }[] = [
  { value: '', label: 'Recommended' },
  { value: 'rating', label: 'Top rated' },
  { value: 'distance', label: 'Closest to me' },
  { value: 'reorderRate', label: 'Most reordered' },
];

interface Props {
  count: number;
  postcode: string | null;
  loading: boolean;
}

/**
 * "32 results for SW16" + "Sort by: Recommended" row above the vendor list.
 * The sort dropdown writes `?sort=` (omitting it for the default Recommended
 * value so URLs stay clean), and the count uses singular/plural copy so a
 * single result doesn't render as "1 results".
 */
export function VendorResultsHeader({ count, postcode, loading }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Mirror the page-level default: when a postcode is set and no explicit
  // `?sort=` is in the URL, the list is sorted by distance, so reflect that
  // in the dropdown instead of falsely showing "Recommended".
  //
  // We also drop the "Recommended" (empty value) option from the menu while a
  // postcode is set - selecting it would clear `?sort=`, which the page would
  // immediately reinterpret as the implicit distance default, leaving the
  // user with a sticky "selected but never applied" state.
  const sortParam = params?.get('sort') ?? '';
  const current = sortParam || (postcode ? 'distance' : '');
  const options = postcode ? SORTS.filter((s) => s.value !== '') : SORTS;

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const sp = new URLSearchParams(params?.toString() ?? '');
    if (value) sp.set('sort', value);
    else sp.delete('sort');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname ?? '/vendors', { scroll: false });
  };

  const label = loading
    ? 'Loading kitchens…'
    : `${count} ${count === 1 ? 'result' : 'results'}${postcode ? ` for ${postcode.toUpperCase()}` : ''}`;

  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-xl font-black tracking-tight text-charcoal md:text-2xl">
        {label}
      </h2>
      <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal-mid">
        <span className="hidden sm:inline">Sort by:</span>
        <select
          value={current}
          onChange={onChange}
          aria-label="Sort results"
          className="rounded-xl border border-cream-deep bg-white px-3 py-2 text-sm font-bold text-charcoal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {options.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
