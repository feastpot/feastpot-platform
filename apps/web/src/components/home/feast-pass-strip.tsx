import { Gift } from 'lucide-react';
import Link from 'next/link';

/**
 * Closing CTA - "Give £5, get £5" referral panel. The CTA routes to the
 * account page because the referral reward only unlocks once the user has
 * placed their first delivered order.
 *
 * (A FeastPass "unlimited free delivery" panel used to sit alongside this
 * one, but FeastPass is not an available product yet, so it was removed
 * rather than advertise something customers can't get.)
 */
export function FeastPassStrip() {
  return (
    <section
      aria-label="Referral promo"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <div className="overflow-hidden rounded-3xl bg-plantain p-7 text-charcoal shadow-card md:p-9">
        <Gift className="h-9 w-9 text-scotch" aria-hidden />
        <h3 className="mt-3 font-display text-2xl font-black leading-tight md:text-[28px]">
          Give £5, get £5
        </h3>
        <p className="mt-3 max-w-md text-[14px] font-medium leading-relaxed text-charcoal/85">
          Invite friends after your first order. Referral rewards unlock when delivery is available.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal px-5 text-sm font-bold text-white transition-colors hover:bg-charcoal-mid"
        >
          Get your referral link
        </Link>
      </div>
    </section>
  );
}
