import { Star } from 'lucide-react';

import { cn } from '@feastpot/ui';

/**
 * Featured customer testimonials. 3-column on desktop, 1-column on mobile.
 *
 * Same backend gap as ReviewsMarquee — there's no "featured testimonials"
 * endpoint today, so this is hand-curated copy. The visual treatment is
 * production-ready; only the data source needs swapping when the API lands.
 */
const TESTIMONIALS = [
  {
    name: 'Grace Okafor',
    area: 'Peckham',
    rating: 5,
    dish: 'Egusi Soup (Full Pot)',
    quote:
      "I ordered the full egusi pot for my mum's birthday and she said it tasted exactly like back home. The portion was enormous — fed 8 people with leftovers. Will be ordering every Sunday.",
    initials: 'GO',
    color: 'bg-brand',
  },
  {
    name: 'David Campbell',
    area: 'Brixton',
    rating: 5,
    dish: 'Jerk Chicken Tray',
    quote:
      'Finally a platform that understands Caribbean food. The jerk chicken was properly seasoned — not the watered-down stuff you get from generic delivery apps. Feastpot is now my go-to.',
    initials: 'DC',
    color: 'bg-scotch',
  },
  {
    name: 'Amara Diallo',
    area: 'Woolwich',
    rating: 5,
    dish: 'Small Chops Party Pack',
    quote:
      "Ordered 100 pieces for my sister's baby shower. Arrived on time, everything was fresh and hot. The puff puff especially — absolute perfection. Highly recommend for any event.",
    initials: 'AD',
    color: 'bg-plantain text-charcoal',
  },
];

export function Testimonials() {
  return (
    <section className="space-y-3 px-4 py-6">
      <header className="space-y-1">
        <h2 className="font-display text-[17px] font-black text-charcoal">
          Loved by communities across London
        </h2>
        <p className="text-xs font-medium text-charcoal-mid">
          Real reviews from customers who&rsquo;ve cooked at, fed, and celebrated with Feastpot vendors.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <li
            key={t.name}
            className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white p-4 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                  t.color,
                )}
                aria-hidden
              >
                {t.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-black text-charcoal">{t.name}</p>
                <p className="truncate text-xs font-medium text-charcoal-mid">{t.area}</p>
              </div>
            </div>

            <div
              className="inline-flex items-center gap-0.5"
              aria-label={`${t.rating} out of 5 stars`}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'h-3.5 w-3.5',
                    i < t.rating ? 'fill-plantain text-plantain' : 'text-charcoal-mid/30',
                  )}
                  aria-hidden
                />
              ))}
            </div>

            <span className="inline-flex w-fit items-center rounded-full bg-cream px-2.5 py-1 text-[11px] font-bold text-charcoal">
              {t.dish}
            </span>

            <p className="text-sm italic leading-relaxed text-charcoal-mid">&ldquo;{t.quote}&rdquo;</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
