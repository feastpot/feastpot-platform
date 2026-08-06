import type { Metadata } from 'next';
import Link from 'next/link';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { LegalTrustStrip } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Help &amp; FAQ',
  description: 'Help, FAQ and contact information for Feastpot customers and vendors.',
  alternates: { canonical: '/help' },
};

interface FaqSection {
  heading: string;
  icon: string;
  items: { question: string; answer: string }[];
}

const SECTIONS: FaqSection[] = [
  {
    heading: 'Ordering',
    icon: '🛒',
    items: [
      {
        question: 'How do I place an order?',
        answer:
          'Enter your postcode on the homepage, browse vendors covering your area, add items to your basket and check out with a card via Stripe.',
      },
      {
        question: 'Can I order from more than one vendor in the same basket?',
        answer:
          'No - to keep delivery promises realistic, each basket is for a single vendor. You can place multiple orders in a session if you want food from several kitchens.',
      },
      {
        question: 'How do I change or cancel an order?',
        answer:
          'Go to the order page and tap "Request amendment". Vendors confirm changes directly. Cancellation is possible until the vendor accepts the order.',
      },
    ],
  },
  {
    heading: 'Delivery',
    icon: '🛵',
    items: [
      {
        question: 'Who delivers my order?',
        answer:
          'Your vendor delivers your order directly. The delivery fee is set by the vendor and shown before you pay.',
      },
      {
        question: 'What areas do you deliver to?',
        answer:
          'Each vendor sets their own delivery zone. Enter your postcode on the homepage to see who covers you. Vendors operate across the UK, with new areas added as we onboard more cooks.',
      },
      {
        question: 'How do I track my order?',
        answer:
          'You can track every order live from the orders page. We also send push notifications and (if you opt in) WhatsApp updates at key milestones.',
      },
      {
        question: 'What if my driver is late?',
        answer:
          'Open the order page and tap "Contact vendor" - they can give you a live update. If you do not get a reply within 15 minutes, raise a dispute and our support team will step in.',
      },
    ],
  },
  {
    heading: 'Refunds',
    icon: '↩️',
    items: [
      {
        question: 'How do refunds work?',
        answer:
          'Raise a dispute from the order page within 24 hours of delivery, including photos or vendor messages where relevant. We resolve disputes within one working day. Approved refunds reach your card in 5 business days.',
      },
      {
        question: 'Will I be charged if I cancel?',
        answer:
          'No - cancellations made before the vendor accepts the order are refunded in full and immediately released by Stripe. Cancellations after acceptance are case-by-case depending on prep stage.',
      },
    ],
  },
  {
    heading: 'Allergens',
    icon: '⚠️',
    items: [
      {
        question: 'How do I filter dishes by allergen?',
        answer:
          'Open the search filters and toggle the allergens you need to avoid. See our dedicated guide at /legal/allergens for the full list and important safety information.',
      },
      {
        question: 'How accurate is the allergen information?',
        answer:
          'Allergen labels are provided by the vendor and we require them to be accurate, but we do not independently verify each dish. If you have a severe allergy, please confirm with the vendor directly before ordering.',
      },
    ],
  },
  {
    heading: 'Vendor accounts',
    icon: '🍳',
    items: [
      {
        // D2 fix: the application form at /become-a-vendor is canonical.
        // The email address is retained as an accessibility fallback only.
        question: 'How do I sign up as a vendor?',
        answer:
          'Apply using the form at /become-a-vendor (it takes about 2 minutes and we review every application within 1-2 business days). If you need help completing your application, you can also email partners@feastpot.co.uk.',
      },
      {
        question: 'When do I get paid?',
        answer: `Vendor payouts run ${PLATFORM_FACTS.payouts.frequency}, every ${PLATFORM_FACTS.payouts.day}, via Stripe Connect. Feastpot deducts a ${PLATFORM_FACTS.commission.marketplaceFirst}% commission from each order subtotal.`,
      },
      {
        // D3 fix: list now matches PLATFORM_FACTS.vendorRequirements including FHRS 3+.
        question: 'What documents do I need to submit?',
        answer: `To join Feastpot you need: ${PLATFORM_FACTS.vendorRequirements.join('; ')}. The vendor portal walks you through each step.`,
      },
    ],
  },
];

export default function HelpPage() {
  const supportEmail = PLATFORM_FACTS.support.email;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      {/* HERO */}
      <header className="rounded-3xl border border-cream-deep bg-cream-warm p-6 md:p-8">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          Support &amp; legal centre
        </p>
        <h1 className="font-display text-3xl font-black leading-[1.1] tracking-tight text-charcoal md:text-4xl">
          How can we help?
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-charcoal-mid md:text-base">
          Most answers are below. If you can&rsquo;t find what you need, our support team is happy
          to help.
        </p>
      </header>

      {/* CONTACT CARD: email only; WhatsApp is not currently a public channel */}
      <section className="mt-6">
        <a
          href={`mailto:${supportEmail}`}
          className="group flex items-start gap-3 rounded-3xl border border-cream-deep bg-white p-5 shadow-card transition hover:border-brand"
        >
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-light text-xl"
          >
            ✉️
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-charcoal-mid">
              Email support
            </p>
            <p className="mt-0.5 truncate font-display text-base font-black text-charcoal group-hover:text-brand">
              {supportEmail}
            </p>
            <p className="mt-0.5 text-xs font-medium text-charcoal-mid">
              Reply {PLATFORM_FACTS.support.responseTime}, {PLATFORM_FACTS.support.hours}.
            </p>
          </div>
        </a>
      </section>

      {/* FAQ SECTIONS */}
      {SECTIONS.map((section, idx) => (
        <section key={section.heading} className="mt-8">
          <div className="mb-3 flex items-center gap-2.5">
            <span
              aria-label={`Section ${idx + 1}`}
              role="img"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-charcoal text-xs font-black text-white"
            >
              {idx + 1}
            </span>
            <h2 className="font-display text-xl font-black tracking-tight text-charcoal md:text-2xl">
              {section.heading}
            </h2>
            <span aria-hidden className="ml-1 text-lg">
              {section.icon}
            </span>
          </div>
          <dl className="space-y-2">
            {section.items.map((item) => (
              <div
                key={item.question}
                className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm"
              >
                <dt className="font-display text-[15px] font-black text-charcoal">
                  {item.question}
                </dt>
                <dd className="mt-1.5 text-sm font-medium leading-relaxed text-charcoal-mid">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {/* DISPUTE CTA */}
      <section className="mt-10 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-dark to-brand p-6 text-white shadow-card md:p-7">
        <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-plantain">
          Need to escalate?
        </p>
        <h2 className="font-display text-xl font-black tracking-tight md:text-2xl">
          Raise a dispute
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/90">
          Open the order page and tap &ldquo;Raise a dispute&rdquo;. We resolve disputes within one
          working day.
        </p>
        <Link
          href="/orders"
          className="mt-5 inline-flex items-center rounded-2xl bg-plantain px-5 py-2.5 text-sm font-black text-charcoal shadow-sm transition hover:bg-plantain/90"
        >
          Go to my orders
        </Link>
      </section>

      <div className="mt-8">
        <LegalTrustStrip />
      </div>
    </article>
  );
}
