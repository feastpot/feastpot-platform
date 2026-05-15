import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { LEGAL } from '@/lib/legal-constants';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Feastpot collects, uses and protects your personal data under the UK GDPR, the Data Protection Act 2018, and the Data (Use and Access) Act 2025.',
  alternates: { canonical: '/legal/privacy' },
};

const ICO_NUMBER = LEGAL.ICO_NUMBER;

/**
 * Privacy policy, brand-DNA refresh.
 *
 * Wrapping `legal/layout.tsx` already gives us a max-w-6xl shell with
 * px-4, a breadcrumb, a sidebar of legal pages, and a "last updated"
 * footer. So this page deliberately:
 *   - skips its own breadcrumb (the layout already shows one);
 *   - bleeds the hero edge-to-edge inside the main column with -mx-4 +
 *     md:-mx-0 (mobile only, on desktop the sidebar takes the left
 *     gutter and a full-bleed hero would look truncated);
 *   - keeps EVERY word of the existing UK GDPR copy verbatim, only the
 *     presentation changes (cards instead of a table, cards instead of
 *     a numbered list, branded contact CTA in place of the plain
 *     paragraph).
 */
export default function PrivacyPage() {
  return (
    <div className="-mx-4 md:mx-0">
      {/* HERO, dark branded header (replaces the plain h1 + ICO chip) */}
      <div
        style={{
          background: 'linear-gradient(160deg, #1C1C1A 0%, #3D1A0A 100%)',
          padding: '28px 20px 24px',
          borderRadius: 0,
        }}
        className="md:rounded-2xl"
      >
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h1
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontWeight: 800,
              fontSize: '28px',
              color: 'white',
              marginBottom: '8px',
              letterSpacing: '-0.5px',
            }}
          >
            Your Privacy
          </h1>

          <p
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: '18px',
            }}
          >
            We built Feastpot for your community. We handle your data with the same care
            you&rsquo;d expect from a trusted neighbour, not a faceless corporation.
          </p>

          {/* ICO Registration, prominent trust badge */}
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
              🛡️
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
                ICO Registered Data Controller
              </p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px', margin: 0 }}>
                Registration Reference:{' '}
                <span
                  style={{ fontFamily: 'monospace', fontWeight: 700, color: 'white' }}
                >
                  {ICO_NUMBER}
                </span>
              </p>
              <p
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '10px',
                  margin: '2px 0 0',
                }}
              >
                Registered with the Information Commissioner&rsquo;s Office &middot; England &amp; Wales
              </p>
            </div>
            <a
              href={LEGAL.ICO_VERIFY_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: '10px',
                textDecoration: 'underline',
                flexShrink: 0,
              }}
            >
              Verify ↗
            </a>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '12px' }}>
            Last updated: May 2026 &middot; UK GDPR, Data Protection Act 2018, Data (Use and Access) Act 2025
          </p>
        </div>
      </div>

      {/* Kente strip bookends the hero with a touch of brand pattern. */}
      <div className="kente-divider" aria-hidden />

      {/* STICKY QUICK-NAV, anchors to the most-asked sections only.
          `top: 56px` clears the global topnav. Pills are warm-cream by
          default and flip to brand on hover via inline handlers (the
          page is a Server Component so we keep the pills as plain
          anchors and animate via CSS pseudo-states below). */}
      <nav
        aria-label="Privacy policy sections"
        style={{
          position: 'sticky',
          top: '56px',
          zIndex: 20,
          background: 'rgba(251,246,239,0.96)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #EDE4D4',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '8px 12px',
            whiteSpace: 'nowrap',
            maxWidth: '640px',
            margin: '0 auto',
          }}
        >
          {[
            { label: 'What we collect', href: '#collect' },
            { label: 'How we use it', href: '#use' },
            { label: 'Who we share with', href: '#share' },
            { label: 'Retention', href: '#retention' },
            { label: 'Your rights', href: '#rights' },
            { label: 'Cookies', href: '#cookies' },
            { label: 'Contact', href: '#contact' },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="privacy-quicknav-pill"
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '5px 10px',
                borderRadius: '20px',
                color: '#5F5E5A',
                textDecoration: 'none',
                border: '1px solid #EDE4D4',
                transition: 'background-color .15s, color .15s, border-color .15s',
              }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Hover styling for the quick-nav pills. Inline <style> keeps the
          rule co-located with the markup so a future move/refactor of
          the section can't leave orphan CSS behind. */}
      <style>{`
        .privacy-quicknav-pill:hover,
        .privacy-quicknav-pill:focus-visible {
          background: #E8520A;
          color: #fff !important;
          border-color: #E8520A !important;
          outline: none;
        }
      `}</style>

      {/* MAIN CONTENT, every section wrapped in a card.
          The original `prose` styles are dropped intentionally: each
          PrivacySection sets its own typography so the card chrome
          stays predictable across screen sizes. */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 0' }}>
        <PrivacySection id="about" icon="🏢" title="1. Who we are">
          <p>
            Feastpot is operated by Feastpot Ltd, a UK company. We are registered with the Information
            Commissioner&rsquo;s Office (ICO) as a data controller.
          </p>
          <p>
            ICO Registration Reference: <strong>{ICO_NUMBER}</strong>
            <br />
            Contact: <PrivacyLink href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</PrivacyLink>
          </p>
          <p>
            We process personal data in accordance with the UK General Data Protection Regulation
            (UK&nbsp;GDPR), the Data Protection Act 2018, and the Data (Use and Access) Act 2025 (in
            force from 19 June 2025).
          </p>
        </PrivacySection>

        <PrivacySection id="collect" icon="📋" title="2. What data we collect">
          <h3 style={subHeading}>A. Account data</h3>
          <p>
            Full name, email address, phone number, password (hashed, never stored in plaintext),
            and an optional profile photo.
          </p>
          <h3 style={subHeading}>B. Delivery data</h3>
          <p>Delivery addresses, postcodes, and geocoded coordinates.</p>
          <h3 style={subHeading}>C. Order data</h3>
          <p>
            Order history, basket contents, delivery slot selections, order notes, and reorder history.
          </p>
          <h3 style={subHeading}>D. Payment data</h3>
          <p>
            Stripe payment reference IDs, last 4 digits of your card (held by Stripe, not by Feastpot),
            and payout bank details for vendors (held by Stripe Connect).
          </p>
          <h3 style={subHeading}>E. Vendor data</h3>
          <p>
            Business name, business address, FSA registration number, hygiene certificate, insurance
            certificate, photo ID, and bank account details (held by Stripe).
          </p>
          <h3 style={subHeading}>F. Communications</h3>
          <p>
            Email and WhatsApp message history, support ticket content, and dispute evidence (photos,
            documents).
          </p>
          <h3 style={subHeading}>G. Technical data</h3>
          <p>
            IP address, device type, browser type, session tokens, and push notification subscription
            tokens.
          </p>
          <h3 style={subHeading}>H. Usage data</h3>
          <p>
            Pages visited, search queries, filter selections and click patterns. Used only for platform
            improvement, never sold or shared with advertisers.
          </p>
        </PrivacySection>

        <PrivacySection id="use" icon="⚖️" title="3. Why we process your data (lawful bases)">
          <h3 style={subHeading}>Account creation and authentication</h3>
          <p>
            <strong>Basis:</strong> Contract performance (Article 6(1)(b) UK&nbsp;GDPR).
            <br />
            <strong>Retention:</strong> Until account deletion or 24 months of inactivity, then purged.
          </p>

          <h3 style={subHeading}>Order placement and fulfilment</h3>
          <p>
            <strong>Basis:</strong> Contract performance (Article 6(1)(b)).
            <br />
            <strong>Retention:</strong> 6 years (VAT and tax record obligation under HMRC rules).
          </p>

          <h3 style={subHeading}>Payment processing via Stripe</h3>
          <p>
            <strong>Basis:</strong> Contract performance (Article 6(1)(b)).
            <br />
            Feastpot does not store card numbers. Stripe is our payment processor and acts as a data
            processor under our Data Processing Agreement with them.
          </p>

          <h3 style={subHeading}>Vendor identity verification and compliance documents</h3>
          <p>
            <strong>Basis:</strong> Legal obligation (Article 6(1)(c)), Food Safety Act 1990, Food
            Information Regulations 2014, and Natasha&rsquo;s Law (PPDS Regulation 2021).
            <br />
            <strong>Retention:</strong> Duration of vendor relationship + 6 years.
          </p>

          <h3 style={subHeading}>Sending transactional notifications (order updates, delivery status)</h3>
          <p>
            <strong>Basis:</strong> Contract performance (Article 6(1)(b)) and legitimate interests
            (Article 6(1)(f)), the legitimate interest is ensuring customers and vendors receive
            essential operational communications.
          </p>

          <h3 style={subHeading}>Marketing communications (if opted in)</h3>
          <p>
            <strong>Basis:</strong> Consent (Article 6(1)(a)).
            <br />
            <strong>Retention:</strong> Until consent is withdrawn + 12 months for consent records.
          </p>

          <h3 style={subHeading}>Fraud prevention, security, and abuse detection</h3>
          <p>
            <strong>Basis:</strong> Legitimate interests (Article 6(1)(f)), recognised under the Data
            (Use and Access) Act 2025 Schedule 1 legitimate interests list.
            <br />
            <strong>Retention:</strong> 6 years (audit log retention).
          </p>

          <h3 style={subHeading}>Dispute resolution and audit log maintenance</h3>
          <p>
            <strong>Basis:</strong> Legal obligation (Article 6(1)(c)) and legitimate interests.
            <br />
            <strong>Retention:</strong> 6 years.
          </p>

          <h3 style={subHeading}>Analytics and platform improvement (anonymised / aggregated)</h3>
          <p>
            <strong>Basis:</strong> Legitimate interests (Article 6(1)(f)).
            <br />
            Individual user data is never sold to third parties or shared with advertisers. We do not
            use advertising cookies.
          </p>
        </PrivacySection>

        <PrivacySection id="share" icon="🤝" title="4. Who we share your data with">
          <ul style={listStyle}>
            <li>
              <strong>Stripe Inc</strong> (USA), payment processing and vendor payouts. Protected
              by the UK International Data Transfer Agreement (UK&nbsp;IDTA) and Stripe&rsquo;s SCCs.
            </li>
            <li>
              <strong>Supabase Inc</strong> (USA, EU infrastructure), database and authentication
              hosting. Feastpot data is stored in the EU (Frankfurt region). Protected by the
              UK&nbsp;IDTA.
            </li>
            <li>
              <strong>Resend Inc</strong> (USA), transactional email delivery. Protected by the
              UK&nbsp;IDTA.
            </li>
            <li>
              <strong>Twilio Inc</strong> (USA), SMS and OTP delivery. Protected by the UK&nbsp;IDTA.
            </li>
            <li>
              <strong>Meta Platforms Ireland Ltd</strong> (Ireland / USA), WhatsApp Business API
              for order notifications. Protected by the EU-UK adequacy decision and SCCs.
            </li>
            <li>
              <strong>Cloudflare Inc</strong> (USA), CDN, security and media storage. Protected by
              the UK&nbsp;IDTA.
            </li>
            <li>
              <strong>Sentry Inc</strong> (USA), error monitoring (anonymised stack traces only;
              no personal data in error reports by design). Protected by the UK&nbsp;IDTA.
            </li>
            <li>
              <strong>HMRC (UK)</strong>, tax records as legally required.
            </li>
            <li>
              <strong>Law enforcement / courts</strong>, when legally compelled by a valid court
              order or statutory authority.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> sell personal data. We do <strong>not</strong> share personal
            data with advertisers, data brokers, or marketing companies.
          </p>
        </PrivacySection>

        <PrivacySection id="transfers" icon="✈️" title="5. International transfers">
          <p>
            Some of our service providers are based outside the UK. Where this is the case, we ensure
            transfers are protected by one of the following safeguards:
          </p>
          <ul style={listStyle}>
            <li>UK International Data Transfer Agreement (UK&nbsp;IDTA);</li>
            <li>EU Standard Contractual Clauses (SCCs) under the EU-UK adequacy decision;</li>
            <li>Adequacy regulations made under section 17A of the Data Protection Act 2018.</li>
          </ul>
          <p>Transfers to the EU/EEA are covered by the UK&rsquo;s adequacy decision for the EEA.</p>
        </PrivacySection>

        <PrivacySection id="retention" icon="📅" title="6. How long we keep your data">
          {/* Card grid replaces the table, same data, friendlier scan.
              Periods + reasons are kept verbatim from the original
              table so the legal specificity isn't softened. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {RETENTION_DATA.map((r) => (
              <div
                key={r.type}
                style={{ padding: '10px', borderRadius: '10px', background: r.bg }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontSize: '16px' }} aria-hidden>
                    {r.icon}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#1C1C1A' }}>
                    {r.type}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#E8520A',
                    margin: '0 0 2px',
                  }}
                >
                  {r.period}
                </p>
                {/* `#5F5E5A` (charcoal-mid) instead of `#9B9894` so the
                    11-px reason line clears WCAG AA on the warm tinted
                    card backgrounds. */}
                <p style={{ fontSize: '11px', color: '#5F5E5A', margin: 0 }}>{r.reason}</p>
              </div>
            ))}
          </div>
        </PrivacySection>

        <PrivacySection id="rights" icon="🔓" title="7. Your rights under UK GDPR">
          {/* Original numbered list, kept verbatim for legal fidelity. */}
          <ol style={{ ...listStyle, listStyleType: 'decimal', marginBottom: '14px' }}>
            <li>
              <strong>Right of access</strong> (Subject Access Request), email{' '}
              <PrivacyLink href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</PrivacyLink>.
            </li>
            <li>
              <strong>Right to rectification</strong>, update in account settings or email us.
            </li>
            <li>
              <strong>Right to erasure</strong> (&ldquo;right to be forgotten&rdquo;), subject to
              legal retention obligations.
            </li>
            <li>
              <strong>Right to restriction of processing.</strong>
            </li>
            <li>
              <strong>Right to data portability</strong>, machine-readable format on request.
            </li>
            <li>
              <strong>Right to object</strong>, including to direct marketing (always honoured).
            </li>
            <li>
              <strong>Right not to be subject to automated decision-making.</strong>
            </li>
            <li>
              <strong>Right to withdraw consent</strong> at any time (does not affect prior lawful
              processing).
            </li>
          </ol>
          {/* Visual scan-aid card grid mirrors the list above. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
            {RIGHTS_DATA.map((r) => (
              <div
                key={r.right}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: '#FBF6EF',
                  border: '1px solid #EDE4D4',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '4px' }} aria-hidden>
                  {r.icon}
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#E8520A',
                    margin: '0 0 3px',
                  }}
                >
                  {r.right}
                </p>
                <p style={{ fontSize: '11px', color: '#5F5E5A', margin: '0 0 5px', lineHeight: 1.5 }}>
                  {r.desc}
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
                  {r.how}
                </span>
              </div>
            ))}
          </div>
          <p>
            Some rights are subject to exemptions under the Data Protection Act 2018 and the Data (Use
            and Access) Act 2025, particularly where processing is required for legal compliance, fraud
            prevention, or public interest.
          </p>
          <p>
            To exercise any right, email{' '}
            <PrivacyLink href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</PrivacyLink>{' '}
            with &ldquo;Data Rights Request&rdquo; in the subject line. We will respond within one
            calendar month (extendable by two further months for complex requests, we will notify
            you).
          </p>
          <p>
            You also have the right to lodge a complaint with the ICO:{' '}
            <PrivacyLink href="https://ico.org.uk/make-a-complaint" external>
              ico.org.uk/make-a-complaint
            </PrivacyLink>{' '}
            &middot; 0303 123 1113.
          </p>
        </PrivacySection>

        <PrivacySection id="cookies" icon="🍪" title="8. Cookies">
          <p>Feastpot uses strictly necessary cookies only:</p>
          <ul style={listStyle}>
            <li>Authentication session cookie (Supabase JWT, expires in 1 hour, refreshed);</li>
            <li>CSRF protection token;</li>
            <li>Basket persistence (localStorage, not a cookie, client-side only).</li>
          </ul>
          <p>
            Under the Privacy and Electronic Communications Regulations (PECR), strictly necessary
            cookies do not require prior consent. We do not use advertising cookies, tracking pixels,
            or third-party analytics cookies. Our cookie banner is informational only for this reason.
          </p>
        </PrivacySection>

        <PrivacySection id="changes" icon="📢" title="9. Changes to this policy">
          <p>
            We will notify registered users by email of material changes at least 14 days before they
            take effect. Minor changes (grammar, clarifications) take effect immediately. The
            &ldquo;last updated&rdquo; date at the top of this page will always reflect the most
            recent version.
          </p>
        </PrivacySection>

        {/* CONTACT, dark branded CTA bookends the hero. Section 10 keeps
            its semantic h2 (with id="contact") so the sticky quick-nav
            and any deep links continue to work. */}
        <section
          id="contact"
          className="scroll-mt-24"
          style={{
            background: 'linear-gradient(135deg, #1C1C1A, #3D1A0A)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontWeight: 800,
              fontSize: '20px',
              color: 'white',
              margin: '0 0 8px',
            }}
          >
            10. Contact
          </h2>
          {/* Original section 10 wording, preserved verbatim. */}
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: '13px',
              lineHeight: 1.7,
              margin: '0 0 16px',
            }}
          >
            <a
              href="mailto:privacy@feastpot.co.uk"
              style={{ color: 'white', textDecoration: 'underline', fontWeight: 600 }}
            >
              privacy@feastpot.co.uk
            </a>
            <br />
            Subject line: &ldquo;Privacy enquiry&rdquo;.
            <br />
            We aim to respond within 5 business days.
          </p>
          <a
            href="mailto:privacy@feastpot.co.uk?subject=Privacy enquiry"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#E8520A',
              color: 'white',
              padding: '10px 18px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '13px',
              textDecoration: 'none',
            }}
          >
            <span aria-hidden>✉️</span> privacy@feastpot.co.uk
          </a>
          <div
            style={{
              marginTop: '14px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
              ICO Registration: {ICO_NUMBER}
            </span>
            <a
              href="https://ico.org.uk/make-a-complaint"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.55)',
                textDecoration: 'underline',
              }}
            >
              Lodge ICO complaint ↗
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Section wrapper + small primitives. Kept in-file because the privacy
// page is the only consumer; if a second legal page wants the look we
// can promote them to `components/legal/`.
// ----------------------------------------------------------------------

