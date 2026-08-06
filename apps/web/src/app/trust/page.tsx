import type { Metadata } from 'next';
import Link from 'next/link';

import { TrustStandard } from '@/components/home/trust-standard';

export const metadata: Metadata = {
  title: 'Trust and Safety | Feastpot',
  description:
    'How Feastpot verifies vendors, handles allergen disclosures, processes refunds and resolves disputes, so every meal is safe and every pound is protected.',
  alternates: {
    canonical: 'https://feastpot.co.uk/trust',
  },
};

const TRUST_SECTIONS = [
  {
    id: 'hygiene',
    heading: 'Food hygiene checks',
    body: `Every vendor on Feastpot must provide a valid food business registration number before their profile goes live. We cross-reference registrations with the Food Standards Agency (FSA) register. Vendors who have been inspected and awarded a rating display their score on their profile. We do not permit vendors who have received a rating of 0 or 1 to accept orders.

Vendors preparing food from a residential kitchen are required to hold a Level 2 Award in Food Safety in Catering (or equivalent). We collect the certificate at application stage and re-verify it annually.`,
  },
  {
    id: 'allergens',
    heading: 'Allergen information',
    body: `UK law requires food businesses to declare the 14 major allergens in every dish they sell. Every Feastpot vendor must complete an allergen information form for each menu item before it can be listed.

At checkout, customers confirm they have reviewed the allergen information and understand they should contact the vendor directly before ordering if they have a serious allergy. Vendors' allergen declarations are their legal responsibility. If you have a life-threatening allergy, please contact the vendor before placing your order.`,
  },
  {
    id: 'payments',
    heading: 'Secure payments',
    body: `All payments on Feastpot are processed by Stripe, a PCI-DSS Level 1 certified payment processor. Feastpot never stores card details. Your payment is held in a secure Stripe account and only released to the vendor after your order has been confirmed for delivery.

If a vendor cancels your order after payment has been taken, your money is refunded in full within 5 to 10 business days, depending on your bank.`,
  },
  {
    id: 'refunds',
    heading: 'Refunds and disputes',
    body: `If something goes wrong with your order (the food does not arrive, it arrives significantly different from what was described, or there is a safety concern), you can raise a dispute from your order page within 48 hours of the scheduled delivery time.

We review every dispute and aim to respond within one business day. Where we uphold a dispute, a full or partial refund is issued to your original payment method. Feastpot covers the cost of refunds for vendor errors; vendors are not paid for orders that are legitimately disputed.`,
  },
  {
    id: 'vendors',
    heading: 'Vendor accountability',
    body: `Vendors who receive repeated disputes, cancellations, or hygiene concerns are placed under review. Depending on severity, we may suspend listings, require additional evidence, or remove a vendor permanently.

Vendors are required to carry appropriate public liability insurance for home catering. We collect insurance evidence at application stage for vendors accepting event catering orders. If you have concerns about a specific vendor, please contact us and we will investigate.`,
  },
] as const;

const FAQS = [
  {
    q: 'What happens if my food does not arrive?',
    a: 'Go to your order page and raise a dispute. We will contact the vendor and, if the food was not delivered, issue a full refund.',
  },
  {
    q: 'How do I know the vendor is registered with the FSA?',
    a: 'Every active vendor profile shows their food business registration number. You can verify it independently on the FSA website.',
  },
  {
    q: 'What if I have a serious allergy?',
    a: 'Contact the vendor directly before placing your order. Their contact details are on their profile page. Do not rely solely on the allergen information displayed on the listing, as ingredients and processes can change.',
  },
  {
    q: 'Can I get a refund if the food was not what I expected?',
    a: 'Raise a dispute within 48 hours with a clear description and, where possible, a photo. We review each case on its merits.',
  },
  {
    q: 'Who do I contact for urgent safety concerns?',
    a: 'Email safety@feastpot.co.uk. For life-threatening situations, call 999.',
  },
] as const;

export default function TrustPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <header className="mb-10">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          Trust and safety
        </p>
        <h1 className="mt-2 font-display text-[32px] font-black leading-[1.08] tracking-tight text-charcoal sm:text-[40px]">
          How we keep every meal safe
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] font-medium leading-relaxed text-charcoal-mid">
          Every vendor on Feastpot is verified before they go live. Here is exactly what we check,
          how your money is protected, and what happens when something goes wrong.
        </p>
      </header>

      {/* Main sections */}
      <div className="space-y-6 pb-10">
        {TRUST_SECTIONS.map((s) => (
          <section
            key={s.id}
            id={s.id}
            className="rounded-2xl border border-cream-deep bg-white p-6 shadow-card"
          >
            <h2 className="font-display text-[18px] font-black text-charcoal">{s.heading}</h2>
            {s.body.split('\n\n').map((para, i) => (
              <p key={i} className="mt-3 text-[14px] font-medium leading-relaxed text-charcoal-mid">
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>

      {/* Trust standard */}
      <div className="-mx-4 mb-10 sm:-mx-6 lg:-mx-8">
        <TrustStandard />
      </div>

      {/* FAQs */}
      <section aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="mb-5 font-display text-[22px] font-black leading-tight text-charcoal"
        >
          Common questions
        </h2>
        <dl className="space-y-4">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card">
              <dt className="font-display text-[15px] font-black text-charcoal">{q}</dt>
              <dd className="mt-2 text-[13px] font-medium leading-relaxed text-charcoal-mid">
                {a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Contact / CTA */}
      <div className="mt-10 rounded-2xl bg-brand-light/50 p-6 text-center">
        <p className="text-[14px] font-medium text-charcoal-mid">
          Have a safety concern or a question not answered here?
        </p>
        <a
          href="mailto:safety@feastpot.co.uk"
          className="mt-3 inline-flex items-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
        >
          Contact our safety team
        </a>
        <p className="mt-3 text-[12px] text-charcoal-light">
          Or visit your{' '}
          <Link href="/orders" className="font-semibold text-brand hover:underline">
            orders page
          </Link>{' '}
          to raise a dispute about a specific order.
        </p>
      </div>
    </main>
  );
}
