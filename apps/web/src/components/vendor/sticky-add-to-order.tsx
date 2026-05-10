'use client';

import { ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useBasketStore } from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Sticky bar that appears once the user has scrolled past the vendor hero
 * and has at least one item in the basket. We compute visibility via a
 * scroll listener (rAF-throttled) so it doesn't fire on every paint.
 *
 * Renders nothing when basket is empty for this vendor (or for any vendor at
 * all) — the bottom navigation already exposes the basket route.
 */
export function StickyAddToOrder({ vendorId }: { vendorId: string }) {
  const itemCount = useBasketStore((s) => s.items.reduce((acc, i) => acc + i.quantity, 0));
  const subtotal = useBasketStore((s) => s.getSubtotalPence());
  const basketVendorId = useBasketStore((s) => s.vendor?.id ?? null);
  const [showAfterScroll, setShowAfterScroll] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setShowAfterScroll(window.scrollY > 220);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!showAfterScroll || itemCount === 0 || basketVendorId !== vendorId) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-lg px-4">
      {/* The basket itself is a drawer triggered from TopNav; "Checkout" is
          the natural CTA once the customer has scrolled past the menu. */}
      <Link
        href="/checkout"
        className="flex items-center justify-between rounded-full bg-brand px-5 py-3 text-white shadow-lg hover:bg-brand-dark"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <ShoppingBasket className="h-4 w-4" aria-hidden />
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
        <span className="text-sm font-semibold">{formatPounds(subtotal)} • Checkout</span>
      </Link>
    </div>
  );
}
