import type { Metadata } from 'next';
import Link from 'next/link';

import {
  LegalBadge,
  LegalContact,
  LegalContentWrapper,
  LegalHero,
  LegalPageShell,
  LegalTrustStrip,
} from '@/components/legal/legal-shell';
import { LEGAL } from '@/lib/legal-constants';

export const metadata: Metadata = {
  title: 'Legal & Support Centre',
  description:
    'Feastpot legal and support hub: terms of service, privacy policy, cookie policy, allergen information and vendor terms — all in one place.',
  alternates: { canonical: '/legal' },
};

const LEGAL_PAGES = [
  {
    href: '/legal/terms',
    icon: '📜',
    title: 'Terms of Service',
    body: 'How Feastpot works, your rights as a customer, and our 24h dispute / 5 business-day refund commitment.',
  },
  {
    href: '/legal/privacy',
    icon: '🔒',
    title: 'Privacy Policy',
    body: 'What data we collect, why, how long we keep it, and your rights under UK GDPR.',
  },
  {
    href: '/legal/cookies',
    icon: '🍪',
    title: 'Cookie Policy',
    body: 'Strictly necessary cookies only. No advertising, no tracking, no third-party analytics.',
  },
  {
    href: '/legal/allergens',
    icon: '⚠️',
    title: 'Allergen Information',
    body: 'The 14 FSA allergens, how vendors declare them, and how to filter dishes in-app.',
  },
  {
    href: '/legal/vendor-terms',
    icon: '👩🏾‍🍳',
    title: 'Vendor Terms',
    body: 'For kitchens selling on Feastpot: commission, weekly payouts, food-safety obligations.',
  },
  {
    href: '/help',
    icon: '💬',
    title: 'Help & FAQ',
    body: 'Answers on ordering, delivery, refunds and accounts — plus how to reach our support team.',
  },
] as const;

export default function LegalIndexPage() {
  return (
    <LegalPageShell>
      <LegalHero
        title="Legal & Support Centre"
        lede={
          <>
            Everything you need to know about how Feastpot works, how we protect your data, and the
            commitments we make to customers and kitchens. Pick a document below.
          </>
        }
        badge={
          <LegalBadge
            tone="brand"
            icon="🇬🇧"
            title="UK GDPR &amp; PECR compliant"
            body={
              <>
                {LEGAL.COMPANY_NAME} &middot; registered in {LEGAL.REGISTERED_IN} &middot; ICO{' '}
                {LEGAL.ICO_NUMBER}
              </>
            }
          />
        }
        footnote={<>Last updated: {LEGAL.LAST_UPDATED}</>}
      />

      <LegalContentWrapper>
        <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
          {LEGAL_PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group flex items-start gap-3 rounded-3xl border border-cream-deep bg-white p-4 shadow-card transition hover:border-brand focus-visible:border-brand focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-light text-xl"
              >
                {p.icon}
              </span>
              <div className="min-w-0">
                <p className="font-display text-[15px] font-black tracking-tight text-charcoal group-hover:text-brand-dark">
                  {p.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-charcoal-mid">{p.body}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-5">
          <LegalContact
            number={undefined}
            title="Still need a hand?"
            email={LEGAL.SUPPORT_EMAIL}
            subject="Support enquiry"
            body={
              <>
                Can&rsquo;t find what you&rsquo;re looking for? Email us and we&rsquo;ll get back to
                you within 5 business days.
              </>
            }
            meta={
              <span className="text-[11px] font-medium text-white/70">
                ICO Registration: {LEGAL.ICO_NUMBER}
              </span>
            }
          />
        </div>

        <LegalTrustStrip />
      </LegalContentWrapper>
    </LegalPageShell>
  );
}
