'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BenefitsStrip } from '@/components/layout/benefits-strip';
import { LEGAL } from '@/lib/legal-constants';

/**
 * 2026-05-16 wireframe redesign footer.
 *
 * Replaces the previous dark charcoal footer with the wireframe's light
 * variant: a thin BenefitsStrip on top (4 icons + brand promises) followed
 * by a compact legal/links band on warm cream. The vendor recruitment
 * card and ICO + copyright lines are retained — legal requires the latter
 * to be persistently discoverable on every page.
 *
 * Hidden on /checkout and the (auth) routes for the same reasons as
 * before — those screens already have inline legal copy and removing the
 * persistent footer keeps the conversion surface clean.
 */
export function Footer() {
  const pathname = usePathname() ?? '/';
  if (pathname === '/checkout' || pathname.startsWith('/checkout/')) return null;
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) return null;
  if (pathname === '/register' || pathname.startsWith('/register/')) return null;
  if (pathname === '/forgot-password') return null;

  return (
    <footer
      className="mt-8 bg-cream"
      style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom) + 64px)' }}
    >
      <BenefitsStrip />

      <div className="mx-auto max-w-5xl px-4 pt-6">
        {/* Vendor recruitment card — subtle green-tinted panel; this is
            the customer PWA's only outbound link to the vendor portal,
            so the recruitment ask stays visible without overpowering
            the legal copy below. */}
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-light p-4 md:flex-row md:items-center">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-charcoal">
              Cook from home? Join Feastpot
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-charcoal-mid">
              Keep {LEGAL.VENDOR_PAYOUT_PCT}% of every sale. Join a growing network of home cooks.
            </p>
          </div>
          <a
            href="https://vendor.feastpot.co.uk"
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark"
          >
            Join Feastpot
          </a>
        </div>

        {/* Two-column legal/help link grid. */}
        <ul className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          {FOOTER_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block py-0.5 text-[12px] font-medium text-charcoal-mid transition-colors hover:text-charcoal"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-cream-deep pt-4">
          <p className="text-[11px] font-medium text-charcoal-light">
            © 2026 {LEGAL.COMPANY_NAME} · {LEGAL.REGISTERED_IN}
          </p>
          <p className="mt-1 text-[11px] font-medium text-charcoal-light">
            ICO Registration {LEGAL.ICO_NUMBER} ·{' '}
            <a
              href={`mailto:${LEGAL.SUPPORT_EMAIL}`}
              className="hover:text-charcoal-mid"
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
