import {
  Baby,
  Briefcase,
  Building2,
  CakeSlice,
  CalendarHeart,
  ChefHat,
  PartyPopper,
  Soup,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';

/**
 * "What are you ordering for?" — 8-tile occasion grid from the
 * wireframe. Each tile is a soft-tinted card with an icon, label,
 * one-line description and an "Enter postcode →" link that anchors
 * back to the hero (so the user lands on the form with intent
 * preserved). Wave 2 will pass the occasion through as a `q=` param
 * once the search page learns to honour it.
 */
const OCCASIONS = [
  {
    Icon: UtensilsCrossed,
    tone: 'brand',
    title: 'Sunday family meal',
    sub: 'Feed the house without cooking all weekend.',
    q: 'sunday-family-meal',
  },
  {
    Icon: PartyPopper,
    tone: 'scotch',
    title: 'Birthday party trays',
    sub: 'Jollof, jerk, small chops and proper portions.',
    q: 'birthday-party-trays',
  },
  {
    Icon: Baby,
    tone: 'plantain',
    title: 'Baby shower food',
    sub: 'Beautiful trays for family celebrations.',
    q: 'baby-shower-food',
  },
  {
    Icon: Briefcase,
    tone: 'vendor',
    title: 'Office catering',
    sub: 'African & Caribbean lunches for teams.',
    q: 'office-catering',
  },
  {
    Icon: CalendarHeart,
    tone: 'scotch',
    title: 'Weekly meal prep',
    sub: 'Home food, portioned and freezer-friendly.',
    q: 'weekly-meal-prep',
  },
  {
    Icon: CakeSlice,
    tone: 'plantain',
    title: 'Wedding & events',
    sub: 'For weddings, church, funerals and gatherings.',
    q: 'wedding-and-events',
  },
  {
    Icon: ChefHat,
    tone: 'brand',
    title: 'Small chops',
    sub: 'Puff puff, samosa, spring rolls and more.',
    q: 'small-chops',
  },
  {
    Icon: Soup,
    tone: 'scotch',
    title: 'Frozen soup packs',
    sub: 'Stock the freezer with proper home food.',
    q: 'frozen-soup-packs',
  },
] as const;

const TONE: Record<(typeof OCCASIONS)[number]['tone'], string> = {
  brand: 'bg-brand-light text-brand',
  scotch: 'bg-scotch/10 text-scotch',
  plantain: 'bg-plantain/15 text-[#8a6a00]',
  vendor: 'bg-vendor/10 text-vendor',
};

export function OccasionGrid() {
  return (
    <section
      id="what-are-you-ordering-for"
      aria-labelledby="occasion-heading"
      className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            Occasion-first discovery
          </p>
          <h2
            id="occasion-heading"
            className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
          >
            What are you ordering for?
          </h2>
          <p className="mt-1 text-[14px] font-medium text-charcoal-mid">
            Choose the occasion first. We&apos;ll ask for your postcode before
            showing available cooks.
          </p>
        </div>
      </header>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {OCCASIONS.map(({ Icon, tone, title, sub, q }) => (
          <li key={q}>
            <Link
              href={`/?q=${q}#hero-headline`}
              className="group flex h-full flex-col gap-3 rounded-2xl border border-cream-deep bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg"
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl ${TONE[tone]}`}
                aria-hidden
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="font-display text-[15px] font-black text-charcoal">
                  {title}
                </p>
                <p className="mt-1 text-[12.5px] font-medium leading-snug text-charcoal-mid">
                  {sub}
                </p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-[12px] font-bold text-brand">
                Enter postcode <span aria-hidden>›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
