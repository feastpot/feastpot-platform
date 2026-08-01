import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

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
      // The root app/opengraph-image.tsx brand image, made explicit so the
      // og:image tag is guaranteed on these landing pages.
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function OccasionPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isOccasionSlug(slug)) notFound();
  const occasion = OCCASIONS[slug];

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

      {/* The postcode form is the gate: nothing vendor-specific renders on
          this page — cooks, menus, prices and availability all live behind
          the coverage check. */}
      <div className="mt-8 scroll-mt-24" id="occasion-postcode-section">
        <OccasionPostcodeForm />
        <p className="mt-3 text-[13px] font-medium text-charcoal-mid">
          Enter your postcode to see the cooks delivering near you.
        </p>
      </div>

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
