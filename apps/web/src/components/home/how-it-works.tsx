import { MapPin, ShoppingCart, Truck } from 'lucide-react';

const STEPS = [
  { Icon: MapPin, title: 'Enter postcode', desc: 'Find authentic vendors near you' },
  { Icon: ShoppingCart, title: 'Choose your tray', desc: 'Full trays, frozen packs, party orders' },
  { Icon: Truck, title: 'Scheduled delivery', desc: 'Delivered when you need it' },
] as const;

/**
 * Three-step explainer block. Cream-warm panel inset from the page edges so it
 * visually separates from the white vendor rails above and below without
 * needing a heavy divider. Icon chips use the brand-light pill convention
 * shared with TrustStripCard / OccasionGrid.
 */
export function HowItWorks() {
  return (
    <section className="mx-4 my-3 rounded-2xl border border-cream-deep bg-cream-warm px-4 py-5">
      <h2 className="mb-4 text-center font-display text-[15px] font-black text-charcoal">
        How Feastpot works
      </h2>
      <ol className="flex gap-3">
        {STEPS.map(({ Icon, title, desc }) => (
          <li key={title} className="flex flex-1 flex-col items-center text-center">
            <span
              className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-light"
              aria-hidden
            >
              <Icon className="h-5 w-5 text-brand" strokeWidth={2.25} />
            </span>
            <div className="text-xs font-bold text-charcoal">{title}</div>
            <div className="mt-0.5 text-[10px] font-medium leading-tight text-charcoal-mid">
              {desc}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
