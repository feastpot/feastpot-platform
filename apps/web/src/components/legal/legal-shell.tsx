import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared brand-DNA primitives for the /legal/* pages (2026-05-16
 * trust-pages redesign). Uses FeastPot brand tokens — green #00843D,
 * plantain gold #F6B400, cream + charcoal — and the same eyebrow +
 * font-display headings used across the rest of the customer site
 * (see components/ui/wireframe.tsx). Tailwind first; inline `style`
 * only where the legal pages need exact pixel control (badge chips,
 * the dark contact CTA).
 *
 * The privacy page keeps its own inlined hero (canonical reference,
 * verbatim copy) — every other legal page composes
 * `LegalHero` + `LegalQuickNav` + `LegalSection`s + `LegalContact`.
 */

// ---------------- HERO ----------------

export function LegalHero({
  eyebrow = 'Support & legal centre',
  title,
  lede,
  badge,
  footnote,
}: {
  eyebrow?: ReactNode;
  title: string;
  lede: ReactNode;
  badge?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <>
      <div className="rounded-none border-y border-cream-deep bg-cream-warm px-5 py-7 md:rounded-3xl md:border md:px-10 md:py-10">
        <div className="mx-auto max-w-[640px]">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            {eyebrow}
          </p>
          <h1 className="font-display text-3xl font-black leading-[1.1] tracking-tight text-charcoal md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm font-medium leading-relaxed text-charcoal-mid md:text-base">
            {lede}
          </p>
          {badge && <div className="mt-5">{badge}</div>}
          {footnote && (
            <p className="mt-4 text-[11px] font-medium text-charcoal-mid/80">
              {footnote}
            </p>
          )}
        </div>
      </div>
      <div className="kente-divider" aria-hidden />
    </>
  );
}

// ---------------- HERO BADGE (small reusable trust chip) ----------------

export function LegalBadge({
  icon,
  title,
  body,
  tone = 'brand',
}: {
  icon: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  tone?: 'brand' | 'plantain' | 'scotch';
}) {
  const TONE = {
    brand: 'border-brand/30 bg-brand-light text-brand-dark',
    plantain: 'border-plantain/40 bg-plantain/15 text-charcoal',
    scotch: 'border-scotch/30 bg-scotch/10 text-scotch',
  } as const;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 ${TONE[tone]}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-lg shadow-sm" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-black leading-tight">{title}</p>
        {body && <p className="mt-0.5 text-[11px] font-medium opacity-80">{body}</p>}
      </div>
    </div>
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
    <nav
      aria-label={ariaLabel}
      className="sticky top-14 z-20 -mx-4 mt-2 overflow-x-auto border-b border-cream-deep bg-cream-warm/95 backdrop-blur md:mx-0 md:rounded-2xl md:border md:border-cream-deep md:bg-white"
    >
      <div className="mx-auto flex max-w-[640px] gap-2 whitespace-nowrap px-3 py-2">
        {items.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-full border border-cream-deep bg-white px-3 py-1.5 text-[11px] font-bold text-charcoal-mid transition hover:border-brand hover:bg-brand hover:text-white focus-visible:border-brand focus-visible:bg-brand focus-visible:text-white focus-visible:outline-none"
          >
            {l.label}
          </a>
        ))}
      </div>
    </nav>
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
    <section id={id} className="mb-4 scroll-mt-24">
      <div className="overflow-hidden rounded-3xl border border-cream-deep bg-white shadow-card">
        <div className="flex items-center gap-3 border-b border-cream-deep bg-cream-warm px-4 py-3.5">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brand-light text-lg"
          >
            {icon}
          </span>
          <h2 className="m-0 font-display text-[17px] font-black tracking-tight text-charcoal md:text-lg">
            {title}
          </h2>
        </div>
        <div className="legal-prose px-4 py-4 text-[13px] leading-7 text-charcoal-mid md:px-5 md:text-sm">
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
      className="font-bold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
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
      className="scroll-mt-24 mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-dark to-brand p-6 text-white shadow-card"
    >
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-plantain">
        We&rsquo;re here to help
      </p>
      <h2 className="m-0 font-display text-2xl font-black tracking-tight">
        {number ? `${number}. ${title}` : title}
      </h2>
      <p className="mb-5 mt-2 text-sm leading-relaxed text-white/85">
        {body}
      </p>
      <a
        href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
        className="inline-flex items-center gap-2 rounded-2xl bg-plantain px-5 py-2.5 text-sm font-black text-charcoal shadow-sm transition hover:bg-plantain/90"
      >
        <span aria-hidden>✉️</span> {email}
      </a>
      {meta && (
        <div className="mt-5 flex flex-wrap gap-3 border-t border-white/15 pt-4">
          {meta}
        </div>
      )}
    </section>
  );
}

// ---------------- TRUST STRIP (board footer) ----------------

const TRUST_ITEMS = [
  { icon: '🏠', title: 'Local flavours', body: 'Support local kitchens' },
  { icon: '💷', title: 'Great value', body: 'Fair prices, every time' },
  { icon: '🧡', title: 'Made with care', body: 'Real food, real people' },
  { icon: '💬', title: 'Always here', body: '24/7 customer support' },
] as const;

export function LegalTrustStrip() {
  return (
    <section
      aria-label="Why people choose FeastPot"
      className="mb-6 mt-2 grid grid-cols-2 gap-2 rounded-3xl border border-cream-deep bg-cream-warm p-4 md:grid-cols-4"
    >
      {TRUST_ITEMS.map((t) => (
        <div key={t.title} className="flex items-start gap-2.5">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">
            {t.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-black leading-tight text-charcoal">{t.title}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight text-charcoal-mid">{t.body}</p>
          </div>
        </div>
      ))}
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
    <div className="mx-auto max-w-[640px] px-4 pt-5 md:px-0">{children}</div>
  );
}
