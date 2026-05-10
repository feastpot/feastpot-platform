import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Help &amp; FAQ',
  description: 'Help, FAQ and contact information for Feastpot customers and vendors.',
  alternates: { canonical: '/help' },
};

interface FaqSection {
  heading: string;
  items: { question: string; answer: string }[];
}

const SECTIONS: FaqSection[] = [
  {
    heading: 'Ordering',
    items: [
      {
        question: 'How do I place an order?',
        answer:
          'Enter your postcode on the homepage, browse vendors covering your area, add items to your basket and check out with a card via Stripe.',
      },
      {
        question: 'Can I order from more than one vendor in the same basket?',
        answer:
          'No — to keep delivery promises realistic, each basket is for a single vendor. You can place multiple orders in a session if you want food from several kitchens.',
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
    items: [
      {
        question: 'What areas do you deliver to?',
        answer:
          'Each vendor sets their own delivery zone. Enter your postcode on the homepage to see who covers you. We currently focus on Greater London with selected coverage in Birmingham and Manchester.',
      },
      {
        question: 'How do I track my order?',
        answer:
          'You can track every order live from the orders page. We also send push notifications and (if you opt in) WhatsApp updates at key milestones.',
      },
      {
        question: 'What if my driver is late?',
        answer:
          'Open the order page and tap "Contact vendor" — they can give you a live update. If you do not get a reply within 15 minutes, raise a dispute and our support team will step in.',
      },
    ],
  },
  {
    heading: 'Refunds',
    items: [
      {
        question: 'How do refunds work?',
        answer:
          'Raise a dispute from the order page within 24 hours of delivery, including photos or vendor messages where relevant. We resolve disputes within one working day. Approved refunds reach your card in 5 business days.',
      },
      {
        question: 'Will I be charged if I cancel?',
        answer:
          'No — cancellations made before the vendor accepts the order are refunded in full and immediately released by Stripe. Cancellations after acceptance are case-by-case depending on prep stage.',
      },
    ],
  },
  {
    heading: 'Allergens',
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
    items: [
      {
        question: 'How do I sign up as a vendor?',
        answer:
          'Email partners@feastpot.co.uk with your business name, food hygiene rating and the cuisines you cook. We onboard new vendors weekly.',
      },
      {
        question: 'When do I get paid?',
        answer:
          'Vendor payouts run weekly, every Monday, via Stripe Connect. Feastpot deducts a 12% commission from each order subtotal.',
      },
      {
        question: 'What documents do I need to submit?',
        answer:
          'Food hygiene rating certificate, public liability insurance, proof of identity, allergen training certificate, and a Stripe Connect onboarding completion. The vendor portal walks you through each step.',
      },
    ],
  },
];

export default function HelpPage() {
  // Surfaced via env so support routing can change (rota handover, new number,
  // a different inbox per market) without a code deploy.
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '+447000000000';
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@feastpot.co.uk';
  // wa.me requires the digits-only form (no +, no spaces).
  const whatsappDigits = whatsapp.replace(/\D/g, '');

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14">
      <h1 className="text-3xl font-bold text-foreground">Help &amp; FAQ</h1>
      <p className="mt-3 text-base text-muted-foreground">
        Most answers are below. If you can&rsquo;t find what you need, our support team is happy to help.
      </p>

      <div className="mt-8 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Email support</h2>
          <a href={`mailto:${supportEmail}`} className="mt-1 block text-base font-medium text-brand">
            {supportEmail}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">Reply within 24 hours, 7 days a week.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">WhatsApp</h2>
          <a
            href={`https://wa.me/${whatsappDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-base font-medium text-brand"
          >
            WhatsApp: {whatsapp}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">Faster for live order issues, 9am–9pm.</p>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="text-2xl font-semibold text-foreground">{section.heading}</h2>
          <dl className="mt-4 space-y-4">
            {section.items.map((item) => (
              <div key={item.question} className="rounded-lg border border-border p-4">
                <dt className="font-semibold text-foreground">{item.question}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="mt-12 rounded-lg bg-brand p-6 text-white">
        <h2 className="text-xl font-semibold">Need to raise a dispute?</h2>
        <p className="mt-1 text-sm text-white/90">
          Open the order page and tap &ldquo;Raise a dispute&rdquo;. We resolve disputes within one working day.
        </p>
        <Link
          href="/orders"
          className="mt-4 inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-brand hover:bg-white/90"
        >
          Go to my orders
        </Link>
      </section>
    </article>
  );
}
