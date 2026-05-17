import { Star } from 'lucide-react';

/**
 * "SOCIAL PROOF WITHOUT FAKE AVAILABILITY — Loved by communities
 * across London." Four customer review teasers. Quotes are
 * intentionally short and area-coded (postcode prefixes) so the
 * social proof reads as genuinely local rather than generic
 * marketplace blurb.
 */
const REVIEWS = [
  { quote: 'The egusi tasted exactly like home.', author: 'Grace, SE15' },
  { quote: 'The party tray fed 30 people.', author: 'David, SW9' },
  { quote: 'The small chops disappeared in 10 minutes.', author: 'Sade, N17' },
  { quote: 'Proper Caribbean food, not watered down.', author: 'Winston, SW2' },
] as const;

export function CommunityReviews() {
  return (
    <section
      aria-labelledby="reviews-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
        Social proof without fake availability
      </p>
      <h2
        id="reviews-heading"
        className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
      >
        Loved by communities across London
      </h2>
      <p className="mt-1 text-[14px] font-medium text-charcoal-mid">
        Review teasers build confidence without showing vendors before postcode
        search.
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REVIEWS.map(({ quote, author }) => (
          <li
            key={author}
            className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
          >
            <div className="flex gap-0.5" aria-label="Five stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="h-4 w-4 fill-plantain text-plantain"
                  aria-hidden
                />
              ))}
            </div>
            <p className="font-display text-[15px] font-black leading-snug text-charcoal">
              &ldquo;{quote}&rdquo;
            </p>
            <p className="text-[12.5px] font-medium text-charcoal-mid">
              — {author}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
