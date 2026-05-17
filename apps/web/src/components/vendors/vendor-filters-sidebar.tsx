'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const CUISINES = ['Nigerian', 'Ghanaian', 'Jamaican', 'Caribbean', 'Somali'];
const OCCASIONS = ['Birthday', 'Sunday meal', 'Office lunch', 'Wedding'];
const DELIVERY = ['Tomorrow', 'This weekend', 'Schedule later'];
const DIETARY = [
  { value: 'halal', label: 'Halal' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
] as const;

/**
 * Desktop two-column sidebar matching the wireframe. URL is the source of
 * truth — every checkbox toggle does a `router.replace` so the search reruns
 * via TanStack Query's queryKey change, the back button works, and links
 * stay shareable.
 *
 * Coverage caveat: Cuisine and Dietary (halal / dietary list) hit real API
 * filters; Occasion and Delivery write to URL state but are no-ops at the
 * API layer until the backend ships those facets. Surfacing them now keeps
 * the UI honest to the wireframe and means swapping to a wired backend is a
 * one-line change in apps/web/src/app/vendors/page.tsx.
 */
export function VendorFiltersSidebar() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const update = (mutator: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params?.toString() ?? '');
    mutator(sp);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname ?? '/vendors', { scroll: false });
  };

  const cuisine = params?.get('cuisine') ?? '';
  const occasion = (params?.get('occasion') ?? '').split(',').filter(Boolean);
  const delivery = (params?.get('delivery') ?? '').split(',').filter(Boolean);
  const halal = params?.get('halal') === 'true';
  const dietary = (params?.get('dietary') ?? '').split(',').filter(Boolean);

  const toggleMulti = (key: 'occasion' | 'delivery' | 'dietary', value: string) => {
    update((sp) => {
      const current = (sp.get(key) ?? '').split(',').filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length) sp.set(key, next.join(','));
      else sp.delete(key);
    });
  };

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

  const setDietary = (value: string) => {
    update((sp) => {
      const next = dietary.includes(value)
        ? dietary.filter((v) => v !== value)
        : [...dietary, value];
      if (next.length) sp.set('dietary', next.join(','));
      else sp.delete('dietary');
    });
  };

  const clearAll = () => {
    update((sp) => {
      sp.delete('cuisine');
      sp.delete('occasion');
      sp.delete('delivery');
      sp.delete('halal');
      sp.delete('dietary');
    });
  };

  const hasAny =
    !!cuisine || occasion.length > 0 || delivery.length > 0 || halal || dietary.length > 0;

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

      <FilterGroup title="Cuisine">
        {/* Single-select — rendered as native radios (with an "Any" option
            so the user can clear without hunting for the chosen pill).
            Checkboxes would announce as multi-select to screen readers
            and mismatch the actual behaviour. */}
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

      <FilterGroup title="Occasion">
        {OCCASIONS.map((o) => (
          <CheckboxRow
            key={o}
            checked={occasion.includes(o)}
            label={o}
            onChange={() => toggleMulti('occasion', o)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Delivery">
        {DELIVERY.map((d) => (
          <CheckboxRow
            key={d}
            checked={delivery.includes(d)}
            label={d}
            onChange={() => toggleMulti('delivery', d)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Dietary" last>
        <CheckboxRow checked={halal} label="Halal" onChange={() => setHalal(!halal)} />
        {DIETARY.filter((d) => d.value !== 'halal').map((d) => (
          <CheckboxRow
            key={d.value}
            checked={dietary.includes(d.value)}
            label={d.label}
            onChange={() => setDietary(d.value)}
          />
        ))}
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
  // Custom radio: native `accent-color` rendering of the inner dot is
  // unreliable when paired with a custom border colour (the dot ends up
  // hidden behind the thicker border on some browsers). We render a
  // visible 16px ring + 8px green inner dot ourselves and hide the
  // native control via `peer sr-only` so the underlying form semantics
  // (keyboard nav, screen readers, radio group exclusivity) still work.
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
