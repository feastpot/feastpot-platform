'use client';

import { Info, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@feastpot/ui';

import type { VendorMenuItem } from '@/lib/api/vendors';
import {
  CrossVendorBasketError,
  useBasketStore,
  type BasketVendor,
} from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const SPICE_GLYPHS = ['', '🌶️', '🌶️🌶️', '🌶️🌶️🌶️'] as const;

/**
 * Dietary flags are stored snake-cased server-side (`gluten_free`,
 * `dairy_free`) but the older UI was filtering kebab-case (`gluten-free`),
 * which silently dropped them. We accept BOTH forms here and normalise to
 * the human label so we don't lose data on the way to the screen.
 */
const DIETARY_LABELS: Record<string, { label: string; icon: string }> = {
  vegan: { label: 'Vegan', icon: '🌱' },
  vegetarian: { label: 'Vegetarian', icon: '🥗' },
  halal: { label: 'Halal', icon: '🟢' },
  kosher: { label: 'Kosher', icon: '🔵' },
  gluten_free: { label: 'Gluten free', icon: '⚪️' },
  'gluten-free': { label: 'Gluten free', icon: '⚪️' },
  dairy_free: { label: 'Dairy free', icon: '🥛' },
  'dairy-free': { label: 'Dairy free', icon: '🥛' },
  nut_free: { label: 'Nut free', icon: '🥜' },
  'nut-free': { label: 'Nut free', icon: '🥜' },
};

/**
 * Server encodes spice/portion as TAG PREFIXES inside `tags: string[]`
 * (see api/src/modules/catalogue/menu-items.service.ts). We decode them on
 * read so the card UI doesn't need to know about that encoding choice.
 */
function decodeTags(tags: string[]): {
  spiceLevel: 0 | 1 | 2 | 3;
  portionLabel: string | null;
  dietary: Array<{ key: string; label: string; icon: string }>;
} {
  let spiceLevel: 0 | 1 | 2 | 3 = 0;
  let portionLabel: string | null = null;
  const dietary: Array<{ key: string; label: string; icon: string }> = [];
  const seen = new Set<string>();

  for (const t of tags) {
    if (t.startsWith('spicy-')) {
      const lvl = Number(t.slice('spicy-'.length));
      if (lvl === 1 || lvl === 2 || lvl === 3) spiceLevel = lvl;
    } else if (t.startsWith('portion-')) {
      portionLabel = t.slice('portion-'.length).replace(/-/g, ' ');
    } else {
      const meta = DIETARY_LABELS[t];
      if (meta && !seen.has(meta.label)) {
        dietary.push({ key: t, ...meta });
        seen.add(meta.label);
      }
    }
  }

  return { spiceLevel, portionLabel, dietary };
}

/**
 * Mirrors the store's `makeLineId` so we can look up the current line for
 * inline +/- without re-implementing the store's identity rule. The inline
 * card never sets `customisationNotes`, so the line key is always
 * `<menuItemId>::`. Lines with customisation are managed in the basket
 * drawer where the notes UI lives.
 */
const inlineLineId = (menuItemId: string) => `${menuItemId}::`;

interface Props {
  item: VendorMenuItem;
  /** Full vendor identity passed to the basket store on add. */
  vendor: BasketVendor;
}

/**
 * Menu item card with **inline** +/- quantity bound to the basket store.
 *
 * UX paradigm shift from the previous card: there is no pre-add quantity
 * stepper. The first tap on `+` adds one to the basket immediately, and the
 * +/- pill becomes the live edit surface. This is the standard pattern on
 * Deliveroo/UberEats and removes one full tap per item from the order flow.
 *
 * Cross-vendor: clicking + when the basket holds items from another vendor
 * triggers a confirm() prompt before clearing — same behaviour as the old
 * card. Replacing the native confirm with a Dialog is a future polish.
 */
export function MenuItemCard({ item, vendor }: Props) {
  const items = useBasketStore((s) => s.items);
  const basketVendorId = useBasketStore((s) => s.vendor?.id ?? null);
  const addItem = useBasketStore((s) => s.addItem);
  const removeLine = useBasketStore((s) => s.removeLine);
  const updateLineQuantity = useBasketStore((s) => s.updateLineQuantity);
  const clearBasket = useBasketStore((s) => s.clearBasket);

  const [showAllergens, setShowAllergens] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Only count the inline (no-customisation) line; customised lines are
  // separate orders from the user's perspective and shown in the drawer.
  const lineId = inlineLineId(item.id);
  const sameVendor = basketVendorId === null || basketVendorId === vendor.id;
  const qty = sameVendor ? items.find((i) => i.lineId === lineId)?.quantity ?? 0 : 0;

  const { spiceLevel, portionLabel, dietary } = decodeTags(item.tags);
  const cover = item.imageUrls[0];

  const flashPulse = () => {
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  };

  const tryAdd = () => {
    try {
      addItem(
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 1,
          unitPricePence: item.pricePence,
          imageUrl: cover,
          portionLabel: portionLabel ?? undefined,
        },
        vendor,
      );
      flashPulse();
    } catch (e) {
      if (e instanceof CrossVendorBasketError) {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm(
            'Your basket has items from another vendor. Clear basket and add this item?',
          );
        if (ok) {
          clearBasket();
          addItem(
            {
              menuItemId: item.id,
              menuItemName: item.name,
              quantity: 1,
              unitPricePence: item.pricePence,
              imageUrl: cover,
              portionLabel: portionLabel ?? undefined,
            },
            vendor,
          );
          flashPulse();
        }
        return;
      }
      throw e;
    }
  };

  const handleMinus = () => {
    if (qty <= 1) removeLine(lineId);
    else updateLineQuantity(lineId, qty - 1);
  };

  if (!item.isAvailable) {
    return (
      <div className="fp-card flex gap-3 p-3 opacity-50">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover grayscale" />
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-xl bg-surface" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-dark">{item.name}</p>
          <p className="mt-0.5 text-xs text-mid line-through">{formatPounds(item.pricePence)}</p>
          <p className="mt-1 text-xs text-mid">Currently unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <article
      className={cn(
        'fp-card p-3 transition-transform duration-200',
        pulse && 'scale-[1.01]',
      )}
    >
      <div className="flex gap-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="brand-gradient flex h-24 w-24 shrink-0 items-center justify-center rounded-xl text-3xl" aria-hidden>
            🍽️
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold leading-tight text-dark">{item.name}</h3>
            {spiceLevel > 0 && (
              <span className="shrink-0 text-xs" aria-label={`Spice level ${spiceLevel}`}>
                {SPICE_GLYPHS[spiceLevel]}
              </span>
            )}
          </div>

          {(portionLabel || item.servingsCount) && (
            <p className="mt-0.5 text-[11px] capitalize text-mid">
              {portionLabel ?? `Serves ${item.servingsCount}`}
            </p>
          )}

          {item.description && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-mid">
              {item.description}
            </p>
          )}

          {dietary.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {dietary.map((d) => (
                <li
                  key={d.key}
                  className="inline-flex items-center gap-1 rounded-md bg-teal-light px-1.5 py-0.5 text-[10px] font-medium text-teal-dark"
                >
                  <span aria-hidden>{d.icon}</span>
                  {d.label}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[15px] font-bold text-dark">
              {formatPounds(item.pricePence)}
            </span>

            {qty === 0 ? (
              <button
                type="button"
                onClick={tryAdd}
                aria-label={`Add ${item.name} to basket`}
                className="touch-target flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-sm transition-transform active:scale-90"
              >
                <Plus className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-1 rounded-full bg-brand p-1 shadow-sm transition-transform duration-200',
                  pulse && 'scale-110',
                )}
              >
                <button
                  type="button"
                  onClick={handleMinus}
                  aria-label={`Decrease ${item.name} quantity`}
                  className="flex h-7 w-7 items-center justify-center text-white transition-transform active:scale-90"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span
                  className="w-5 text-center text-sm font-bold tabular-nums text-white"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={tryAdd}
                  aria-label={`Increase ${item.name} quantity`}
                  className="flex h-7 w-7 items-center justify-center text-white transition-transform active:scale-90"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {item.allergens.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllergens((s) => !s)}
              aria-expanded={showAllergens}
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-mid transition-colors hover:text-dark"
            >
              <Info className="h-3 w-3" aria-hidden />
              {showAllergens ? 'Hide allergens' : 'View allergens'}
            </button>
          )}
          {showAllergens && (
            <p className="mt-1 rounded-lg bg-amber-50 p-2 text-[10px] leading-relaxed text-mid">
              ⚠️ Contains: {item.allergens.join(', ')}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
