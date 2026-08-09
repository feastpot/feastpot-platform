/**
 * "POPULAR FOOD - African & Caribbean favourites on Feastpot." A
 * tonal pill cloud of cuisine teasers. Tapping a pill navigates to
 * /vendors?cuisine=<slug> so the cuisine filter is pre-applied.
 * /vendors still requires a postcode before surfacing vendor results,
 * preserving the postcode-first discovery rule.
 */
const PILLS = [
  { label: 'Nigerian jollof', tone: 'brand', cuisine: 'Nigerian' },
  { label: 'Ghanaian waakye', tone: 'plantain', cuisine: 'Ghanaian' },
  { label: 'Jamaican jerk', tone: 'scotch', cuisine: 'Jamaican' },
  { label: 'Caribbean curry goat', tone: 'brand', cuisine: 'Caribbean' },
  { label: 'Egusi soup', tone: 'plantain', cuisine: 'Nigerian' },
  { label: 'Small chops', tone: 'scotch', cuisine: 'Nigerian' },
  { label: 'Rice and peas', tone: 'plantain', cuisine: 'Caribbean' },
  { label: 'Suya', tone: 'plantain', cuisine: 'Nigerian' },
  { label: 'Oxtail', tone: 'scotch', cuisine: 'Caribbean' },
  { label: 'Fried plantain', tone: 'brand', cuisine: 'African' },
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
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">Popular food</p>
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
        Tap a dish to start browsing. You&rsquo;ll enter your postcode first so we can show who
        delivers to you.
      </p>

      <ul className="mt-5 flex flex-wrap gap-2.5">
        {PILLS.map(({ label, tone, cuisine }) => (
          <li key={label}>
            <a
              href={`/vendors?cuisine=${encodeURIComponent(cuisine)}`}
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
