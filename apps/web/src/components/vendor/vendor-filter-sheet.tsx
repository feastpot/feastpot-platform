'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Sheet, SheetContent, SheetTrigger } from '@feastpot/ui';

import type { VendorSortBy } from '@/lib/api/vendors';

const DIETARY_FLAGS = ['vegan', 'vegetarian', 'gluten-free', 'nut-free', 'dairy-free'] as const;
const ORDER_TYPES = [
  { value: '', label: 'Any' },
  { value: 'standard', label: 'Standard (tray / frozen)' },
  { value: 'event', label: 'Event catering' },
  { value: 'subscription', label: 'Subscription' },
] as const;
const SORTS: { value: VendorSortBy; label: string }[] = [
  { value: 'rating', label: 'Top rated' },
  { value: 'distance', label: 'Closest to me' },
  { value: 'reorderRate', label: 'Most reordered' },
];

/**
 * Bottom-sheet filter panel for the vendor search page. The form is
 * uncontrolled-ish: state lives locally while the sheet is open, then on
 * "Apply" we push the new filter set as URL search params (the source of
 * truth — TanStack Query re-runs `useVendors` because the queryKey changes).
 *
 * Putting filters in the URL means a customer can share a filtered search,
 * the back button works correctly, and we don't need an extra Zustand slice.
 */
export function VendorFilterSheet() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const initial = {
    halal: params?.get('halal') === 'true',
    dietary: (params?.get('dietary') ?? '').split(',').filter(Boolean),
    orderType: params?.get('orderType') ?? '',
    sortBy: (params?.get('sort') as VendorSortBy | null) ?? 'rating',
  };

  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const next = new URLSearchParams(params?.toString() ?? '');

    const halal = fd.get('halal') === 'on';
    if (halal) next.set('halal', 'true');
    else next.delete('halal');

    const dietary = fd.getAll('dietary').filter((v): v is string => typeof v === 'string');
    if (dietary.length) next.set('dietary', dietary.join(','));
    else next.delete('dietary');

    const orderType = fd.get('orderType');
    if (orderType && typeof orderType === 'string') next.set('orderType', orderType);
    else next.delete('orderType');

    const sort = fd.get('sort');
    if (sort && typeof sort === 'string') next.set('sort', sort);
    else next.delete('sort');

    router.push(`/vendors?${next.toString()}`);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-cream-deep bg-white px-3.5 py-2 text-sm font-bold text-charcoal transition-colors hover:bg-brand-light hover:text-brand-dark"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <div className="border-b border-cream-deep pb-3">
          <h2 className="font-display text-lg font-black tracking-tight text-charcoal">
            Filter kitchens
          </h2>
        </div>

        <form
          className="mt-4 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            apply(e.currentTarget);
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">Dietary</legend>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="halal" defaultChecked={initial.halal} className="h-4 w-4 rounded border-border" />
              <span>Halal-certified only</span>
            </label>
            {DIETARY_FLAGS.map((flag) => (
              <label key={flag} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="dietary"
                  value={flag}
                  defaultChecked={initial.dietary.includes(flag)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="capitalize">{flag.replace('-', ' ')}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">Order type</legend>
            <select
              name="orderType"
              defaultValue={initial.orderType}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {ORDER_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">Sort by</legend>
            <select
              name="sort"
              defaultValue={initial.sortBy}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </fieldset>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                router.push('/vendors');
                setOpen(false);
              }}
              className="touch-target flex-1 rounded-xl border border-cream-deep bg-white px-4 py-3 text-sm font-bold text-charcoal hover:bg-cream"
            >
              Reset
            </button>
            <button
              type="submit"
              className="touch-target flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
            >
              Apply filters
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
