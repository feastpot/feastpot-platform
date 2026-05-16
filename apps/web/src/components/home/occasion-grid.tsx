import { CalendarHeart, ChevronRight, PartyPopper, Soup, Sparkles, Users, Utensils } from 'lucide-react';
import Link from 'next/link';

/**
 * Wireframe 1 "Order for any occasion" — 5-card occasion picker. Each card is
 * a softly-tinted square with an icon chip and a two-line label, all linking
 * into /vendors with a `q=` hint so the search page can preselect the right
 * cuisine/category facet (Wave 2 will wire the matching server-side filter).
 *
 * Five categories matches the wireframe; on mobile they wrap to a 2-up grid
 * with the 5th card spanning two columns for balance.
 */
const OCCASIONS = [
  { Icon: Utensils, title: 'Lunch', sub: 'Quick & tasty', tone: 'green', q: 'lunch' },
  { Icon: Soup, title: 'Dinner', sub: 'Hearty & satisfying', tone: 'red', q: 'dinner' },
  { Icon: Sparkles, title: 'Weekend vibes', sub: 'Treat yourself', tone: 'gold', q: 'weekend' },
  { Icon: Users, title: 'Group orders', sub: 'Feed the crew', tone: 'green', q: 'group' },
  { Icon: PartyPopper, title: 'Events & parties', sub: 'Make it special', tone: 'red', q: 'events' },
] as const;

const TONE_CLASSES: Record<(typeof OCCASIONS)[number]['tone'], string> = {
  green: 'bg-brand-light text-brand',
  gold: 'bg-plantain/10 text-plantain',
  red: 'bg-scotch/10 text-scotch',
};

export function OccasionGrid() {
  return (
    <section aria-labelledby="occasion-heading" className="px-4 pt-8 md:px-0 md:pt-12">
      <header className="mb-4 flex items-end justify-between gap-2">
        <h2 id="occasion-heading" className="text-lg font-black text-charcoal md:text-xl">
          Order for any occasion
        </h2>
        <Link
          href="/vendors"
          className="inline-flex items-center gap-0.5 text-sm font-bold text-brand transition-colors hover:text-brand-dark"
        >
          View all
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {OCCASIONS.map(({ Icon, title, sub, tone, q }, i) => (
          <li
            key={title}
            className={i === OCCASIONS.length - 1 && OCCASIONS.length % 2 === 1 ? 'col-span-2 md:col-span-1' : ''}
          >
            <Link
              href={`/vendors?q=${q}`}
              className="group flex h-full flex-col gap-3 rounded-3xl border border-cream-deep bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg"
            >
              <span
                className={`grid h-12 w-12 place-items-center rounded-2xl ${TONE_CLASSES[tone]}`}
                aria-hidden
              >
                <Icon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <div>
                <p className="text-[14px] font-bold leading-tight text-charcoal">{title}</p>
                <p className="mt-0.5 text-[12px] font-medium leading-tight text-charcoal-mid">
                  {sub}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
