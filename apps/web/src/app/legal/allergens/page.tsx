import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Allergen Information',
  description:
    'Allergen guidance for Feastpot orders — the 14 FSA major allergens, how to filter on the platform, and what to do in an allergic emergency.',
  alternates: { canonical: '/legal/allergens' },
};

/** The 14 major allergens that must be declared under UK food law (FIR / Natasha's Law). */
const ALLERGENS = [
  { name: 'Celery', emoji: '🥬' },
  { name: 'Cereals containing gluten', emoji: '🌾' },
  { name: 'Crustaceans', emoji: '🦐' },
  { name: 'Eggs', emoji: '🥚' },
  { name: 'Fish', emoji: '🐟' },
  { name: 'Lupin', emoji: '🌼' },
  { name: 'Milk', emoji: '🥛' },
  { name: 'Molluscs', emoji: '🐚' },
  { name: 'Mustard', emoji: '🌭' },
  { name: 'Tree nuts', emoji: '🌰' },
  { name: 'Peanuts', emoji: '🥜' },
  { name: 'Sesame seeds', emoji: '🫓' },
  { name: 'Soybeans', emoji: '🫘' },
  { name: 'Sulphur dioxide / sulphites', emoji: '🍷' },
] as const;

export default function AllergensPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14">
      <h1 className="text-3xl font-bold text-foreground">Allergen information</h1>
      <p className="mt-3 text-base text-muted-foreground">
        Every dish on Feastpot displays its allergens. If in doubt, contact the vendor directly before
        ordering — their phone and message link is on the vendor profile page.
      </p>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-foreground">The 14 major allergens</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          UK food law (the Food Information Regulations 2014, with Natasha&rsquo;s Law amendments) requires every
          prepared food to declare these 14 allergens. Each menu item on Feastpot lists which of these it
          contains.
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {ALLERGENS.map((a) => (
            <li
              key={a.name}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <span aria-hidden="true" className="text-2xl">
                {a.emoji}
              </span>
              <span className="text-sm font-medium text-foreground">{a.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-lg border-l-4 border-brand bg-muted/40 p-4">
        <h2 className="text-lg font-semibold text-foreground">Important disclaimer</h2>
        <p className="mt-1 text-sm text-foreground">
          Allergen information on Feastpot is provided by the vendor and is <strong>not independently
          verified</strong> by Feastpot. We require vendors to keep this information accurate and up to date,
          but if you have a severe allergy please always confirm with the vendor before ordering.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-foreground">Filtering by allergen</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>Open the search bar on the homepage and tap <strong>Filters</strong>.</li>
          <li>Toggle the allergens you want to <em>exclude</em> — only menu items free of those allergens will be shown.</li>
          <li>You can also set a default allergen profile in <Link href="/account" className="text-brand underline">your account</Link> so it&rsquo;s applied to every search automatically.</li>
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-foreground">If you have an allergic reaction</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground">
          <li>Mild symptoms (rash, itching): take an antihistamine and monitor.</li>
          <li>
            <strong>Severe symptoms</strong> (swelling of lips/tongue, breathing difficulty, dizziness): use
            your adrenaline auto-injector if prescribed and call <strong>999</strong> immediately.
          </li>
          <li>
            Once safe, please report the incident to us at{' '}
            <a href="mailto:safety@feastpot.co.uk" className="text-brand underline">
              safety@feastpot.co.uk
            </a>{' '}
            so we can investigate with the vendor.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-foreground">More information</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The UK Food Standards Agency publishes excellent guidance for people living with food allergies:{' '}
          <a
            href="https://www.food.gov.uk/safety-hygiene/food-allergy-and-intolerance"
            target="_blank"
            rel="noreferrer"
            className="text-brand underline"
          >
            food.gov.uk/safety-hygiene/food-allergy-and-intolerance
          </a>
          .
        </p>
      </section>
    </article>
  );
}
