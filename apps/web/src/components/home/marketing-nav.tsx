'use client';

import { MapPin, ShoppingBasket, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { BasketDrawer } from '@/components/basket/basket-drawer';
import { useBasketStore } from '@/store/basket.store';
import { useStoredPostcode } from '@/lib/postcode';

/**
 * Desktop-first marketing nav for the homepage redesign (2026-05-17
 * wireframe). Replaces the in-app TopNav on `/` only — the TopNav now
 * self-hides on `/` so this nav owns the chrome on the landing page.
 *
 * Layout:
 *   logo · Browse / How it works / Event catering / Become a cook / Help
 *                                       · postcode-pill · user · basket
 *
 * The postcode pill is a soft entry-point: clicking it scrolls to the
 * hero so the user can run the real coverage check. We surface the
 * saved postcode (from localStorage) if one exists so returning users
 * see "Delivering to SE15" instead of a generic prompt.
 */
// "Become a cook" deep-links straight into the vendor portal's
// `/onboarding/register` form (the "Apply to become a partner"
// screen). Going to the portal root used to land prospects on the
// vendor sign-in page, which is a dead end for someone who doesn't
// have an account yet.
const VENDOR_ONBOARDING =
  (process.env.NEXT_PUBLIC_VENDOR_URL ?? 'https://vendor.feastpot.co.uk') +
  '/onboarding/register';

const NAV_LINKS = [
  { label: 'Browse', href: '/vendors' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Event catering', href: '/#what-are-you-ordering-for' },
  { label: 'Become a cook', href: VENDOR_ONBOARDING },
  { label: 'Help', href: '/help' },
] as const;

export function MarketingNav() {
  const [stored] = useStoredPostcode();
  const itemCount = useBasketStore((s) =>
    s.items.reduce((acc, i) => acc + i.quantity, 0),
  );

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
            className="h-9 w-auto"
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
          <a
            href="#hero-headline"
            className="hidden items-center gap-1.5 rounded-full border border-cream-deep bg-cream-warm px-3.5 py-2 text-[13px] font-semibold text-charcoal transition-colors hover:bg-cream sm:inline-flex"
          >
            <MapPin className="h-4 w-4 text-brand" aria-hidden />
            {stored ? (
              <span>
                Delivering to <strong className="font-bold">{stored}</strong>
              </span>
            ) : (
              <span>Set delivery postcode</span>
            )}
          </a>

          <Link
            href="/account"
            aria-label="Account"
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
