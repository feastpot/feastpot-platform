import { Gift, Sparkles } from 'lucide-react';
import Link from 'next/link';

/**
 * Wireframe 1 closing CTA strip — split card with FeastPass (left, green)
 * and Refer-a-friend (right, gold). The two stack on mobile.
 *
 * "Try FeastPass" routes to /account/feastpass (placeholder route — wire
 * proper trial flow in a follow-up wave); "Invite now" deep-links into the
 * referral card on /account, which already exposes the share code via the
 * ReferralCard component.
 *
 * NOTE: There is no FeastPass subscription product live yet, so the LEFT
 * half intentionally talks about benefits without naming a price. Once
 * FeastPass ships, swap the CTA to the real signup route.
 */
export function FeastPassStrip() {
  return (
    <section
      aria-labelledby="feastpass-heading"
      className="mx-4 mt-10 grid overflow-hidden rounded-3xl shadow-card md:mx-0 md:grid-cols-2"
    >
      {/* LEFT — FeastPass green panel */}
      <div className="bg-brand p-6 text-white md:p-7">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-plantain" aria-hidden />
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">
            feastpass
          </p>
        </div>
        <h3
          id="feastpass-heading"
          className="mt-3 text-2xl font-black leading-tight md:text-[28px]"
        >
          Unlimited free delivery
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-white/85">
          Exclusive offers and member-only perks across every kitchen.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal px-5 text-sm font-bold text-white transition-colors hover:bg-charcoal-mid"
        >
          Try FeastPass
        </Link>
      </div>

      {/* RIGHT — Refer-a-friend gold panel */}
      <div className="bg-plantain p-6 text-charcoal md:p-7">
        <Gift className="h-9 w-9 text-scotch" aria-hidden />
        <h3 className="mt-3 text-2xl font-black leading-tight md:text-[28px]">
          Refer a friend
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-charcoal/85">
          Give £5, get £5. Share the flavour, earn the reward.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal px-5 text-sm font-bold text-white transition-colors hover:bg-charcoal-mid"
        >
          Invite now
        </Link>
      </div>
    </section>
  );
}
