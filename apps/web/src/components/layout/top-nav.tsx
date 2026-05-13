'use client';

import { Bell, ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BasketDrawer } from '@/components/basket/basket-drawer';
import { useBasketStore } from '@/store/basket.store';

/**
 * Page titles mapped to route prefixes. The empty string for `/` means "show
 * the wordmark instead of a title" — homepage gets the brand, inner pages get
 * a contextual H1. Order matters: `/orders` must precede `/` in the lookup
 * loop so it's matched before the catch-all root.
 */
const PAGE_TITLES: Array<readonly [prefix: string, title: string]> = [
  ['/checkout', 'Checkout'],
  ['/vendors', 'Browse'],
  ['/orders', 'Your Orders'],
  ['/account', 'Account'],
  ['/events', 'Events'],
  ['/legal', 'Legal'],
  ['/offline', 'Offline'],
  ['/help', 'Help'],
];

/**
 * Derive a fallback title from the first path segment when no explicit mapping
 * matches — e.g. `/cuisines/jollof` → "Cuisines". Title-cases the segment so
 * we never render an empty `<h1>` on inner pages. Returns null only for routes
 * we genuinely can't infer (e.g. `/`).
 */
function fallbackTitleFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
}

/**
 * Fixed top nav: brand wordmark on home, page title on inner routes;
 * notifications bell + basket-drawer trigger on the right.
 *
 * `BasketDrawer` is invoked with a button child because it uses a Radix Sheet
 * with `<SheetTrigger asChild>` internally — passing a self-closing element
 * would cause Radix to render its default (invisible) trigger and the basket
 * icon would never open the sheet. Selector reads only the count so the whole
 * nav doesn't re-render on every basket field change.
 *
 * `position: fixed` (not sticky) because the inner-page H1 lives here, not in
 * page content — keeping it pinned avoids it scrolling out of view. Layout's
 * `<main className="page-content">` reserves the chrome's height via the
 * `--top-nav-height` and `--bottom-nav-height` CSS vars.
 */
export function TopNav() {
  const pathname = usePathname() ?? '/';
  const itemCount = useBasketStore((s) => s.items.reduce((acc, i) => acc + i.quantity, 0));

  const isHome = pathname === '/';
  const title = isHome
    ? ''
    : (PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
      fallbackTitleFromPath(pathname) ??
      '');

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        {isHome ? (
          <Link href="/" aria-label="Feastpot home" className="flex items-baseline gap-0.5">
            <span className="text-2xl font-black tracking-tight text-brand">feast</span>
            <span className="text-2xl font-black tracking-tight text-dark">pot</span>
          </Link>
        ) : (
          <h1 className="truncate text-[17px] font-semibold text-dark">{title}</h1>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-10 w-10 items-center justify-center rounded-full text-mid transition-colors hover:bg-surface hover:text-dark"
          >
            <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>

          <BasketDrawer>
            <button
              type="button"
              aria-label={`Basket (${itemCount} item${itemCount === 1 ? '' : 's'})`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-mid transition-colors hover:bg-surface hover:text-dark"
            >
              <ShoppingBasket className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              {itemCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white animate-fade-up"
                  aria-hidden
                >
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </BasketDrawer>
        </div>
      </div>
    </header>
  );
}
