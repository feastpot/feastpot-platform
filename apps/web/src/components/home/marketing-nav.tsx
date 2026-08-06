'use client';

import { Menu, ShoppingBasket, User, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BasketDrawer } from '@/components/basket/basket-drawer';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { useBasketStore } from '@/store/basket.store';

const NAV_LINKS = [
  { label: 'Order food', href: '/vendors' },
  { label: 'Occasions', href: '/#occasions' },
  { label: 'Catering', href: '/catering' },
  { label: 'Become a vendor', href: '/become-a-vendor' },
] as const;

export function MarketingNav() {
  const itemCount = useBasketStore((s) => s.items.reduce((acc, i) => acc + i.quantity, 0));
  const { token, loading: authLoading } = useAccessToken();
  const accountHref = !authLoading && !token ? '/sign-in' : '/account';
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close on escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [mobileOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 border-b border-cream-deep bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Feastpot home" className="flex shrink-0 items-center">
          <Image
            src="/images/feastpot-logo.png"
            alt="Feastpot"
            width={317}
            height={100}
            className="h-[3.375rem] w-auto"
            priority
          />
        </Link>

        {/* Desktop links */}
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

          {/* Hamburger – mobile only */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-menu"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal hover:bg-cream-warm hover:text-brand lg:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-[4.25rem] z-40 bg-charcoal/20 lg:hidden"
            aria-hidden
            onClick={() => setMobileOpen(false)}
          />
          <ul
            id="mobile-nav-menu"
            className="absolute left-0 right-0 z-50 border-b border-cream-deep bg-white px-4 pb-4 pt-2 shadow-lg lg:hidden"
          >
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center rounded-xl px-3 py-3 text-[15px] font-semibold text-charcoal transition-colors hover:bg-cream-warm hover:text-brand"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
