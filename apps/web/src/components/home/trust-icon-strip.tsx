import {
  AlertCircle,
  CalendarClock,
  ShieldCheck,
  Star,
  Utensils,
} from 'lucide-react';

/**
 * Five-icon trust strip — sits between the hero and the occasion grid,
 * matching the wireframe's "Verified kitchens · Secure checkout ·
 * Allergen info · Scheduled delivery · Real reviews" row. Each item is
 * an icon + tight two-line copy block on a flat white pill.
 */
const TRUST_ITEMS = [
  {
    Icon: Utensils,
    title: 'Verified kitchens',
    sub: 'All kitchens checked',
    tone: 'brand',
  },
  {
    Icon: ShieldCheck,
    title: 'Secure checkout',
    sub: 'Stripe encrypted',
    tone: 'vendor',
  },
  {
    Icon: AlertCircle,
    title: 'Allergen info',
    sub: 'Clear dish labels',
    tone: 'scotch',
  },
  {
    Icon: CalendarClock,
    title: 'Scheduled delivery',
    sub: 'Plan ahead',
    tone: 'plantain',
  },
  {
    Icon: Star,
    title: 'Real reviews',
    sub: 'Verified customers',
    tone: 'plantain',
  },
] as const;

const TONE: Record<(typeof TRUST_ITEMS)[number]['tone'], string> = {
  brand: 'bg-brand-light text-brand',
  vendor: 'bg-vendor/10 text-vendor',
  scotch: 'bg-scotch/10 text-scotch',
  plantain: 'bg-plantain/15 text-[#8a6a00]',
};

export function TrustIconStrip() {
  return (
    <section
      aria-label="Trust pillars"
      className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8"
    >
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-cream-deep bg-white p-3 shadow-card sm:grid-cols-3 lg:grid-cols-5 lg:gap-3 lg:p-4">
        {TRUST_ITEMS.map(({ Icon, title, sub, tone }) => (
          <li key={title} className="flex items-center gap-3 px-2 py-1.5">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}
              aria-hidden
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight text-charcoal">
                {title}
              </p>
              <p className="mt-0.5 text-[12px] font-medium leading-tight text-charcoal-mid">
                {sub}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
