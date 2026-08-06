'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filters backed by real API fields in GET /v1/vendors.
 *
 * Cuisine   → `?cuisine=<value>`  → SearchVendorsDto.cuisine[]  ✅ server-side
 * Halal     → `?halal=true`       → SearchVendorsDto.halal       ✅ server-side
 * Distance  → `?radius=<miles>`   → SearchVendorsDto.maxDistanceKm ✅ server-side
 * Sort      → `?sort=<value>`     → SearchVendorsDto.sortBy      ✅ server-side
 *
 * Dropped candidates (no API backing - logged in docs/DEFECT-LOG.md):
 *   Occasion, Delivery timing, Vegan/Gluten-free dietary, Serves band,
 *   Hygiene evidence, Minimum rating, Pre-order available, Min order value,
 *   Delivery vs collection (SearchVendorsDto.orderType is standard/event/subscription,
 *   not delivery vs collection).
 */

const CUISINES = ['Nigerian', 'Ghanaian', 'Jamaican', 'Caribbean', 'Somali'];

// Keep in sync with RADIUS_OPTIONS_MI in apps/web/src/app/vendors/page.tsx -
// the page-level URL parser only accepts these exact values so the sidebar
// must offer the same set.
const RADIUS_OPTIONS_MI = [1, 3, 5, 10] as const;

export function VendorFiltersSidebar() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const update = (mutator: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params?.toString() ?? '');
    mutator(sp);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? '/vendors'), { scroll: false });
  };

  const cuisine = params?.get('cuisine') ?? '';
  const halal = params?.get('halal') === 'true';

  // Radius is only meaningful when a postcode is set.
  const postcode = params?.get('postcode')?.trim() ?? '';
  const radiusRaw = params?.get('radius');
  const radiusMiles = (() => {
    if (!radiusRaw) return null;
    const n = Number.parseFloat(radiusRaw);
    return Number.isFinite(n) && (RADIUS_OPTIONS_MI as readonly number[]).includes(n) ? n : null;
  })();

  const setCuisine = (value: string) => {
    update((sp) => {
      if (cuisine === value) sp.delete('cuisine');
      else sp.set('cuisine', value);
    });
  };

  const setHalal = (next: boolean) => {
    update((sp) => {
      if (next) sp.set('halal', 'true');
      else sp.delete('halal');
    });
  };

  const setRadius = (next: number | null) => {
    update((sp) => {
      if (next === null) sp.delete('radius');
      else sp.set('radius', String(next));
    });
  };

  const clearAll = () => {
    update((sp) => {
      sp.delete('cuisine');
      sp.delete('halal');
      sp.delete('radius');
    });
  };

  const hasAny = !!cuisine || halal || radiusMiles !== null;

  return (
    <aside
      aria-label="Filters"
      className="rounded-3xl border border-cream-deep bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-cream-deep pb-3">
        <h2 className="font-display text-lg font-black tracking-tight text-charcoal">Filters</h2>
        <button
          type="button"
          onClick={clearAll}
          disabled={!hasAny}
          className="text-xs font-bold text-brand transition hover:text-brand-dark disabled:cursor-not-allowed disabled:text-charcoal-mid/50"
        >
          Clear all
        </button>
      </div>

      {postcode && (
        <FilterGroup title="Distance">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Maximum distance">
            <RadiusPill
              label="Any"
              selected={radiusMiles === null}
              onClick={() => setRadius(null)}
            />
            {RADIUS_OPTIONS_MI.map((mi) => (
              <RadiusPill
                key={mi}
                label={`${mi} mi`}
                selected={radiusMiles === mi}
                onClick={() => setRadius(mi)}
              />
            ))}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title="Cuisine">
        <RadioRow
          name="cuisine"
          value=""
          checked={cuisine === ''}
          label="Any cuisine"
          onChange={() => update((sp) => sp.delete('cuisine'))}
        />
        {CUISINES.map((c) => (
          <RadioRow
            key={c}
            name="cuisine"
            value={c}
            checked={cuisine === c}
            label={c}
            onChange={() => setCuisine(c)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Dietary" last>
        <CheckboxRow checked={halal} label="Halal" onChange={() => setHalal(!halal)} />
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <fieldset className={last ? 'pt-5' : 'border-b border-cream-deep py-5'}>
      <legend className="mb-3 text-sm font-black text-charcoal">{title}</legend>
      <div className="space-y-2.5">{children}</div>
    </fieldset>
  );
}

function CheckboxRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-charcoal-mid hover:text-charcoal">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-cream-deep accent-brand"
      />
      <span>{label}</span>
    </label>
  );
}

function RadiusPill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`touch-target rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-cream-deep bg-white text-charcoal-mid hover:border-brand/40 hover:text-charcoal'
      }`}
    >
      {label}
    </button>
  );
}

function RadioRow({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 text-sm font-medium hover:text-charcoal ${
        checked ? 'text-charcoal' : 'text-charcoal-mid'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-cream-deep bg-white transition-colors peer-checked:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-1"
      >
        <span
          className={`h-2 w-2 rounded-full bg-brand transition-opacity ${
            checked ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
