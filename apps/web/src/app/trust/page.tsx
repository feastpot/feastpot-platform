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

// ── Section 1: what we check ──────────────────────────────────────────────────

const CHECKS = [
  {
    label: 'Food business registration',
    detail:
      'Every vendor must hold a valid registration with their local authority before they can sell. We record the registration number and display it publicly on their profile.',
  },
  {
    label: 'FHRS hygiene rating, minimum 3 out of 5',
    detail:
      'We require a Food Standards Agency hygiene rating of at least 3. A rating of 4 or 5 is recommended. Vendors rated 0 or 1 are not permitted to list. Newly registered businesses that have not yet been inspected may list provisionally, with a note on their profile.',
  },
  {
    label: 'Public liability insurance, minimum £1 million',
    detail:
      'Vendors accepting event catering orders must provide evidence of public liability insurance covering at least £1 million. We collect the certificate at application stage.',
  },
  {
    label: 'Allergen training certificate',
    detail:
      'Vendors preparing food from a residential kitchen are required to hold a Level 2 Award in Food Safety in Catering (or equivalent). We verify the certificate at application stage and re-check it annually.',
  },
  {
    label: 'Photo ID verification',
    detail:
      'We verify the identity of every vendor before their profile goes live. This is a one-time check run during the application review.',
  },
] as const;

// ── Section 2: what appears on profiles ──────────────────────────────────────

const PROFILE_ITEMS = [
  {
    label: 'Registration number',
    detail: "The vendor's food business registration number is shown on every active profile so you can verify it independently on the Food Standards Agency website.",
  },
  {
    label: 'FSA hygiene score',
    detail:
      'Where the FSA has published an inspection result, the rating badge is shown on the vendor profile. Vendors awaiting a first inspection are labelled clearly.',
  },
  {
    label: 'Allergen information per dish',
    detail:
      'Vendors must complete an allergen declaration for each menu item before it can be listed. The 14 major allergens regulated by UK law are shown at item level on every menu.',
  },
  {
    label: 'Reviews tied to completed, delivered orders',
    detail:
      'Only customers who placed and received a real order can leave a review. Reviews are posted after delivery is confirmed, not before.',
  },
] as const;

// ── Section 4 & 5 prose sections ─────────────────────────────────────────────

const PROSE_SECTIONS = [
  {
    id: 'payments',
    heading: 'How payments are protected',
    body: `All payments are processed by Stripe, a PCI-DSS Level 1 certified payment processor. Card data never touches Feastpot's servers. Your payment is held securely by Stripe and released to the vendor only after your order has been confirmed for delivery.

If a vendor cancels an order after payment, your money is refunded in full within 5 to 10 business days, depending on your bank.`,
  },
  {
    id: 'disputes',
    heading: 'How to raise a problem',
    body: `If something goes wrong, go to your order page and open a dispute within 48 hours of the scheduled delivery time. You can describe what happened and attach a photo if relevant.

We aim to respond to every dispute within one business day. Where we uphold a dispute, a full or partial refund is issued to your original payment method. Feastpot covers the cost of refunds for vendor errors.

If your dispute is not resolved to your satisfaction, you can escalate by emailing safety@feastpot.co.uk. We will review the case with a senior member of the team. Vendors with repeated upheld disputes are reviewed and may be suspended or removed.`,
  },
] as const;

// ── FAQs ─────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'What happens if my food does not arrive?',
    a: 'Go to your order page and raise a dispute. We will contact the vendor and, if the food was not delivered, issue a full refund.',
  },
  {
    q: 'How do I know the vendor is registered with the FSA?',
    a: "Every active vendor profile shows their food business registration number. You can verify it on the FSA website at ratings.food.gov.uk.",
  },
  {
    q: 'What if I have a severe allergy?',
    a: 'Contact the vendor directly before placing your order. Their contact details are on their profile. Do not rely on the allergen labels alone as ingredients and processes can change. Feastpot records allergen information as provided by the vendor but does not independently test each dish.',
  },
  {
    q: 'Can I get a refund if the food was not what I expected?',
    a: 'Raise a dispute within 48 hours with a clear description and, where possible, a photo. We review each case on its merits and issue refunds where the description or quality falls significantly short of what was listed.',
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
          what you can see on every profile, and what happens when something goes wrong.
        </p>
      </header>

      {/* Section 1: What we check */}
      <section aria-labelledby="checks-heading" className="mb-8">
        <h2
          id="checks-heading"
          className="mb-4 font-display text-[22px] font-black leading-tight text-charcoal"
        >
          What we check before a cook can sell
        </h2>
        <div className="space-y-3">
          {CHECKS.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10"
                >
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="h-3 w-3"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-brand"
                    />
                  </svg>
                </span>
                <div>
                  <p className="text-[14px] font-bold text-charcoal">{item.label}</p>
                  <p className="mt-1 text-[13px] font-medium leading-relaxed text-charcoal-mid">
                    {item.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: What appears on every profile */}
      <section aria-labelledby="profile-heading" className="mb-8">
        <h2
          id="profile-heading"
          className="mb-4 font-display text-[22px] font-black leading-tight text-charcoal"
        >
          What appears on every vendor profile
        </h2>
        <div className="space-y-3">
          {PROFILE_ITEMS.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
            >
              <p className="text-[14px] font-bold text-charcoal">{item.label}</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-charcoal-mid">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: What we do NOT verify (honest disclosure) */}
      <section aria-labelledby="limits-heading" className="mb-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2
            id="limits-heading"
            className="mb-3 font-display text-[18px] font-black text-charcoal"
          >
            What Feastpot does not verify
          </h2>
          <p className="text-[14px] font-medium leading-relaxed text-charcoal-mid">
            Allergen labels on individual dishes are provided by the vendor and are not
            independently tested or verified per dish by Feastpot. Ingredients and preparation
            methods can change without notice.
          </p>
          <p className="mt-3 text-[14px] font-medium leading-relaxed text-charcoal-mid">
            If you have a severe or life-threatening allergy, please contact the vendor directly
            before placing your order. Their contact details are shown on their profile page.
          </p>
          <p className="mt-3 text-[13px] font-semibold text-charcoal">
            We are honest about this because customers with serious allergies deserve to know.
          </p>
        </div>
      </section>

      {/* Sections 4 and 5: Payments and disputes */}
      <div className="mb-8 space-y-6">
        {PROSE_SECTIONS.map((s) => (
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

      {/* Trust standard component */}
      <div className="-mx-4 mb-10 sm:-mx-6 lg:-mx-8">
        <TrustStandard />
      </div>

      {/* FAQs */}
      <section aria-labelledby="faq-heading" className="mb-10">
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
              <dd className="mt-2 text-[13px] font-medium leading-relaxed text-charcoal-mid">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Contact CTA */}
      <div className="rounded-2xl bg-brand-light/50 p-6 text-center">
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
