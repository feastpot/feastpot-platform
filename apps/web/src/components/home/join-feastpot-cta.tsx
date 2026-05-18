import Link from 'next/link';

/**
 * "Cook from home? Join FeastPot." Soft green-tinted recruitment bar
 * sitting just above the footer. Routes prospective cooks to the
 * public acquisition page on the customer site - the vendor portal
 * URL is intentionally absent from all public chrome.
 */
export function JoinFeastpotCta() {
  return (
    <section
      aria-label="Cook recruitment"
      className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14"
    >
      <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-brand-100 bg-brand-light/60 p-6 md:flex-row md:items-center md:p-7">
        <div className="min-w-0">
          <p className="font-display text-lg font-black text-charcoal sm:text-xl">
            Cook from home? Join FeastPot
          </p>
          <p className="mt-1 max-w-xl text-[13px] font-medium leading-snug text-charcoal-mid sm:text-sm">
            Sell party trays, family pots and weekly meals to customers near
            you. Keep your food business moving without chasing DMs.
          </p>
        </div>
        <Link
          href="/become-a-vendor"
          className="shrink-0 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
        >
          Join FeastPot
        </Link>
      </div>
    </section>
  );
}
