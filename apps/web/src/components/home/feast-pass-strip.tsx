import { Gift } from 'lucide-react';
import Link from 'next/link';

/**
 * Closing dual-panel CTA — FeastPass green panel on the left and
 * "Give £5, get £5" referral panel on the right, matching the
 * wireframe. Both CTAs intentionally route back to the hero so the
 * user enters their postcode first: FeastPass eligibility is
 * coverage-dependent and the referral reward only unlocks once
 * delivery is confirmed.
 */
export function FeastPassStrip() {
  return (
    <section
      aria-label="FeastPass and referral promos"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <div className="grid overflow-hidden rounded-3xl shadow-card md:grid-cols-2">
        {/* LEFT — FeastPass */}
        <div className="bg-brand p-7 text-white md:p-9">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
            FeastPass
          </span>
          <h3 className="mt-5 font-display text-2xl font-black leading-tight md:text-[28px]">
            Unlimited free delivery where available
          </h3>
          <p className="mt-3 max-w-md text-[14px] font-medium leading-relaxed text-white/85">
            Enter your postcode first so FeastPot can check if FeastPass
            applies to kitchens near you.
          </p>
          <a
            href="#hero-headline"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal px-5 text-sm font-bold text-white transition-colors hover:bg-charcoal-mid"
          >
            Check availability
          </a>
        </div>

        {/* RIGHT — referral */}
        <div className="bg-plantain p-7 text-charcoal md:p-9">
          <Gift className="h-9 w-9 text-scotch" aria-hidden />
          <h3 className="mt-3 font-display text-2xl font-black leading-tight md:text-[28px]">
            Give £5, get £5
          </h3>
          <p className="mt-3 max-w-md text-[14px] font-medium leading-relaxed text-charcoal/85">
            Invite friends after your first order. Referral rewards unlock when
            delivery is available.
          </p>
          <Link
            href="/account"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal px-5 text-sm font-bold text-white transition-colors hover:bg-charcoal-mid"
          >
            Enter postcode first
          </Link>
        </div>
      </div>
    </section>
  );
}
