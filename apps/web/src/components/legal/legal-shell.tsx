import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared brand-DNA primitives for the /legal/* pages. Mirrors the inlined
 * helpers from `apps/web/src/app/legal/privacy/page.tsx` so every legal
 * page renders with the same dark hero / sticky pill nav / white card
 * sections / dark contact CTA without each page re-deriving the styles.
 *
 * Privacy keeps its own inlined version (it's the canonical reference)
 * to avoid touching its verbatim legal copy. New pages should compose
 * `LegalHero` + (optional `LegalQuickNav`) + `LegalSection`s + `LegalContact`.
 */

// ---------------- HERO ----------------

export function LegalHero({
  title,
  lede,
  badge,
  footnote,
}: {
  title: string;
  lede: ReactNode;
  badge?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <>
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
            {title}
          </h1>
          <p
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: badge || footnote ? '18px' : 0,
            }}
          >
            {lede}
          </p>
          {badge}
          {footnote && (
            <p
              style={{
                color: 'rgba(255,255,255,0.55)',
                fontSize: '11px',
                marginTop: '12px',
              }}
            >
              {footnote}
            </p>
          )}
        </div>
      </div>
      <div className="kente-divider" aria-hidden />
    </>
  );
}

// ---------------- QUICK NAV ----------------

export function LegalQuickNav({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <>
      <nav
        aria-label={ariaLabel}
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
          {items.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="legal-quicknav-pill"
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
      <style>{`
        .legal-quicknav-pill:hover,
        .legal-quicknav-pill:focus-visible {
          background: #E8520A;
          color: #fff !important;
          border-color: #E8520A !important;
          outline: none;
        }
      `}</style>
    </>
  );
}

// ---------------- SECTION CARD ----------------

export function LegalSection({
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
        >
          {children}
        </div>
      </div>
    </section>
  );
}

// ---------------- INLINE LINK ----------------

export function LegalLink({
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

// ---------------- CONTACT CTA ----------------

export function LegalContact({
  id = 'contact',
  number,
  title = 'Contact',
  email,
  subject,
  body,
  meta,
}: {
  id?: string;
  number?: string;
  title?: string;
  email: string;
  subject: string;
  body: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section
      id={id}
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
        {number ? `${number}. ${title}` : title}
      </h2>
      <p
        style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: '13px',
          lineHeight: 1.7,
          margin: '0 0 16px',
        }}
      >
        {body}
      </p>
      <a
        href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
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
        <span aria-hidden>✉️</span> {email}
      </a>
      {meta && (
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
          {meta}
        </div>
      )}
    </section>
  );
}

// ---------------- TYPOGRAPHY HELPERS ----------------

export const legalSubHeading: CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#1C1C1A',
  margin: '14px 0 4px',
};

export const legalListStyle: CSSProperties = {
  listStyle: 'disc',
  paddingLeft: '20px',
  margin: '8px 0',
};

export const legalOrderedListStyle: CSSProperties = {
  ...legalListStyle,
  listStyleType: 'decimal',
};

// Common page wrapper that mirrors the privacy page's outer chrome:
// edge-to-edge on mobile, rounded card on md+.
export function LegalPageShell({ children }: { children: ReactNode }) {
  return <div className="-mx-4 md:mx-0">{children}</div>;
}

export function LegalContentWrapper({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 0' }}>
      {children}
    </div>
  );
}
