import type { Metadata } from 'next';

import {
  LegalBadge,
  LegalContact,
  LegalContentWrapper,
  LegalHero,
  LegalLink,
  LegalPageShell,
  LegalQuickNav,
  LegalSection,
  LegalTrustStrip,
  legalListStyle,
  legalOrderedListStyle,
} from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Allergen Information',
  description:
    'Allergen guidance for Feastpot orders, the 14 FSA major allergens, how to filter on the platform, and what to do in an allergic emergency.',
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

const QUICK_NAV = [
  { label: 'The 14 allergens', href: '#fourteen' },
  { label: 'Disclaimer', href: '#disclaimer' },
  { label: 'Filtering', href: '#filtering' },
  { label: 'Reactions', href: '#reactions' },
  { label: 'More info', href: '#more' },
  { label: 'Contact', href: '#contact' },
];

export default function AllergensPage() {
  return (
    <LegalPageShell>
      <LegalHero
        title="Allergen information"
        lede={
          <>
            Every dish on Feastpot displays its allergens. If in doubt, contact the vendor
            directly before ordering, their phone and message link is on the vendor
            profile page.
          </>
        }
        badge={
          <LegalBadge
            tone="scotch"
            icon="🚨"
            title="Severe allergic reaction?"
            body={
              <>
                Use your auto-injector if prescribed and call <strong>999</strong>{' '}
                immediately.
              </>
            }
          />
        }
        footnote={<>Last updated: May 2026 &middot; FIR 2014 &amp; Natasha&rsquo;s Law (PPDS 2021)</>}
      />

      <LegalQuickNav ariaLabel="Allergen information sections" items={QUICK_NAV} />

      <LegalContentWrapper>
        <LegalSection id="fourteen" icon="📋" title="1. The 14 major allergens">
          <p>
            UK food law (the Food Information Regulations 2014, with Natasha&rsquo;s Law
            amendments) requires every prepared food to declare these 14 allergens. Each menu
            item on Feastpot lists which of these it contains.
          </p>
          <ul className="mt-3 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 md:grid-cols-4">
            {ALLERGENS.map((a) => (
              <li
                key={a.name}
                className="flex items-center gap-2 rounded-2xl border border-cream-deep bg-cream-warm p-2.5"
              >
                <span aria-hidden className="shrink-0 text-xl">
                  {a.emoji}
                </span>
                <span className="text-xs font-bold text-charcoal">{a.name}</span>
              </li>
            ))}
          </ul>
        </LegalSection>

        <LegalSection id="disclaimer" icon="⚠️" title="2. Important disclaimer">
          <p>
            Allergen information on Feastpot is provided by the vendor and is{' '}
            <strong>not independently verified</strong> by Feastpot. We require vendors to keep
            this information accurate and up to date, but if you have a severe allergy please
            always confirm with the vendor before ordering.
          </p>
        </LegalSection>

        <LegalSection id="filtering" icon="🔎" title="3. Filtering by allergen">
          <ol style={legalOrderedListStyle}>
            <li>
              Open the search bar on the homepage and tap <strong>Filters</strong>.
            </li>
            <li>
              Toggle the allergens you want to <em>exclude</em>, only menu items free of
              those allergens will be shown.
            </li>
            <li>
              You can also set a default allergen profile in{' '}
              <LegalLink href="/account">your account</LegalLink> so it&rsquo;s applied to every
              search automatically.
            </li>
          </ol>
        </LegalSection>

        <LegalSection id="reactions" icon="🚑" title="4. If you have an allergic reaction">
          <ul style={legalListStyle}>
            <li>Mild symptoms (rash, itching): take an antihistamine and monitor.</li>
            <li>
              <strong>Severe symptoms</strong> (swelling of lips/tongue, breathing difficulty,
              dizziness): use your adrenaline auto-injector if prescribed and call{' '}
              <strong>999</strong> immediately.
            </li>
            <li>
              Once safe, please report the incident to us at{' '}
              <LegalLink href="mailto:safety@feastpot.co.uk">safety@feastpot.co.uk</LegalLink> so
              we can investigate with the vendor.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="more" icon="📚" title="5. More information">
          <p>
            The UK Food Standards Agency publishes excellent guidance for people living with food
            allergies:{' '}
            <LegalLink
              href="https://www.food.gov.uk/safety-hygiene/food-allergy-and-intolerance"
              external
            >
              food.gov.uk/safety-hygiene/food-allergy-and-intolerance
            </LegalLink>
            .
          </p>
        </LegalSection>

        <LegalContact
          number="6"
          title="Contact"
          email="safety@feastpot.co.uk"
          subject="Allergen enquiry"
          body={
            <>
              Subject line: &ldquo;Allergen enquiry&rdquo;.
              <br />
              For incident reports we aim to acknowledge within 24 hours.
            </>
          }
        />

        <LegalTrustStrip />
      </LegalContentWrapper>
    </LegalPageShell>
  );
}
