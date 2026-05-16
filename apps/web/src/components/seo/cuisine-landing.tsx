import Link from 'next/link';

import { searchVendors, type VendorListItem } from '@/lib/api/vendors';

export interface CuisineHighlight {
  name: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface CuisineLandingProps {
  /** Display title for the cuisine, e.g. "Nigerian". */
  cuisine: string;
  /** H1 displayed at the top of the page. */
  heading: string;
  /** Lead paragraph under the H1. */
  intro: string;
  /** Six classic dishes/sections. */
  highlights: CuisineHighlight[];
  /** FAQ rendered at the bottom (good for FAQ rich results). */
  faqs: FaqItem[];
  /**
   * Cuisine slug(s) used to filter the vendor search API. Defaults to a
   * lowercase version of `cuisine`.
   */
  apiCuisines?: string[];
}

const CUSTOMER_REVIEWS = [
  {
    quote:
      'Genuinely the best jollof I have had in London since moving here from Lagos. Tray turned up hot and the timing was spot on.',
    name: 'Adaeze, Peckham',
  },
  {
    quote: 'Ordered for a christening of 40 people. Showed up early, vendor called to confirm. Saved my Sunday.',
    name: 'Marcus, Stratford',
  },
  {
    quote: 'Allergy info was clear, prices were honest, and the kelewele alone has me ordering again next week.',
    name: 'Priya, Tottenham',
  },
];

async function safeFetchVendors(cuisines: string[]): Promise<VendorListItem[]> {
  // Hard timeout so static generation never hangs when the API is
  // unreachable from the build worker (e.g. first deploy before the API
  // is live, or build env with no egress to api.feastpot.co.uk). Without
  // this, fetch can hang past Next.js's per-page static-gen timeout and
  // fail the whole build after 3 retries. The catch falls through to the
  // "we're onboarding new vendors" empty state, which is acceptable copy
  // until the next ISR revalidation picks up real data.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await searchVendors(
      { cuisine: cuisines, sortBy: 'rating', limit: 12 },
      { next: { revalidate: 3600 }, signal: controller.signal },
    );
    return res.data;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Shared template for the three diaspora-cuisine SEO landing pages
 * (Nigerian, Ghanaian, Caribbean). Server component — vendor list is
 * fetched at request time and cached for an hour. The pages target London
 * postcodes, so copy and reviews are intentionally London-flavoured.
 */
export async function CuisineLanding({
  cuisine,
  heading,
  intro,
  highlights,
  faqs,
  apiCuisines,
}: CuisineLandingProps) {
  const vendors = await safeFetchVendors(apiCuisines ?? [cuisine]);

  return (
    <article className="mx-auto w-full max-w-4xl space-y-12 px-4 py-8 md:py-12">
      <header className="space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-dark">London delivery</p>
        <h1 className="font-display text-3xl font-black leading-tight tracking-tight text-charcoal md:text-5xl">{heading}</h1>
        <p className="text-base font-medium text-charcoal-mid md:text-lg">{intro}</p>
      </header>

      <section aria-labelledby="cuisine-highlights">
        <h2 id="cuisine-highlights" className="mb-4 font-display text-2xl font-black tracking-tight text-charcoal">
          What to order
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {highlights.map((h) => (
            <div key={h.name} className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
              <h3 className="font-display text-lg font-black text-charcoal">{h.name}</h3>
              <p className="mt-1 text-sm font-medium text-charcoal-mid">{h.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="rounded-2xl border border-cream-deep bg-cream p-6">
        <h2 id="how-it-works" className="mb-3 font-display text-2xl font-black tracking-tight text-charcoal">
          How Feastpot works
        </h2>
        <ol className="space-y-2 text-sm font-medium text-charcoal md:text-base">
          <li>
            <strong className="font-bold text-charcoal">1. Enter your postcode</strong> — we show the {cuisine} vendors covering your area.
          </li>
          <li>
            <strong className="font-bold text-charcoal">2. Pick a tray or family portion</strong> — most vendors take orders 24–72 hours ahead.
          </li>
          <li>
            <strong className="font-bold text-charcoal">3. Pay securely with Stripe</strong> — we hold the funds until your order is fulfilled.
          </li>
          <li>
            <strong className="font-bold text-charcoal">4. Track delivery</strong> — get push and WhatsApp updates from the vendor.
          </li>
        </ol>
      </section>

      <section aria-labelledby="vendors">
        <h2 id="vendors" className="mb-4 font-display text-2xl font-black tracking-tight text-charcoal">
          {cuisine} vendors in London
        </h2>
        {vendors.length === 0 ? (
          <p className="text-sm font-medium text-charcoal-mid">
            We&apos;re onboarding new {cuisine} vendors right now.{' '}
            <Link href="/" className="font-bold text-brand-dark underline underline-offset-2 hover:text-brand">
              Browse the full directory
            </Link>{' '}
            or check back next week.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {vendors.map((v) => (
              <li key={v.id} className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-md">
                <Link href={`/vendors/${v.slug}`} className="block">
                  <p className="font-display text-base font-black text-charcoal">{v.businessName}</p>
                  {v.description ? (
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-charcoal-mid">{v.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs font-bold text-charcoal-mid">
                    <span className="text-plantain">★</span> {v.rating.toFixed(1)} ({v.ratingCount} reviews) · {v.cuisines.join(' · ')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reviews">
        <h2 id="reviews" className="mb-4 font-display text-2xl font-black tracking-tight text-charcoal">
          What customers say
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {CUSTOMER_REVIEWS.map((r) => (
            <blockquote key={r.name} className="rounded-2xl border border-cream-deep bg-cream p-4">
              <p className="text-sm font-medium italic text-charcoal">&ldquo;{r.quote}&rdquo;</p>
              <footer className="mt-2 text-xs font-bold text-charcoal-mid">— {r.name}</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section aria-labelledby="faq">
        <h2 id="faq" className="mb-4 font-display text-2xl font-black tracking-tight text-charcoal">
          Frequently asked questions
        </h2>
        <dl className="space-y-4">
          {faqs.map((f) => (
            <div key={f.question} className="rounded-2xl border border-cream-deep bg-white p-4">
              <dt className="font-bold text-charcoal">{f.question}</dt>
              <dd className="mt-1 text-sm font-medium text-charcoal-mid">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="cta" className="rounded-2xl bg-brand p-6 text-white shadow-lg">
        <h2 id="cta" className="font-display text-xl font-black tracking-tight">
          Ready to order?
        </h2>
        <p className="mt-1 text-sm font-medium text-white/90">
          Enter your postcode on the homepage to see {cuisine} vendors delivering near you tonight or this weekend.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-dark transition hover:bg-cream"
        >
          Browse vendors
        </Link>
      </section>
    </article>
  );
}
