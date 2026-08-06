import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TrustStandard } from '@/components/home/trust-standard';
import { OccasionPostcodeForm } from '@/components/occasions/occasion-postcode-form';
import { isOccasionSlug, OCCASION_SLUGS, OCCASIONS } from '@/lib/occasions';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// All eight occasion pages are statically generated; anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return OCCASION_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isOccasionSlug(slug)) return {};
  const occasion = OCCASIONS[slug];
  const canonical = `${SITE_URL}/occasions/${slug}`;
  return {
    title: occasion.metaTitle,
    description: occasion.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: occasion.metaTitle,
      description: occasion.metaDescription,
      url: canonical,
      type: 'website',
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

/**
 * Bundle serving bands shown on every occasion page.
 * Bands 1-3 link to /vendors (the postcode gate on the vendors page handles
 * coverage checks; stored postcode from localStorage is picked up automatically).
 * Band 4 links to /catering with the occasion pre-selected.
 */
interface BundleBand {
  label: string;
  subtitle: string;
  href: (slug: string) => string;
  cta: string;
  highlight?: boolean;
}

const BUNDLE_BANDS: BundleBand[] = [
  {
    label: 'Small gathering',
    subtitle: 'feeds 5 to 10',
    href: () => '/vendors',
    cta: 'Find vendors near me',
  },
  {
    label: 'Family party',
    subtitle: 'feeds 10 to 20',
    href: () => '/vendors',
    cta: 'Find vendors near me',
  },
  {
    label: 'Big celebration',
    subtitle: 'feeds 20 to 40',
    href: () => '/vendors',
    cta: 'Find vendors near me',
  },
  {
    label: 'Full event',
    subtitle: '40 or more guests',
    href: (slug) => `/catering?occasion=${encodeURIComponent(slug)}`,
    cta: 'Request catering help',
    highlight: true,
  },
];

export default async function OccasionPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isOccasionSlug(slug)) notFound();
  const occasion = OCCASIONS[slug];

  // FAQPage JSON-LD - generated from the same FAQ data rendered below so
  // the structured data always matches visible page content exactly.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: occasion.faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        // JSON.stringify output of our own static content only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ── Hero / intro (unchanged) ─────────────────────────────────── */}
      <h1 className="font-display text-[32px] font-black leading-[1.08] tracking-tight text-charcoal sm:text-[40px]">
        {occasion.h1}
      </h1>

      <div className="mt-5 max-w-2xl space-y-4">
        {occasion.intro.map((paragraph) => (
          <p
            key={paragraph.slice(0, 32)}
            className="text-[15px] font-medium leading-relaxed text-charcoal-mid"
          >
            {paragraph}
          </p>
        ))}
      </div>

      {/* ── Postcode gate (unchanged) ────────────────────────────────── */}
      <div className="mt-8 scroll-mt-24" id="occasion-postcode-section">
        <OccasionPostcodeForm />
        <p className="mt-3 text-[13px] font-medium text-charcoal-mid">
          Enter your postcode to see the cooks delivering near you.
        </p>
      </div>

      {/* ── Bundle cards ─────────────────────────────────────────────── */}
      <section aria-labelledby="bundles-heading" className="mt-12">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          How many are you feeding?
        </p>
        <h2
          id="bundles-heading"
          className="mt-1 font-display text-[22px] font-black leading-tight text-charcoal"
        >
          Choose a size for your gathering
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BUNDLE_BANDS.map((band) => (
            <li key={band.label}>
              <Link
                href={band.href(slug)}
                className={`group flex flex-col rounded-2xl border-2 p-5 transition-colors ${
                  band.highlight
                    ? 'border-brand bg-brand-light/50 hover:bg-brand-light'
                    : 'border-cream-deep bg-white hover:border-brand/40 hover:bg-cream/60'
                }`}
              >
                <span
                  className={`text-[15px] font-black ${
                    band.highlight ? 'text-brand-dark' : 'text-charcoal'
                  }`}
                >
                  {band.label}
                </span>
                <span className="mt-0.5 text-[13px] font-medium text-charcoal-mid">
                  {band.subtitle}
                </span>
                <span
                  className={`mt-3 inline-flex items-center text-[13px] font-bold transition-colors ${
                    band.highlight
                      ? 'text-brand group-hover:text-brand-dark'
                      : 'text-charcoal-mid group-hover:text-brand'
                  }`}
                >
                  {band.cta} &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Recommended cuisines strip ───────────────────────────────── */}
      {occasion.recommendedCuisines.length > 0 && (
        <section aria-labelledby="cuisines-heading" className="mt-10">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            Popular choices
          </p>
          <h2
            id="cuisines-heading"
            className="mt-1 font-display text-[22px] font-black leading-tight text-charcoal"
          >
            Explore by cuisine
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2.5">
            {occasion.recommendedCuisines.map((cuisine) => (
              <li key={cuisine}>
                <Link
                  href={`/vendors?cuisine=${encodeURIComponent(cuisine)}`}
                  className="inline-flex items-center rounded-full border border-cream-deep bg-white px-4 py-2 text-[13px] font-bold text-charcoal shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-light hover:text-brand-dark"
                >
                  {cuisine}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Trust strip ──────────────────────────────────────────────── */}
      <div className="mt-10 -mx-4 sm:-mx-6 lg:-mx-8">
        <TrustStandard />
      </div>

      {/* ── FAQs (unchanged) ─────────────────────────────────────────── */}
      <section aria-labelledby="occasion-faq-heading" className="mt-12">
        <h2
          id="occasion-faq-heading"
          className="font-display text-[24px] font-black leading-tight text-charcoal"
        >
          Frequently asked questions
        </h2>
        <dl className="mt-5 space-y-5">
          {occasion.faqs.map((faq) => (
            <div
              key={faq.question}
              className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
            >
              <dt className="text-[15px] font-bold text-charcoal">{faq.question}</dt>
              <dd className="mt-2 text-[14px] font-medium leading-relaxed text-charcoal-mid">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
