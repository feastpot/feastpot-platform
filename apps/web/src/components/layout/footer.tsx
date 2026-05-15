'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LEGAL } from '@/lib/legal-constants';

/**
 * Site footer. Currently the only place from which a customer can
 * reach Privacy / Terms / Cookies / Allergen / Vendor T&Cs without
 * URL-guessing — the legal team requires those links to be
 * persistently discoverable, and ICO guidance also expects a visible
 * data-controller note (the "ICO Registration {LEGAL.ICO_NUMBER}" line below).
 *
 * Hidden on /checkout and the (auth) routes because:
 *  - Checkout has its own legal acceptance copy beside the pay button
 *    and an extra footer doubles the legal noise.
 *  - The auth pages are intentionally minimal so the form stays the
 *    primary affordance.
 *
 * The vendor-recruitment card at the top is the customer PWA's only
 * outbound link to vendor.feastpot.co.uk — without it the vendor
 * funnel relies entirely on direct traffic.
 */
export function Footer() {
  const pathname = usePathname() ?? '/';
  if (pathname === '/checkout' || pathname.startsWith('/checkout/')) return null;
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) return null;
  if (pathname === '/register' || pathname.startsWith('/register/')) return null;
  if (pathname === '/forgot-password') return null;

  return (
    <footer
      className="bg-dark px-4 pt-5 mt-6"
      // env() for the iOS home-indicator strip — without this the
      // copyright line collapses behind the bottom-nav's safe-area
      // on notched devices.
      style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom) + 64px)' }}
    >
      <div className="mx-auto max-w-[640px]">
        {/* Vendor recruitment card. Subtle brand-tinted panel rather
            than a full-bleed CTA so it doesn't compete with the
            customer flow above it. */}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/15 p-3.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white">
              Cook from home? Join Feastpot
            </p>
            <p className="mt-0.5 text-[11px] text-white/50">
              Keep {LEGAL.VENDOR_PAYOUT_PCT}% of every sale. Join a growing network of home cooks.
            </p>
          </div>
          <a
            href="https://vendor.feastpot.co.uk"
            className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Join →
          </a>
        </div>

        {/* Two-column links grid. Help link sits first so it's
            findable for older users who treat the footer as a
            help-desk locator. */}
        <ul className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {FOOTER_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block py-0.5 text-[12px] text-white/45 transition-colors hover:text-white/80"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Copyright + ICO line. Year is hard-coded — feastpot.co.uk
            is a fresh trading entity so we don't need a from-year
            range yet. Bump in Jan. */}
        <div className="border-t border-white/10 pt-3">
          <p className="text-[10px] text-white/25">
            © 2026 {LEGAL.COMPANY_NAME} · {LEGAL.REGISTERED_IN}
          </p>
          <p className="mt-0.5 text-[10px] text-white/20">
            ICO Registration {LEGAL.ICO_NUMBER} ·{' '}
            <a
              href={`mailto:${LEGAL.SUPPORT_EMAIL}`}
              className="hover:text-white/40"
            >
              {LEGAL.SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: 'Help & FAQ', href: '/help' },
  { label: 'Privacy Policy', href: '/legal/privacy' },
  { label: 'Terms of Service', href: '/legal/terms' },
  { label: 'Cookie Policy', href: '/legal/cookies' },
  { label: 'Allergen info', href: '/legal/allergens' },
  { label: 'Vendor Terms', href: '/legal/vendor-terms' },
];
