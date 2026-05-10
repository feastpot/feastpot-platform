'use client';

import { Minus, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Sheet, SheetContent, SheetTrigger } from '@feastpot/ui';

import { useBasketStore } from '@/store/basket.store';

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
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight">Your basket</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close basket"
            className="rounded-full p-1 text-foreground hover:bg-muted"
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
              className="flex items-center justify-between border-b border-border px-4 py-3 text-sm hover:bg-muted/50"
            >
              <span>
                Ordering from <strong className="font-semibold">{vendor.name}</strong>
              </span>
              <span className="text-xs text-brand">View vendor</span>
            </Link>

            {/* Items */}
            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {items.map((item) => (
                <li key={item.lineId} className="flex gap-3 px-4 py-3">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-md bg-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-1 text-sm font-medium">{item.menuItemName}</h3>
                      <button
                        type="button"
                        onClick={() => removeLine(item.lineId)}
                        aria-label={`Remove ${item.menuItemName}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {item.portionLabel && (
                      <p className="text-xs text-muted-foreground">{item.portionLabel}</p>
                    )}
                    {item.customisationNotes && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">
                        &ldquo;{item.customisationNotes}&rdquo;
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => updateLineQuantity(item.lineId, item.quantity - 1)}
                          className="px-2 py-1 hover:bg-muted"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-7 text-center text-sm tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => updateLineQuantity(item.lineId, item.quantity + 1)}
                          className="px-2 py-1 hover:bg-muted"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">{formatPounds(item.lineTotalPence)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Totals + checkout */}
            <footer className="space-y-3 border-t border-border px-4 py-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatPounds(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-xs italic text-muted-foreground">Calculated at checkout</span>
                </div>
              </div>

              <div>
                <label htmlFor="discount" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Discount code
                </label>
                <input
                  id="discount"
                  type="text"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-base">
                <span className="font-semibold">Total</span>
                <span className="font-semibold">
                  {formatPounds(subtotal)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">+ delivery</span>
                </span>
              </div>

              <button
                type="button"
                onClick={onCheckout}
                className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Proceed to checkout
              </button>
              <button
                type="button"
                onClick={() => clearBasket()}
                className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
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

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <ShoppingBasket className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h3 className="text-lg font-semibold">Your basket is empty</h3>
      <p className="text-sm text-muted-foreground">Find a local cook to get started.</p>
      <Link
        href="/vendors"
        onClick={onClose}
        className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Browse vendors
      </Link>
    </div>
  );
}
