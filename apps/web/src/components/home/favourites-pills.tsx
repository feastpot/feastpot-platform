/**
 * "POPULAR FOOD — African & Caribbean favourites on FeastPot." A
 * tonal pill cloud of cuisine teasers. Tapping a pill anchors back
 * to the hero (so the user enters their postcode first) — per the
 * "no vendors before postcode" product rule called out in the
 * wireframe copy.
 */
const PILLS = [
  { label: 'Nigerian jollof', tone: 'brand' },
  { label: 'Ghanaian waakye', tone: 'plantain' },
  { label: 'Jamaican jerk', tone: 'scotch' },
  { label: 'Caribbean curry goat', tone: 'brand' },
  { label: 'Egusi soup', tone: 'plantain' },
  { label: 'Small chops', tone: 'scotch' },
  { label: 'Rice and peas', tone: 'plantain' },
  { label: 'Suya', tone: 'plantain' },
  { label: 'Oxtail', tone: 'scotch' },
  { label: 'Fried plantain', tone: 'brand' },
] as const;

const TONE: Record<(typeof PILLS)[number]['tone'], string> = {
  brand: 'bg-brand-light text-brand hover:bg-brand-light/70',
  plantain: 'bg-plantain/15 text-[#8a6a00] hover:bg-plantain/20',
  scotch: 'bg-scotch/10 text-scotch hover:bg-scotch/15',
};

export function FavouritesPills() {
  return (
    <section
      aria-labelledby="favourites-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
        Popular food
      </p>
      <h2
        id="favourites-heading"
        className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
      >
        <span className="text-brand">African</span> &amp;{' '}
        <span className="text-scotch">Caribbean</span> favourites on{' '}
        {/* Per-letter colours sampled directly from the logo wordmark:
            f=green, e=gold, a=red, s=green, t=gold, p/o/t=charcoal. */}
        <span className="text-brand">F</span>
        <span className="text-plantain">e</span>
        <span className="text-scotch">a</span>
        <span className="text-brand">s</span>
        <span className="text-plantain">t</span>
        <span className="text-charcoal">Pot</span>
      </h2>
      <p className="mt-1 text-[14px] font-medium text-charcoal-mid">
        These cards are teasers only. Clicking one asks for postcode before
        showing delivery availability.
      </p>

      <ul className="mt-5 flex flex-wrap gap-2.5">
        {PILLS.map(({ label, tone }) => (
          <li key={label}>
            <a
              href="#hero-headline"
              className={`inline-flex items-center rounded-full px-4 py-2 text-[13px] font-bold transition-colors ${TONE[tone]}`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
