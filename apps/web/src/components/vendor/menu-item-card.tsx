'use client';

import { Flame, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { CrossVendorBasketError, useBasketStore, type BasketVendor } from '@/store/basket.store';
import type { VendorMenuItem } from '@/lib/api/vendors';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

interface Props {
  item: VendorMenuItem;
  /** The vendor whose menu this item belongs to — passed straight to the
   * basket store so the drawer can render vendor name + link without an
   * extra API call. */
  vendor: BasketVendor;
  /** "tray", "frozen", "snack" — affects the +/- step label. */
  category?: string;
  /** Optional spice level (0–3) parsed from item.tags by the parent. */
  spiceLevel?: number;
}

/**
 * Single menu item row. Holds local quantity state until the customer commits
 * via "Add", at which point we push to the basket store and reset.
 *
 * Cross-vendor guard: catches `CrossVendorBasketError` from the store and
 * surfaces a confirm() prompt — replacing this with a styled Dialog is a
 * future polish (kept simple here to avoid pulling another component into
 * the scaffold).
 */
export function MenuItemCard({ item, vendor, category, spiceLevel = 0 }: Props) {
  const addItem = useBasketStore((s) => s.addItem);
  const clearBasket = useBasketStore((s) => s.clearBasket);

  const [qty, setQty] = useState(1);
  const [showAllergens, setShowAllergens] = useState(false);
  const stepLabel = category === 'tray' ? 'tray' : 'item';

  const inc = () => setQty((q) => Math.min(99, q + 1));
  const dec = () => setQty((q) => Math.max(1, q - 1));

  const onAdd = () => {
    try {
      addItem(
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: qty,
          unitPricePence: item.pricePence,
          imageUrl: item.imageUrls[0],
        },
        vendor,
      );
      setQty(1);
    } catch (e) {
      if (e instanceof CrossVendorBasketError) {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm('Your basket has items from another vendor. Clear basket and add this item?');
        if (ok) {
          clearBasket();
          // Re-run after clearing — store starts empty so this is safe.
          addItem(
            {
              menuItemId: item.id,
              menuItemName: item.name,
              quantity: qty,
              unitPricePence: item.pricePence,
              imageUrl: item.imageUrls[0],
            },
            vendor,
          );
          setQty(1);
        }
        return;
      }
      throw e;
    }
  };

  const cover = item.imageUrls[0];
  const dietary = item.tags.filter((t) => ['vegan', 'vegetarian', 'gluten-free', 'halal'].includes(t));

  return (
    <article className="flex gap-3 rounded-lg border border-border bg-background p-3">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-md bg-muted" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-1 font-medium text-foreground">{item.name}</h4>
          <span className="shrink-0 text-sm font-semibold">{formatPounds(item.pricePence)}</span>
        </div>

        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {item.servingsCount ? <span>Serves {item.servingsCount}</span> : null}
          {spiceLevel > 0 && (
            <span className="inline-flex items-center text-amber-600" aria-label={`Spice level ${spiceLevel}`}>
              {Array.from({ length: spiceLevel }).map((_, i) => (
                <Flame key={i} className="h-3 w-3 fill-current" aria-hidden />
              ))}
            </span>
          )}
        </div>

        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}

        {dietary.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {dietary.map((d) => (
              <li
                key={d}
                className="inline-flex rounded-full bg-teal-light px-1.5 text-[10px] font-medium uppercase tracking-wide text-teal-dark"
              >
                {d}
              </li>
            ))}
          </ul>
        )}

        {item.allergens.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllergens((v) => !v)}
            className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            aria-expanded={showAllergens}
          >
            {showAllergens ? 'Hide' : 'Show'} allergen info
          </button>
        )}
        {showAllergens && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Contains: {item.allergens.join(', ')}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-md border border-border">
            <button
              type="button"
              aria-label={`Decrease ${stepLabel} quantity`}
              onClick={dec}
              className="px-2 py-1 text-foreground hover:bg-muted"
              disabled={qty <= 1}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-8 text-center text-sm tabular-nums">
              {qty} {qty === 1 ? stepLabel : `${stepLabel}s`}
            </span>
            <button
              type="button"
              aria-label={`Increase ${stepLabel} quantity`}
              onClick={inc}
              className="px-2 py-1 text-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onAdd}
            disabled={!item.isAvailable}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {item.isAvailable ? 'Add' : 'Unavailable'}
          </button>
        </div>
      </div>
    </article>
  );
}
