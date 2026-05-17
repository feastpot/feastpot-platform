import { Lock, MapPin, ShieldCheck, Utensils } from 'lucide-react';

/**
 * "HIGHER VALUE, LOWER FRICTION — No more chasing Instagram DMs or
 * uncertain bank transfers." Two-up section: long-form copy block on
 * the left, 2×2 grid of credibility cards on the right.
 */
const BENEFITS = [
  {
    Icon: ShieldCheck,
    tone: 'brand',
    title: 'Trusted local cooks',
    sub: 'Verified profiles, ratings and support.',
  },
  {
    Icon: Utensils,
    tone: 'plantain',
    title: 'Proper portions',
    sub: 'Family pots, party trays and event food.',
  },
  {
    Icon: Lock,
    tone: 'scotch',
    title: 'Secure checkout',
    sub: 'No screenshot-based payment stress.',
  },
  {
    Icon: MapPin,
    tone: 'brand',
    title: 'Area-aware results',
    sub: 'No vendors until postcode is known.',
  },
] as const;

const TONE: Record<(typeof BENEFITS)[number]['tone'], string> = {
  brand: 'bg-brand-light text-brand',
  plantain: 'bg-plantain/15 text-[#8a6a00]',
  scotch: 'bg-scotch/10 text-scotch',
};

export function InstagramDmsBlock() {
  return (
    <section
      aria-labelledby="instagram-dms-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <div className="grid gap-8 rounded-3xl bg-cream-warm/60 p-6 sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-10">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-scotch">
            Higher value, lower friction
          </p>
          <h2
            id="instagram-dms-heading"
            className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-[30px]"
          >
            No more chasing Instagram DMs or uncertain bank transfers.
          </h2>
          <p className="mt-4 max-w-md text-[14px] font-medium leading-relaxed text-charcoal-mid">
            FeastPot makes cultural food ordering feel safer, faster and
            clearer. See only cooks that can deliver to your postcode, then
            order through secure checkout.
          </p>
          <a
            href="#hero-headline"
            className="mt-5 inline-flex items-center rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
          >
            See what delivers to me
          </a>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BENEFITS.map(({ Icon, tone, title, sub }) => (
            <li
              key={title}
              className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl ${TONE[tone]}`}
                aria-hidden
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <p className="font-display text-[15px] font-black text-charcoal">
                {title}
              </p>
              <p className="text-[12.5px] font-medium leading-snug text-charcoal-mid">
                {sub}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
