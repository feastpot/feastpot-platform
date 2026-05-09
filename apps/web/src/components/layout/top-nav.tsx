'use client';

import { ShoppingBasket } from 'lucide-react';
import Link from 'next/link';

import { useBasketStore } from '@/store/basket.store';

/**
 * Sticky top nav: brand left, basket button right with item-count badge.
 *
 * Reads the basket count via a narrow selector so the entire component doesn't
 * re-render on every basket field change — only when the count actually moves.
 */
export function TopNav() {
  const itemCount = useBasketStore((s) => s.items.reduce((acc, i) => acc + i.quantity, 0));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand text-white">
            <span className="text-sm font-bold">F</span>
          </span>
          <span className="text-lg tracking-tight">Feastpot</span>
        </Link>

        <Link
          href="/basket"
          aria-label={`Basket (${itemCount} item${itemCount === 1 ? '' : 's'})`}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
        >
          <ShoppingBasket className="h-5 w-5" aria-hidden />
          {itemCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white"
              aria-hidden
            >
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
