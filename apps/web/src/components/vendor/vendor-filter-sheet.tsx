'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import {
  ALLERGEN_DISCLAIMER_SHORT,
  ALLERGEN_FREE_SLUG_SET,
  DIETARY_PREFERENCE_SLUG_SET,
} from '@feastpot/config/allergens';

import { Sheet, SheetContent, SheetTrigger } from '@feastpot/ui';

import type { VendorSortBy } from '@/lib/api/vendors';

/**
 * Allergen-free options shown in the filter sheet.
 * "nut-free" maps to both 'nuts' and 'peanuts' per FSA definition.
 * The `values` array is the set of canonical slugs sent to the API.
 */
const ALLERGEN_OPTIONS: { values: string[]; label: string }[] = [
  { values: ['cereals-containing-gluten'], label: 'Gluten-free' },
  { values: ['milk'], label: 'Dairy-free' },
  { values: ['nuts', 'peanuts'], label: 'Nut-free' },
  { values: ['eggs'], label: 'Egg-free' },
  { values: ['fish'], label: 'Fish-free' },
  { values: ['crustaceans'], label: 'Shellfish-free' },
  { values: ['soya'], label: 'Soya-free' },
  { values: ['sesame'], label: 'Sesame-free' },
];

/** Lifestyle dietary preference options (not allergen-safety claims). */
const DIETARY_PREF_OPTIONS: { value: string; label: string }[] = [
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
];

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

/** Parse a comma-separated URL param into a validated slug set. */
function parseSlugParam(raw: string | null, allowed: ReadonlySet<string>): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => allowed.has(s)),
  );
}

/**
 * Bottom-sheet filter panel for the vendor search page. The form is
 * uncontrolled-ish: state lives locally while the sheet is open, then on
 * "Apply" we push the new filter set as URL search params (the source of
 * truth - TanStack Query re-runs `useVendors` because the queryKey changes).
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
    allergenFree: parseSlugParam(params?.get('allergenFree') ?? null, ALLERGEN_FREE_SLUG_SET),
    dietaryPreferences: parseSlugParam(
      params?.get('dietaryPreferences') ?? null,
      DIETARY_PREFERENCE_SLUG_SET,
    ),
    orderType: params?.get('orderType') ?? '',
    sortBy: (params?.get('sort') as VendorSortBy | null) ?? 'rating',
  };

  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const next = new URLSearchParams(params?.toString() ?? '');

    // --- Halal ---
    const halal = fd.get('halal') === 'on';
    if (halal) next.set('halal', 'true');
    else next.delete('halal');

    // --- Allergen-free: collect all checked slug arrays and flatten ---
    const allergenSlugs = new Set<string>();
    for (const opt of ALLERGEN_OPTIONS) {
      // FormData checkbox: present means checked; absence means unchecked.
      if (fd.get(`allergen_${opt.values.join('+')}`) === 'on') {
        opt.values.forEach((s) => allergenSlugs.add(s));
      }
    }
    if (allergenSlugs.size > 0) next.set('allergenFree', [...allergenSlugs].join(','));
    else next.delete('allergenFree');

    // --- Dietary preferences ---
    const dietarySlugs = new Set<string>();
    for (const opt of DIETARY_PREF_OPTIONS) {
      if (fd.get(`dietaryPref_${opt.value}`) === 'on') dietarySlugs.add(opt.value);
    }
    if (dietarySlugs.size > 0) next.set('dietaryPreferences', [...dietarySlugs].join(','));
    else next.delete('dietaryPreferences');

    // --- Legacy `dietary` param no longer used; remove if carried over ---
    next.delete('dietary');

    // --- Order type & sort ---
    const orderType = fd.get('orderType');
    if (orderType && typeof orderType === 'string' && orderType !== '')
      next.set('orderType', orderType);
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
          {/* ---- Halal ---- */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-charcoal">Certification</legend>
            <label className="flex items-center gap-3 text-sm font-medium text-charcoal">
              <input
                type="checkbox"
                name="halal"
                defaultChecked={initial.halal}
                className="h-4 w-4 rounded border-cream-deep accent-brand"
              />
              <span>Halal-certified only</span>
            </label>
          </fieldset>

          {/* ---- Dietary preferences (lifestyle, not safety) ---- */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-charcoal">Dietary preferences</legend>
            {DIETARY_PREF_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 text-sm font-medium text-charcoal"
              >
                <input
                  type="checkbox"
                  name={`dietaryPref_${value}`}
                  defaultChecked={initial.dietaryPreferences.has(value)}
                  className="h-4 w-4 rounded border-cream-deep accent-brand"
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {/* ---- Allergen-free (safety-critical) ---- */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-charcoal">Allergen-free dishes</legend>
            {ALLERGEN_OPTIONS.map(({ values, label }) => (
              <label
                key={values.join('+')}
                className="flex items-center gap-3 text-sm font-medium text-charcoal"
              >
                <input
                  type="checkbox"
                  name={`allergen_${values.join('+')}`}
                  defaultChecked={values.every((s) => initial.allergenFree.has(s))}
                  className="h-4 w-4 rounded border-cream-deep accent-brand"
                />
                <span>{label}</span>
              </label>
            ))}
            <p className="mt-1 text-[10px] leading-tight text-charcoal-mid/70">
              {ALLERGEN_DISCLAIMER_SHORT}
            </p>
          </fieldset>

          {/* ---- Order type ---- */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-charcoal">Order type</legend>
            <select
              name="orderType"
              defaultValue={initial.orderType}
              className="w-full rounded-xl border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {ORDER_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </fieldset>

          {/* ---- Sort ---- */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-charcoal">Sort by</legend>
            <select
              name="sort"
              defaultValue={initial.sortBy}
              className="w-full rounded-xl border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
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