function PrivacySection({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24" style={{ marginBottom: '20px' }}>
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #EDE4D4',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            background: '#FBF6EF',
            borderBottom: '1px solid #EDE4D4',
          }}
        >
          <span style={{ fontSize: '22px' }} aria-hidden>
            {icon}
          </span>
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontWeight: 800,
              fontSize: '17px',
              color: '#1C1C1A',
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
        <div
          style={{
            padding: '16px',
            fontSize: '13px',
            lineHeight: 1.75,
            color: '#5F5E5A',
          }}
          className="privacy-section-body"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/** Brand-coloured anchor used inline within section bodies. */
function PrivacyLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{ color: '#E8520A', fontWeight: 600, textDecoration: 'underline' }}
    >
      {children}
    </a>
  );
}

const subHeading: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#1C1C1A',
  margin: '14px 0 4px',
};

const listStyle: React.CSSProperties = {
  listStyle: 'disc',
  paddingLeft: '20px',
  margin: '8px 0',
};

// Periods + reasons reproduce the ORIGINAL retention table verbatim
//, only the visual presentation (cards) changes.
const RETENTION_DATA = [
  { type: 'Orders and payments', period: '6 years from order date', icon: '🧾', bg: '#FEF0E9', reason: 'HMRC / VAT obligation' },
  { type: 'Audit logs', period: '6 years', icon: '📋', bg: '#FEF0E9', reason: 'Legal obligation' },
  {
    type: 'Account data',
    period: 'Until deletion request or 24 months inactivity',
    icon: '👤',
    bg: '#E1F5EE',
    reason: 'Contract',
  },
  {
    type: 'Marketing consent',
    period: 'Until withdrawn + 12 months',
    icon: '📣',
    bg: '#FFF9E6',
    reason: 'Accountability',
  },
  {
    type: 'Vendor documents',
    period: 'Duration of relationship + 6 years',
    icon: '📄',
    bg: '#FEF0E9',
    reason: 'Food safety law',
  },
  {
    type: 'Support communications',
    period: '2 years from resolution',
    icon: '💬',
    bg: '#E1F5EE',
    reason: 'Legitimate interest',
  },
  { type: 'Technical / session data', period: '90 days', icon: '🔒', bg: '#E1F5EE', reason: 'Security' },
] as const;

const RIGHTS_DATA = [
  { right: 'Access your data', icon: '👁️', desc: 'Request a copy of all data we hold', how: 'Email privacy@feastpot.co.uk' },
  { right: 'Correct your data', icon: '✏️', desc: 'Fix inaccurate or incomplete information', how: 'Account settings or email us' },
  { right: 'Delete your data', icon: '🗑️', desc: 'Erasure, subject to legal obligations', how: 'Account settings or email' },
  { right: 'Restrict processing', icon: '⏸️', desc: 'Limit how we use your data', how: 'Email us' },
  { right: 'Data portability', icon: '📦', desc: 'Your data in machine-readable format', how: 'Email with your request' },
  { right: 'Object to processing', icon: '🚫', desc: 'Object to marketing, always honoured', how: 'Unsubscribe or email us' },
  { right: 'No automated decisions', icon: '🤖', desc: 'Not subject to automated-only decisions', how: 'Always applies' },
  { right: 'Withdraw consent', icon: '↩️', desc: 'Withdraw at any time without penalty', how: 'Account settings' },
] as const;
