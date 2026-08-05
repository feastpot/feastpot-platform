import type { Metadata } from 'next';
import Link from 'next/link';

import { TrustStandard } from '@/components/home/trust-standard';

export const metadata: Metadata = {
  title: 'Get Your Food Business Ready for Orders | Feastpot',
  description:
    'Feastpot guides African and Caribbean food vendors through the steps to becoming order ready, from food business registration to allergen information and hygiene evidence.',
  alternates: {
    canonical: 'https://feastpot.co.uk/vendor-readiness',
  },
};

const READINESS_STEPS = [
  {
    n: 1,
    title: 'Register your food business with your local authority',
    body: 'All food businesses operating in the UK must register with their local authority at least 28 days before trading. Registration is free and cannot be refused. You register where the food is prepared, not where it is delivered.',
  },
  {
    n: 2,
    title: 'Prepare your kitchen and process evidence',
    body: 'Inspectors will want to see that your kitchen is clean, that food is stored safely, and that you have a documented food safety management system. Take photos of your setup and keep records of cleaning schedules and temperature logs.',
  },
  {
    n: 3,
    title: 'Complete food hygiene training',
    body: 'A Level 2 Award in Food Safety in Catering (or equivalent) is the recognised standard for home-based and small food businesses. Many providers offer it online at low cost. Keep your certificate safe.',
  },
  {
    n: 4,
    title: 'Prepare your allergen information',
    body: 'UK food law requires you to declare the 14 major allergens in every dish you sell. Write down every ingredient in each dish, identify which allergens are present, and have a process for handling allergy queries from customers before they order.',
  },
  {
    n: 5,
    title: 'Prepare your menu and labels',
    body: 'Write clear dish names, accurate ingredient lists and any preparation notes customers need (such as "contains nuts" or "made in a kitchen that handles dairy"). Clear labels help customers make safe choices and reduce the risk of disputes.',
  },
  {
    n: 6,
    title: 'Get inspection ready',
    body: 'Before your local authority inspection, run through the Food Standards Agency (FSA) Safer Food Better Business pack. Have your food safety management records up to date, your temperature probe calibrated, and your storage areas organised.',
  },
  {
    n: 7,
    title: 'Upload your evidence to your Feastpot profile',
    body: 'Once you are approved as a Feastpot vendor, upload your hygiene registration number, food safety certificate and any relevant accreditations to your profile. This evidence appears on your public profile and builds trust with customers.',
  },
] as const;

const WHO_IT_IS_FOR = [
  {
    label: 'Home cooks',
    detail: 'Cooking from your residential kitchen for family, neighbours and local customers',
  },
  {
    label: 'Caterers',
    detail: 'Preparing food for events, celebrations, office lunches and parties',
  },
  {
    label: 'Meal prep vendors',
    detail: 'Portioning weekly meals for regular customers who want home food on demand',
  },
  {
    label: 'Party tray sellers',
    detail: 'Producing jollof, rice dishes, small chops and sides in bulk for gatherings',
  },
] as const;

export default function VendorReadinessPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-10">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          Vendor resources
        </p>
        <h1 className="mt-2 font-display text-[32px] font-black leading-[1.08] tracking-tight text-charcoal sm:text-[40px]">
          Get your food business ready for orders
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] font-medium leading-relaxed text-charcoal-mid">
          Feastpot helps African and Caribbean food vendors understand the steps to becoming order
          ready, from food business registration to allergen information and hygiene evidence.
        </p>
      </header>

      {/* Disclaimer — prominent, not in small print */}
      <div className="mb-10 rounded-2xl border-2 border-plantain/60 bg-plantain/10 p-5">
        <p className="text-[14px] font-bold leading-relaxed text-charcoal">
          Feastpot can guide vendors through readiness steps. Registration, inspection and ratings
          are handled by your local authority, not by Feastpot.
        </p>
      </div>

      {/* Who it is for */}
      <section aria-labelledby="who-heading" className="mb-12">
        <h2
          id="who-heading"
          className="mb-4 font-display text-[22px] font-black leading-tight text-charcoal"
        >
          Who this is for
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WHO_IT_IS_FOR.map(({ label, detail }) => (
            <li
              key={label}
              className="rounded-2xl border border-cream-deep bg-white p-4 shadow-card"
            >
              <p className="font-display text-[15px] font-black text-charcoal">{label}</p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-charcoal-mid">
                {detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Seven-step readiness checklist */}
      <section aria-labelledby="checklist-heading" className="mb-12">
        <h2
          id="checklist-heading"
          className="mb-6 font-display text-[22px] font-black leading-tight text-charcoal"
        >
          Your seven-step readiness checklist
        </h2>
        <ol className="space-y-4">
          {READINESS_STEPS.map((step) => (
            <li
              key={step.n}
              className="flex gap-4 rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-black text-white"
              >
                {step.n}
              </span>
              <div>
                <p className="font-display text-[15px] font-black text-charcoal">{step.title}</p>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-charcoal-mid">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust standard */}
      <div className="-mx-4 mb-10 sm:-mx-6 lg:-mx-8">
        <TrustStandard />
      </div>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-light/50 p-6 text-center sm:p-8">
        <h2 className="font-display text-[22px] font-black text-charcoal">
          Ready to start your application?
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] font-medium text-charcoal-mid">
          Once you have worked through the checklist above, submit your vendor application and we
          will review it within 1 to 2 business days.
        </p>
        <Link
          href="/become-a-vendor"
          className="mt-5 inline-flex items-center rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
        >
          Start your vendor application
        </Link>
      </section>
    </main>
  );
}
