'use client';

import { Minus, MessageSquarePlus, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Sheet, SheetContent, SheetTrigger } from '@feastpot/ui';

import { useBasketStore, type BasketItem } from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

interface Props {
  /** Trigger element — typically the basket icon in TopNav. */
  children: React.ReactNode;
}

/**
 * Basket drawer. Slide-up on mobile, slide-right on ≥sm.
 *
 * Pricing breakdown:
 *  - Subtotal: from the store (sum of line totals).
 *  - Delivery fee + final total: shown as "calculated at checkout" because
 *    the API's CreateOrderDto computes them server-side using the vendor's
 *    DeliveryConfig. Showing a guess here would create a discrepancy with
 *    the order confirmation, which is far worse than "see total at checkout".
 *  - Discount code: captured here as a UX hint but `dto.discountCode` is
 *    currently a no-op server-side (no DiscountCode model yet). We forward
 *    it via sessionStorage so the checkout page can pass it on.
 */
export function BasketDrawer({ children }: Props) {
  const router = useRouter();
  const items = useBasketStore((s) => s.items);
  const vendor = useBasketStore((s) => s.vendor);
  const subtotal = useBasketStore((s) => s.getSubtotalPence());
  const removeLine = useBasketStore((s) => s.removeLine);
  const updateLineQuantity = useBasketStore((s) => s.updateLineQuantity);
  const updateLineNotes = useBasketStore((s) => s.updateLineNotes);
  const clearBasket = useBasketStore((s) => s.clearBasket);

  const [discount, setDiscount] = useState('');
  const [open, setOpen] = useState(false);

  const onCheckout = () => {
    if (discount.trim()) {
      try {
        sessionStorage.setItem('feastpot.discount.v1', discount.trim());
      } catch {
        /* private mode — ignore */
      }
    }
    setOpen(false);
    router.push('/checkout');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col p-0 sm:max-w-md max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[85vh] max-sm:max-w-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0"
      >
        <header className="flex items-center justify-between border-b border-cream-deep px-4 py-3">
          <h2 className="font-display text-lg font-black tracking-tight text-charcoal">
            Your basket
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close basket"
            className="rounded-full p-1 text-charcoal hover:bg-cream"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {items.length === 0 || !vendor ? (
          <EmptyState onClose={() => setOpen(false)} />
        ) : (
          <>
            {/* Vendor header */}
            <Link
              href={`/vendors/${vendor.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-cream-deep bg-cream px-4 py-3 text-sm hover:bg-cream-warm"
            >
              <span className="text-charcoal-mid">
                Ordering from <strong className="font-bold text-charcoal">{vendor.name}</strong>
              </span>
              <span className="text-xs font-bold text-brand">View vendor →</span>
            </Link>

            {/* Items */}
            <ul className="flex-1 divide-y divide-cream-deep overflow-y-auto">
              {items.map((item) => (
                <BasketLine
                  key={item.lineId}
                  item={item}
                  onRemove={() => removeLine(item.lineId)}
                  onQty={(q) => updateLineQuantity(item.lineId, q)}
                  onNotes={(notes) => updateLineNotes(item.lineId, notes)}
                />
              ))}
            </ul>

            {/* Totals + checkout */}
            <footer className="space-y-3 border-t border-cream-deep bg-cream/50 px-4 py-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-charcoal-mid">Subtotal</span>
                  <span className="font-bold text-charcoal">{formatPounds(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal-mid">Delivery</span>
                  <span className="text-xs italic text-charcoal-mid">Calculated at checkout</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="discount"
                  className="mb-1 block text-xs font-bold uppercase tracking-wide text-charcoal-mid"
                >
                  Discount code
                </label>
                <input
                  id="discount"
                  type="text"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-cream-deep bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-mid focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between border-t border-cream-deep pt-3 text-base">
                <span className="font-display font-black text-charcoal">Total</span>
                <span className="font-display font-black tabular-nums text-charcoal">
                  {formatPounds(subtotal)}
                  <span className="ml-1 text-xs font-medium text-charcoal-mid">+ delivery</span>
                </span>
              </div>

              <button
                type="button"
                onClick={onCheckout}
                className="w-full rounded-2xl bg-brand py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
              >
                Proceed to checkout →
              </button>
              <button
                type="button"
                onClick={() => clearBasket()}
                className="w-full text-center text-xs font-medium text-charcoal-mid underline-offset-2 hover:underline"
              >
                Empty basket
              </button>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * One line in the drawer. Lifts the per-line edit state into its own
 * component so the parent doesn't re-render every line when one note is
 * being typed. The "Add note" / "Edit" affordance opens an inline textarea
 * that commits via `onNotes` on Save (or Enter). Saving may merge this
 * line with another (if the new notes match an existing line's notes for
 * the same menu item) — that's handled by the store's `updateLineNotes`.
 */
function BasketLine({
  item,
  onRemove,
  onQty,
  onNotes,
}: {
  item: BasketItem;
  onRemove: () => void;
  onQty: (quantity: number) => void;
  onNotes: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.customisationNotes ?? '');

  const open = () => {
    setDraft(item.customisationNotes ?? '');
    setEditing(true);
  };
  const save = () => {
    onNotes(draft);
    setEditing(false);
  };

  return (
    <li className="flex gap-3 px-4 py-3">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-xl bg-cream" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-bold text-charcoal">{item.menuItemName}</h3>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.menuItemName}`}
            className="text-charcoal-mid hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {item.portionLabel && (
          <p className="text-xs font-medium text-charcoal-mid">{item.portionLabel}</p>
        )}

        {item.customisationNotes && !editing && (
          <p className="mt-0.5 text-xs italic text-charcoal-mid">
            &ldquo;{item.customisationNotes}&rdquo;
          </p>
        )}

        {editing ? (
          <div className="mt-1.5 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter saves; Shift+Enter inserts a newline. Notes are
                // typically a single short phrase ("extra spicy"), so this
                // matches the chat-style mobile expectation set by the
                // accompanying Save button.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="e.g. extra spicy, no peppers"
              rows={2}
              maxLength={140}
              autoFocus
              className="w-full rounded-xl border border-cream-deep bg-white px-2 py-1.5 text-xs text-charcoal placeholder:text-charcoal-mid focus:border-brand focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                className="rounded-xl bg-brand px-3 py-1 text-xs font-bold text-white hover:bg-brand-dark"
              >
                Save note
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs font-medium text-charcoal-mid underline-offset-2 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={open}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:text-brand-dark"
          >
            <MessageSquarePlus className="h-3 w-3" aria-hidden />
            {item.customisationNotes ? 'Edit note' : 'Add note'}
          </button>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="inline-flex items-center rounded-full border border-cream-deep bg-white">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQty(item.quantity - 1)}
              className="px-2 py-1 text-charcoal hover:bg-cream"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-7 text-center text-sm font-bold tabular-nums text-charcoal">
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQty(item.quantity + 1)}
              className="px-2 py-1 text-charcoal hover:bg-cream"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="font-display text-sm font-black tabular-nums text-charcoal">
            {formatPounds(item.lineTotalPence)}
          </span>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream">
        <ShoppingBasket className="h-8 w-8 text-brand" aria-hidden />
      </span>
      <h3 className="font-display text-lg font-black text-charcoal">Your basket is empty</h3>
      <p className="text-sm font-medium text-charcoal-mid">
        Find a local cook to get started.
      </p>
      <Link
        href="/vendors"
        onClick={onClose}
        className="mt-2 rounded-2xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-card hover:bg-brand-dark"
      >
        Browse vendors
      </Link>
    </div>
  );
}
