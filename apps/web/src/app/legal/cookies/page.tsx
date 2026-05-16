import type { Metadata } from 'next';

import {
  LegalBadge,
  LegalContact,
  LegalContentWrapper,
  LegalHero,
  LegalPageShell,
  LegalQuickNav,
  LegalSection,
  LegalTrustStrip,
} from '@/components/legal/legal-shell';
import { LEGAL } from '@/lib/legal-constants';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Feastpot uses strictly necessary cookies only, no advertising, no tracking, no third-party analytics.',
  alternates: { canonical: '/legal/cookies' },
};

const ICO_NUMBER = LEGAL.ICO_NUMBER;

const QUICK_NAV = [
  { label: 'What are cookies', href: '#what' },
  { label: 'Cookies we use', href: '#use' },
  { label: 'What we never use', href: '#never' },
  { label: 'Your choices', href: '#choices' },
  { label: 'Contact', href: '#contact' },
];

const COOKIES = [
  {
    name: 'sb-access-token',
    purpose: 'Supabase authentication JWT',
    duration: '1 hour',
  },
  {
    name: 'sb-refresh-token',
    purpose: 'Supabase session refresh',
    duration: '30 days',
  },
  {
    name: 'feastpot.basket.v1',
    purpose: 'Basket persistence (localStorage, not a cookie)',
    duration: 'Session',
  },
] as const;

export default function CookiesPage() {
  return (
    <LegalPageShell>
      <LegalHero
        title="Cookie Policy"
        lede={
          <>
            Strictly necessary cookies only. No advertising. No tracking. No third-party
            analytics. None. Ever.
          </>
        }
        badge={
          <LegalBadge
            tone="brand"
            icon="🍪"
            title="3 strictly necessary items"
            body={<>Authentication &middot; session refresh &middot; basket persistence</>}
          />
        }
        footnote={
          <>
            Last updated: May 2026 &middot; PECR &amp; UK GDPR compliant
          </>
        }
      />

      <LegalQuickNav ariaLabel="Cookie policy sections" items={QUICK_NAV} />

      <LegalContentWrapper>
        <LegalSection id="what" icon="❓" title="1. What are cookies?">
          <p>
            Cookies are small text files that a website stores on your device to remember things
            like whether you&rsquo;re signed in. Some sites also use them to track you across the
            web, Feastpot does not.
          </p>
        </LegalSection>

        <LegalSection id="use" icon="🍪" title="2. Cookies we use">
          <p>Feastpot uses strictly necessary storage only:</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {COOKIES.map((c) => (
              <div
                key={c.name}
                className="rounded-2xl border border-cream-deep bg-cream-warm p-3"
              >
                <p className="mb-1.5 break-all font-mono text-xs font-black text-charcoal">
                  {c.name}
                </p>
                <p className="mb-1.5 text-xs leading-snug text-charcoal-mid">
                  {c.purpose}
                </p>
                <p className="mb-1 text-[11px] font-black text-brand">
                  {c.duration}
                </p>
                <span className="inline-block rounded-md bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand-dark">
                  Strictly necessary
                </span>
              </div>
            ))}
          </div>
        </LegalSection>

        <LegalSection id="never" icon="🚫" title="3. Cookies we do not use">
          <p>
            We do <strong>not</strong> use advertising cookies, tracking pixels, third-party
            analytics cookies, Google Analytics, the Facebook Pixel, or anything similar. None.
            Ever.
          </p>
        </LegalSection>

        <LegalSection id="choices" icon="⚙️" title="4. Your choices">
          <p>
            You can clear cookies via your browser settings, this will sign you out.
            Because we don&rsquo;t use any non-essential cookies, there is nothing to opt out of.
          </p>
        </LegalSection>

        <LegalContact
          number="5"
          title="Contact"
          email="privacy@feastpot.co.uk"
          subject="Cookie enquiry"
          body={
            <>
              Subject line: &ldquo;Cookie enquiry&rdquo;.
              <br />
              We aim to respond within 5 business days.
            </>
          }
          meta={
            <span className="text-[11px] font-medium text-white/70">
              ICO Registration: {ICO_NUMBER}
            </span>
          }
        />

        <LegalTrustStrip />
      </LegalContentWrapper>
    </LegalPageShell>
  );
}
