'use client';

import { Bell, ChevronLeft, ShoppingBasket } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { BasketDrawer } from '@/components/basket/basket-drawer';
import { useBasketStore } from '@/store/basket.store';

/**
 * Resolve an explicit back destination for the TopNav back button.
 *
 * We avoid `router.back()` as the primary path because users who land
 * deep-linked from Google or a shared SMS have no history entry — the
 * browser would either no-op or kick them off the site. Returning a
 * concrete URL guarantees the back affordance always works, and the
 * caller can still fall through to `router.back()` for cases where the
 * in-context history is the right destination (e.g. checkout, where
 * the previous vendor page is the natural return).
 *
 * Order matters — more specific paths must come before their parents.
 */
function resolveBackPath(
  pathname: string,
): { href: string } | { history: true; fallback: string } {
  // Order/account sub-pages return to the relevant list, not the root.
  if (pathname.startsWith('/orders/') && /\/(tracking|review|confirmation)$/.test(pathname)) {
    return { href: '/account/orders' };
  }
  if (pathname.startsWith('/orders/')) return { href: '/account/orders' };
  // Checkout — natural back is the vendor page the basket was built on,
  // so we let the browser history walk one step back. Fallback to
  // /vendors when the user has no history (deep link from a saved
  // checkout URL, push notification, etc.) so the button never no-ops.
  if (pathname === '/checkout') return { history: true, fallback: '/vendors' };
  // Vendor profile → search list.
  if (pathname.startsWith('/vendors/') && pathname !== '/vendors') {
    return { href: '/vendors' };
  }
  // Nested events / help / legal pages return to their index, not /.
  if (pathname.startsWith('/events/') && pathname !== '/events') return { href: '/events' };
  if (pathname.startsWith('/help/') && pathname !== '/help') return { href: '/help' };
  if (pathname.startsWith('/legal/') && pathname !== '/legal') return { href: '/legal' };
  // /account/* → /account (but /account itself goes home via the
  // catch-all below).
  if (pathname.startsWith('/account/')) return { href: '/account' };
  // Catch-all for top-level inner pages (/vendors, /events, /account,
  // /legal, /help, /offline) — back goes home.
  return { href: '/' };
}

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
  const router = useRouter();
  const itemCount = useBasketStore((s) => s.items.reduce((acc, i) => acc + i.quantity, 0));

  const isHome = pathname === '/';
  const title = isHome
    ? ''
    : (PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
      fallbackTitleFromPath(pathname) ??
      '');

  const handleBack = () => {
    const target = resolveBackPath(pathname);
    if ('history' in target) {
      // window.history.length === 1 means the current entry is the
      // first in this tab — router.back() would be a no-op. Route to
      // the fallback so the button always advances the user somewhere
      // sensible. (length includes the current entry, hence <= 1.)
      if (typeof window !== 'undefined' && window.history.length <= 1) {
        router.push(target.fallback);
      } else {
        router.back();
      }
    } else {
      router.push(target.href);
    }
  };

  return (
    <header
      // Warm cream border (not cold gray) keeps the chrome consistent
      // with the new logo-DNA palette. Solid white background reads
      // crisper against the page's cream body than the translucent
      // version we used previously.
      className="fixed inset-x-0 top-0 z-50 border-b border-cream-warm bg-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(var(--top-nav-height) + env(safe-area-inset-top))',
      }}
    >
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        {isHome ? (
          <Link
            href="/"
            aria-label="Feastpot home"
            // -mx-1 px-1 grows the hit area horizontally, min-h-11 (44px)
            // brings the touch target up to the WCAG 2.2 / Apple HIG mobile
            // minimum without enlarging the visible logo. -my-1 keeps the
            // expanded zone from pushing the header taller.
            className="-mx-1 -my-1 flex min-h-11 items-center px-1 py-1"
          >
            {/* Full Pan-African brand lockup (pot + coloured "feastpot"
                wordmark) shipped as a single PNG. Source asset is now
                whitespace-trimmed (was 1448×1086 with ~40% padding,
                which collapsed the visible logo to ~18px tall at h-8).
                With trimmed art we can size the rendered logo to a
                modern PWA chrome standard: 40px tall (h-10) inside a
                56px (h-14) header — ~71% fill, the ratio used by Uber
                Eats / Deliveroo / Just Eat. Width is intrinsic. */}
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={200}
              height={50}
              priority
              className="h-10 w-auto"
            />
          </Link>
        ) : (
          // Inner-page header: back chevron + truncating H1. The back
          // button is critical for the 30–55yo Android demographic that
          // is less likely to use swipe-back gestures, and for users who
          // landed deep-linked from Google or a shared SMS (no history).
          // -ml-2 nudges the chevron flush with the page edge so it
          // sits in the natural left-thumb zone; min-w-0 + flex-1 lets
          // the title truncate instead of pushing the basket off-screen.
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dark transition-colors hover:bg-surface"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
            <h1 className="truncate text-[17px] font-semibold text-dark">{title}</h1>
          </div>
        )}

        <div className="flex items-center gap-1">
          {/* Bell + basket bumped to 44×44 (h-11 w-11) so the entire
              top-bar control row meets WCAG 2.5.5 / Apple HIG mobile
              minimums. Icon size unchanged — just the hit area grows. */}
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-11 w-11 items-center justify-center rounded-full text-mid transition-colors hover:bg-surface hover:text-dark"
          >
            <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>

          <BasketDrawer>
            <button
              type="button"
              aria-label={`Basket (${itemCount} item${itemCount === 1 ? '' : 's'})`}
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-mid transition-colors hover:bg-surface hover:text-dark"
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
