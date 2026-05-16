import { CreditCard, ShieldCheck, Star, Truck } from 'lucide-react';

/**
 * Wireframe 1 trust strip — white rounded card sitting between the hero and
 * the categories grid, with four pillars: fast delivery / trusted kitchens /
 * top rated / secure payments. Each pillar has a coloured icon chip in the
 * brand palette (green / green / gold / red).
 *
 * Card-shaped (not a full-bleed band) so it floats on the cream body and
 * reads as a distinct credibility row, not a hero closer.
 */
const PILLARS = [
  { Icon: Truck, title: 'Fast delivery', body: 'From local kitchens', tone: 'green' },
  { Icon: ShieldCheck, title: 'Trusted kitchens', body: 'Quality you can trust', tone: 'green' },
  { Icon: Star, title: 'Top rated', body: 'Loved by our community', tone: 'gold' },
  { Icon: CreditCard, title: 'Secure payments', body: 'Safe & secure checkout', tone: 'red' },
] as const;

const TONE_CLASSES: Record<(typeof PILLARS)[number]['tone'], string> = {
  green: 'bg-brand-light text-brand',
  gold: 'bg-plantain/10 text-plantain',
  red: 'bg-scotch/10 text-scotch',
};

export function TrustStripCard() {
  return (
    <section
      aria-label="Why customers trust Feastpot"
      className="mx-4 mt-4 rounded-3xl border border-cream-deep bg-white p-4 shadow-card md:mx-0 md:mt-8 md:p-5"
    >
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-4 md:gap-4">
        {PILLARS.map(({ Icon, title, body, tone }) => (
          <li key={title} className="flex items-center gap-3">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${TONE_CLASSES[tone]}`}
              aria-hidden
            >
              <Icon className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight text-charcoal">{title}</p>
              <p className="mt-0.5 text-[11px] font-medium leading-tight text-charcoal-mid">
                {body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
