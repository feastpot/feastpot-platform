/**
 * "REDUCE EFFORT · How FeastPot works" — five numbered steps in green
 * circles. Mirrors the wireframe's horizontal flow on desktop; on
 * mobile each step becomes its own card stacked vertically.
 */
const STEPS = [
  {
    n: 1,
    title: 'Enter your postcode',
    sub: 'This unlocks accurate availability.',
  },
  {
    n: 2,
    title: 'See cooks delivering nearby',
    sub: 'Only relevant kitchens appear.',
  },
  {
    n: 3,
    title: 'Choose your tray or pot',
    sub: 'Party trays, family pots and meal packs.',
  },
  {
    n: 4,
    title: 'Schedule delivery',
    sub: 'Pick the day and time that works.',
  },
  {
    n: 5,
    title: 'Pay securely and track',
    sub: 'Order updates stay visible.',
  },
] as const;

export function HowFeastpotWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
        Reduce effort
      </p>
      <h2
        id="how-it-works-heading"
        className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
      >
        How <span className="text-brand">FeastPot</span> works
      </h2>
      <p className="mt-1 max-w-2xl text-[14px] font-medium text-charcoal-mid">
        No guessing who delivers to you. Enter your postcode first, then browse
        cooks available in your area.
      </p>

      <ol className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        {STEPS.map(({ n, title, sub }) => (
          <li
            key={n}
            className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[13px] font-black text-white"
              aria-hidden
            >
              {n}
            </span>
            <div>
              <p className="font-display text-[14px] font-black leading-snug text-charcoal">
                {title}
              </p>
              <p className="mt-1 text-[12.5px] font-medium leading-snug text-charcoal-mid">
                {sub}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
