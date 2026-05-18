'use client';

/**
 * Horizontal scrolling strip of short customer quotes - sits directly below
 * the PostcodeHero on the homepage as social proof.
 *
 * Loop technique: render the array twice and translate by -50% over 40s. As
 * long as both copies are identical the seam is invisible. We pause the
 * animation when the user prefers reduced motion (handled via Tailwind's
 * `motion-reduce:` variant in case anyone ever extends this).
 *
 * Quotes are CURATED MARKETING COPY today - there is no public reviews
 * digest endpoint to pull from. When the API exposes one, swap the static
 * array for an SSR fetch with `revalidate: 600` and keep the doubling here.
 */
const REVIEWS = [
  { quote: 'Best Jollof in London 🔥', name: 'Grace', area: 'SE15' },
  { quote: 'Party tray fed 30 people - flawless delivery', name: 'David', area: 'SW9' },
  { quote: 'Finally! Authentic egusi that tastes like home', name: 'Amara', area: 'SE18' },
  { quote: "Ordered for my mum's birthday - she cried 😭❤️", name: 'Kofi', area: 'CR0' },
  { quote: 'The small chops were gone in 10 minutes', name: 'Sade', area: 'N17' },
  { quote: 'Proper Caribbean food, not watered down 🙏', name: 'Winston', area: 'SW2' },
];

export function ReviewsMarquee() {
  // Doubling means the second copy slides in as the first slides out -
  // translateX(-50%) lands exactly where the page started.
  const doubled = [...REVIEWS, ...REVIEWS];

  return (
    <div
      className="overflow-hidden border-y border-cream-deep bg-cream-warm py-3"
      aria-label="What customers are saying"
    >
      <div
        className="flex gap-3 animate-[marquee_40s_linear_infinite] motion-reduce:animate-none"
        style={{ width: 'max-content' }}
      >
        {doubled.map((r, i) => (
          <div
            key={i}
            className="flex shrink-0 items-center gap-2 rounded-full border border-cream-deep bg-white px-4 py-2 shadow-card"
            // Hide duplicates from screen readers so the list isn't read twice.
            aria-hidden={i >= REVIEWS.length || undefined}
          >
            <span className="text-plantain" aria-hidden>★★★★★</span>
            <span className="text-xs font-medium italic text-charcoal">&ldquo;{r.quote}&rdquo;</span>
            <span className="text-[10px] font-medium text-charcoal-mid">- {r.name}, {r.area}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
