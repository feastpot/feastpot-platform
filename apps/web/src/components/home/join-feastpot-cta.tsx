/**
 * "Cook from home? Join FeastPot." Soft green-tinted recruitment bar
 * sitting just above the footer. The customer PWA's only outbound
 * link to the vendor portal — stays visible without overpowering the
 * primary buyer flow above it.
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
        <a
          href={`${process.env.NEXT_PUBLIC_VENDOR_URL ?? 'https://vendor.feastpot.co.uk'}/onboarding/register`}
          className="shrink-0 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
        >
          Join FeastPot
        </a>
      </div>
    </section>
  );
}
