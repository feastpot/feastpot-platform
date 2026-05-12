'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * A single line in the basket. Pence-typed monetary fields mirror the API's
 * Prisma schema (we never store currency as a float in the client either).
 *
 * `lineId` is the canonical identity for a line and is derived from
 * (menuItemId, customisationNotes). Two orders of "Jollof rice" — one plain,
 * one "extra spicy" — are TWO lines, so all mutating ops MUST key by lineId
 * (not menuItemId) or they'd accidentally splat both lines.
 */
export interface BasketItem {
  lineId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPricePence: number;
  lineTotalPence: number;
  customisationNotes?: string;
  imageUrl?: string;
  portionLabel?: string;
}

/** Identity of the vendor whose items are currently in the basket. */
export interface BasketVendor {
  id: string;
  name: string;
  slug: string;
}

export interface BasketState {
  items: BasketItem[];
  /** `null` means the basket is empty AND no vendor lock is held. */
  vendor: BasketVendor | null;

  /** Adds a new line OR increments quantity of an existing one (same lineId). */
  addItem(item: Omit<BasketItem, 'lineTotalPence' | 'lineId'>, vendor: BasketVendor): void;
  removeLine(lineId: string): void;
  updateLineQuantity(lineId: string, quantity: number): void;
  /**
   * Edit the customisation notes on an existing line. Because `lineId` is
   * derived from `(menuItemId, customisationNotes)`, changing notes also
   * changes the line's identity:
   *   - if the new lineId collides with another existing line, the two are
   *     merged (quantities summed, old line removed);
   *   - otherwise the line is updated in place with its new lineId + notes.
   */
  updateLineNotes(lineId: string, notes: string): void;
  clearBasket(): void;

  /** Convenience selectors — kept inside the store so consumers don't recompute. */
  getItemCount(): number;
  getSubtotalPence(): number;
}

/**
 * Cross-vendor guard: a customer can only have one vendor's items in the
 * basket at a time (each Order in our schema is single-vendor). Throwing here
 * forces the UI layer to catch + surface a confirm dialog ("Clear basket to
 * order from a different vendor?") rather than silently dropping items.
 */
export class CrossVendorBasketError extends Error {
  constructor() {
    super('Clear basket first to order from a different vendor');
    this.name = 'CrossVendorBasketError';
  }
}

const calcLineTotal = (unitPricePence: number, quantity: number) => unitPricePence * quantity;

/** Stable, deterministic line identity. */
const makeLineId = (menuItemId: string, customisationNotes?: string): string =>
  `${menuItemId}::${customisationNotes ?? ''}`;

const safeStorage = createJSONStorage(() => {
  if (typeof window === 'undefined') {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
  return window.localStorage;
});

export const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      items: [],
      vendor: null,

      addItem(item, vendor) {
        const state = get();
        if (state.vendor && state.vendor.id !== vendor.id && state.items.length > 0) {
          throw new CrossVendorBasketError();
        }

        const lineId = makeLineId(item.menuItemId, item.customisationNotes);
        const existing = state.items.find((i) => i.lineId === lineId);

        if (existing) {
          const newQty = existing.quantity + item.quantity;
          set({
            vendor,
            items: state.items.map((i) =>
              i.lineId === lineId
                ? { ...i, quantity: newQty, lineTotalPence: calcLineTotal(i.unitPricePence, newQty) }
                : i,
            ),
          });
          return;
        }

        set({
          vendor,
          items: [
            ...state.items,
            { ...item, lineId, lineTotalPence: calcLineTotal(item.unitPricePence, item.quantity) },
          ],
        });
      },

      removeLine(lineId) {
        const remaining = get().items.filter((i) => i.lineId !== lineId);
        set({
          items: remaining,
          // Clear vendor lock once the basket is empty so the customer can
          // pick a different vendor without hitting CrossVendorBasketError.
          vendor: remaining.length === 0 ? null : get().vendor,
        });
      },

      updateLineQuantity(lineId, quantity) {
        if (quantity <= 0) {
          get().removeLine(lineId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.lineId === lineId
              ? { ...i, quantity, lineTotalPence: calcLineTotal(i.unitPricePence, quantity) }
              : i,
          ),
        });
      },

      updateLineNotes(lineId, notes) {
        const trimmed = notes.trim();
        const state = get();
        const target = state.items.find((i) => i.lineId === lineId);
        if (!target) return;

        const newNotes = trimmed.length > 0 ? trimmed : undefined;
        const newLineId = makeLineId(target.menuItemId, newNotes);
        if (newLineId === lineId) {
          // Same identity — only the (undefined↔'') normalisation can land
          // here; just persist the cleaned value without any merge work.
          set({
            items: state.items.map((i) =>
              i.lineId === lineId ? { ...i, customisationNotes: newNotes } : i,
            ),
          });
          return;
        }

        const collision = state.items.find((i) => i.lineId === newLineId);
        if (collision) {
          // Merge: sum quantities into the collision line, drop the original.
          const mergedQty = collision.quantity + target.quantity;
          set({
            items: state.items
              .filter((i) => i.lineId !== lineId)
              .map((i) =>
                i.lineId === newLineId
                  ? {
                      ...i,
                      quantity: mergedQty,
                      lineTotalPence: calcLineTotal(i.unitPricePence, mergedQty),
                    }
                  : i,
              ),
          });
          return;
        }

        // No collision: rekey the line with new notes + new lineId.
        set({
          items: state.items.map((i) =>
            i.lineId === lineId
              ? { ...i, lineId: newLineId, customisationNotes: newNotes }
              : i,
          ),
        });
      },

      clearBasket() {
        set({ items: [], vendor: null });
      },

      getItemCount() {
        return get().items.reduce((acc, i) => acc + i.quantity, 0);
      },

      getSubtotalPence() {
        return get().items.reduce((acc, i) => acc + i.lineTotalPence, 0);
      },
    }),
    {
      name: 'feastpot.basket.v1',
      storage: safeStorage,
      partialize: (state) => ({ items: state.items, vendor: state.vendor }),
    },
  ),
);
