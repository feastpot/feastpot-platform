import Link from 'next/link';

/**
 * Catering entry band - sits between How FeastPot Works and the Instagram DMs
 * section. Invites groups of 20+ to submit a catering enquiry rather than
 * trying to piece together a large order themselves.
 *
 * Uses the existing warm cream tinted panel pattern (bg-cream-warm/60 +
 * rounded-3xl) already established in InstagramDmsBlock.
 */
export function CateringBand() {
  return (
    <section
      aria-labelledby="catering-band-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-cream-warm/60 px-7 py-8 md:flex-row md:items-center md:py-9">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            Catering and events
          </p>
          <h2
            id="catering-band-heading"
            className="mt-1 font-display text-[22px] font-black leading-tight text-charcoal sm:text-[26px]"
          >
            Planning food for 20 or more people?
          </h2>
          <p className="mt-2 max-w-xl text-[14px] font-medium leading-relaxed text-charcoal-mid">
            Tell us what you need and we will help you find suitable vendors for your event.
          </p>
        </div>
        <Link
          href="/catering"
          className="shrink-0 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
        >
          Request catering help
        </Link>
      </div>
    </section>
  );
}
