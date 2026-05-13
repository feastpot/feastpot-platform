'use client';

import { Home, Search, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@feastpot/ui';

import { useBasketStore } from '@/store/basket.store';

interface NavItem {
  href: string;
  label: string;
  Icon: typeof Home;
  /** Match if the current path equals or starts-with this prefix. */
  match: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Home', Icon: Home, match: (p) => p === '/' },
  { href: '/vendors', label: 'Browse', Icon: Search, match: (p) => p.startsWith('/vendors') },
  { href: '/orders', label: 'Orders', Icon: ShoppingBag, match: (p) => p.startsWith('/orders') },
  { href: '/account', label: 'Account', Icon: User, match: (p) => p.startsWith('/account') },
];

/**
 * Fixed bottom navigation (mobile primary). Driven off `usePathname()` so the
 * active state survives client-side route changes without a re-render hack.
 *
 * The basket count overlays the Orders icon (not a separate slot) because the
 * basket sheet itself lives in TopNav — duplicating the trigger here would be
 * confusing UX. The badge instead surfaces "you have items in flight".
 *
 * Selector reads only the count so this nav doesn't re-render on every basket
 * field change. `paddingBottom: env(safe-area-inset-bottom)` reserves the iOS
 * home-indicator strip without altering the visible nav height.
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const basketCount = useBasketStore((s) => s.items.reduce((acc, i) => acc + i.quantity, 0));

  return (
    <nav
      aria-label="Primary"
      // Warm cream top-border matches the rebrand chrome (top-nav uses
      // the same divider colour). Active states already render in
      // text-brand / bg-brand below — so the nav inherits the new
      // terracotta accents automatically once the palette is in place.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-cream-warm bg-white shadow-sticky"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-4 px-2 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          const isOrders = href === '/orders';
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2 transition-all duration-200',
                  active ? 'text-brand' : 'text-mid hover:text-dark',
                )}
              >
                <span className="relative inline-flex">
                  <Icon
                    className={cn('h-6 w-6 transition-transform duration-200', active && 'scale-110')}
                    strokeWidth={active ? 2.5 : 1.75}
                    aria-hidden
                  />
                  {isOrders && basketCount > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-white animate-fade-up"
                      aria-label={`${basketCount} item${basketCount === 1 ? '' : 's'} in basket`}
                    >
                      {basketCount > 9 ? '9+' : basketCount}
                    </span>
                  )}
                </span>
                <span className={cn('text-[10px] font-medium', active ? 'text-brand' : 'text-mid')}>
                  {label}
                </span>
                {active && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
