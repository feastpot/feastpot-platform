'use client';

import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { writeCoverageCookie, writeStoredPostcode } from '@/lib/postcode';

/**
 * Wireframe hero banner for /vendors - a soft cream/green plate carrying the
 * "Delivering to {postcode}" pill, the page title, the gate-reassurance
 * subtitle, and a "Change postcode" CTA on the right.
 *
 * "Change postcode" clears both the stored postcode AND the coverage cookie
 * (so the homepage re-gates on the next visit) and routes back to the home
 * hero, which is the canonical postcode-entry point. Without the cookie
 * clear the home page would happily render its full layout off the stale
 * postcode the user just said they want to change.
 */
interface Props {
  postcode: string | null;
}

export function VendorResultsHero({ postcode }: Props) {
  const router = useRouter();

  const handleChange = () => {
    writeStoredPostcode(null);
    writeCoverageCookie(null);
    router.push('/');
  };

  return (
    <section
      aria-labelledby="vendor-results-title"
      className="rounded-3xl border border-brand/15 bg-gradient-to-br from-brand-light/60 via-cream to-cream-warm/60 px-5 py-5 shadow-sm md:px-7 md:py-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          {postcode && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand-dark">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Delivering to {postcode.toUpperCase()}
            </span>
          )}
          <h1
            id="vendor-results-title"
            className="mt-3 font-display text-3xl font-black tracking-tight text-charcoal md:text-4xl"
          >
            Cooks available near you
          </h1>
          <p className="mt-1.5 text-sm font-medium text-charcoal-mid md:text-[15px]">
            Vendors are displayed only after postcode check.
          </p>
        </div>
        {postcode && (
          <button
            type="button"
            onClick={handleChange}
            className="touch-target shrink-0 rounded-2xl border border-cream-deep bg-white px-5 py-2.5 text-sm font-bold text-charcoal shadow-sm transition hover:bg-cream"
          >
            Change postcode
          </button>
        )}
      </div>
    </section>
  );
}
