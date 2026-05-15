import type { Metadata } from 'next';

import {
  LegalContact,
  LegalContentWrapper,
  LegalHero,
  LegalPageShell,
  LegalQuickNav,
  LegalSection,
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              background: 'rgba(61,122,71,0.25)',
              border: '1px solid rgba(61,122,71,0.45)',
              borderRadius: '12px',
            }}
          >
            <span style={{ fontSize: '28px', flexShrink: 0 }} aria-hidden>
              🍪
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '13px',
                  margin: '0 0 2px',
                }}
              >
                3 strictly necessary items
              </p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px', margin: 0 }}>
                Authentication &middot; session refresh &middot; basket persistence
              </p>
            </div>
          </div>
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
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#FBF6EF',
                  border: '1px solid #EDE4D4',
                }}
              >
                <p
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1C1C1A',
                    margin: '0 0 6px',
                    wordBreak: 'break-all',
                  }}
                >
                  {c.name}
                </p>
                <p style={{ fontSize: '12px', color: '#5F5E5A', margin: '0 0 6px', lineHeight: 1.5 }}>
                  {c.purpose}
                </p>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#E8520A',
                    margin: '0 0 4px',
                  }}
                >
                  {c.duration}
                </p>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#E8F5EB',
                    color: '#3D7A47',
                  }}
                >
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
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
              ICO Registration: {ICO_NUMBER}
            </span>
          }
        />
      </LegalContentWrapper>
    </LegalPageShell>
  );
}
