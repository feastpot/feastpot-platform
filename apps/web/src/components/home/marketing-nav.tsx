'use client';

import { ShoppingBasket, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { BasketDrawer } from '@/components/basket/basket-drawer';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { useBasketStore } from '@/store/basket.store';

/**
 * Desktop-first marketing nav for the homepage redesign (2026-05-17
 * wireframe). Replaces the in-app TopNav on `/` only - the TopNav now
 * self-hides on `/` so this nav owns the chrome on the landing page.
 *
 * Layout:
 *   logo · Browse / How it works / Event catering / Become a cook / Help
 *                                                      · user · basket
 */
// "Become a cook" deep-links to the public acquisition page on the
// customer site. The vendor portal URL is never exposed from public
// chrome - prospective cooks land on /become-a-vendor, submit the
// interest form there, and only receive a portal link in the approval
// email after admin review.
const NAV_LINKS = [
  { label: 'Browse', href: '/vendors' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Event catering', href: '/#what-are-you-ordering-for' },
  { label: 'Become a cook', href: '/become-a-vendor' },
  { label: 'Help', href: '/help' },
] as const;

export function MarketingNav() {
  const itemCount = useBasketStore((s) =>
    s.items.reduce((acc, i) => acc + i.quantity, 0),
  );
  // Guests get sent straight to `/sign-in` instead of the `/account`
  // guest hub - the hub itself is just a benefits welcome with another
  // big "Sign in" button, so reusing it here makes the flow feel like
  // two sign-in pages in a row. Loading state keeps `/account` so we
  // don't flicker the wrong destination at a returning signed-in user.
  const { token, loading: authLoading } = useAccessToken();
  const accountHref = !authLoading && !token ? '/sign-in' : '/account';

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 border-b border-cream-deep bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Feastpot home"
          className="flex shrink-0 items-center"
        >
          <Image
            src="/images/feastpot-logo.png"
            alt="Feastpot"
            width={317}
            height={100}
            className="h-[3.375rem] w-auto"
            priority
          />
        </Link>

        <ul className="ml-6 hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-[14px] font-semibold text-charcoal transition-colors hover:text-brand"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href={accountHref}
            aria-label={accountHref === '/sign-in' ? 'Sign in' : 'Account'}
            className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal hover:bg-cream-warm hover:text-brand"
          >
            <User className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </Link>

          <BasketDrawer>
            <button
              type="button"
              aria-label={`Basket (${itemCount} item${itemCount === 1 ? '' : 's'})`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-charcoal hover:bg-cream-warm hover:text-brand"
            >
              <ShoppingBasket className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              {itemCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-scotch px-1 text-[10px] font-bold leading-none text-white"
                  aria-hidden
                >
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </BasketDrawer>
        </div>
      </div>
    </nav>
  );
}
