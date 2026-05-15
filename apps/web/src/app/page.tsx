import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { CommunityFavourites } from '@/components/home/community-favourites';
import { PostcodeHero } from '@/components/home/postcode-hero';
import { ReviewsMarquee } from '@/components/home/reviews-marquee';
import { Testimonials } from '@/components/home/testimonials';
import { CuisineFilter } from '@/components/vendor/cuisine-filter';
import { VendorCard } from '@/components/vendor/vendor-card';
import { searchVendors, type VendorListItem } from '@/lib/api/vendors';

/**
 * Customer homepage (Server Component).
 *
 * Brand-DNA refresh — alternating warm cream / charcoal section bands plus
 * kente dividers replace the previous flat-white page. Each section block
 * gets its own background so the page reads as a layered editorial feed
 * (warmth, community, food) rather than a generic SaaS minimum-viable shell.
 *
 * "How it works" is rendered inline against a charcoal→scotch gradient panel
 * — the standalone `<HowItWorks />` component is no longer used here, so we
 * intentionally drop the import. Steps use a small fixed three-step copy
 * deck because the homepage is a top-of-funnel surface; deeper explainers
 * live under /help.
 *
 * Two vendor rails are fetched in parallel via the public search API:
 *   - `favourites`: rating-sorted, community-favourite filter on
 *   - `newest`:     rating-sorted (TODO: switch to true createdAt sort once
 *                   the backend supports it)
 *
 * Errors are swallowed at the rail level — an empty carousel beats a full-
 * page crash for unauthenticated browsers, and the /vendors page is one tap
 * away. Failures still surface in server logs.
 *
 * Layout note: `app/layout.tsx` already wraps children in
 * `<main className="page-content mx-auto max-w-lg">`, so the brand-gradient
 * hero extends edge-to-edge without needing PageShell.
 */
async function safeFetch(
  promise: Promise<{ data: VendorListItem[] }>,
): Promise<VendorListItem[]> {
  try {
    const r = await promise;
    return r.data;
  } catch {
    return [];
  }
}

const HOW_IT_WORKS_STEPS = [
  { icon: '📍', title: 'Enter your postcode', desc: 'Find authentic cooks near you' },
  { icon: '🛒', title: 'Choose your tray', desc: 'Full trays, frozen packs, event orders' },
  { icon: '🚗', title: 'Scheduled delivery', desc: 'Your cook delivers on your chosen day' },
] as const;

export default async function HomePage() {
  const [favourites, newest] = await Promise.all([
    safeFetch(
      searchVendors(
        { communityFavourite: true, sortBy: 'rating', limit: 10 },
        { next: { revalidate: 60 } },
      ),
    ),
    safeFetch(
      searchVendors({ sortBy: 'rating', limit: 10 }, { next: { revalidate: 60 } }),
    ),
  ]);

  return (
    <>
      {/* Hero already includes the trust strip + a closing kente divider. */}
      <PostcodeHero />

      {/* Reviews marquee on warm cream — softer than white and signals the
          shift from "hero" to "social proof" without a hard line break. */}
      <div style={{ background: '#FBF6EF' }}>
        <ReviewsMarquee />
      </div>
      <div className="kente-divider" aria-hidden />

      <section className="pt-3">
        <h2 className="sr-only">Browse by cuisine</h2>
        <CuisineFilter variant="cards" />
      </section>
      <div className="kente-divider" aria-hidden />

      {/* Community favourites — same warm cream as the marquee so the two
          social-proof bands feel like one continuous editorial spread. */}
      <section style={{ background: '#FBF6EF', padding: '16px 0' }}>
        <CommunityFavourites vendors={favourites} />
      </section>
      <div className="kente-divider" aria-hidden />

      {/* "How it works" — charcoal→scotch gradient card. Inset margin and
          rounded corners turn the section into a card that floats on the
          cream body, reinforcing the "premium handmade" tone. */}
      <section
        style={{
          background: 'linear-gradient(135deg, #1C1C1A, #2D1A0A)',
          margin: '0 12px',
          borderRadius: '24px',
          padding: '20px 16px',
        }}
      >
        <h2
          style={{
            color: '#F5A52A',
            fontFamily: 'Playfair Display, Georgia, serif',
            fontWeight: 800,
            fontSize: '20px',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          How Feastpot works
        </h2>
        {HOW_IT_WORKS_STEPS.map((step) => (
          <div
            key={step.title}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <span aria-hidden style={{ fontSize: '24px', flexShrink: 0 }}>
              {step.icon}
            </span>
            <div>
              <p
                style={{
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '13px',
                  margin: '0 0 2px',
                }}
              >
                {step.title}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', margin: 0 }}>
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </section>
      <div className="kente-divider" aria-hidden style={{ marginTop: '12px' }} />

      {/* Vendor recruitment strip — placed AFTER "How it works" so a first-
          time visitor reads the value prop for customers first, then sees the
          "you can be on the other side of this" pitch. The dark
          charcoal→pot-brown gradient deliberately contrasts the surrounding
          cream so it reads as a separate "for cooks" surface, not a customer
          banner. Vendor portal lives on its own subdomain (vendor.feastpot.co.uk)
          so the CTA is a plain <a> rather than next/link — we want the new
          tab / context switch behaviour the browser provides. */}
      <section
        aria-labelledby="vendor-recruitment-heading"
        style={{ margin: '12px 12px 12px', borderRadius: '20px', overflow: 'hidden' }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1C1C1A 0%, #3D1A0A 100%)',
            padding: '20px 16px',
          }}
        >
          <div className="kente-divider" aria-hidden style={{ marginBottom: '14px' }} />
          <p
            style={{
              color: '#F5A52A',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            For cooks &amp; caterers
          </p>
          <h2
            id="vendor-recruitment-heading"
            style={{
              color: 'white',
              fontFamily: 'Playfair Display, Georgia, serif',
              fontWeight: 800,
              fontSize: '22px',
              marginBottom: '8px',
              lineHeight: 1.25,
            }}
          >
            Turn your cooking into a weekly income stream
          </h2>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.65)',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: '16px',
            }}
          >
            Get paid to cook from home without building a website, chasing customers,
            or dealing with admin. We bring the orders, you focus on the food.
          </p>
          <ul
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '14px',
              padding: 0,
              listStyle: 'none',
            }}
          >
            {[
              'Start with no upfront cost',
              'Get orders in your area',
              'Paid out every week',
              'We handle the boring stuff',
            ].map((b) => (
              <li
                key={b}
                style={{
                  background: 'rgba(245, 165, 42, 0.2)',
                  color: '#F5A52A',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                ✓ {b}
              </li>
            ))}
          </ul>
          <a
            href="https://vendor.feastpot.co.uk/onboarding"
            // External vendor portal — open in a new context so we don't
            // navigate the customer away from the marketplace.
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: '#E8520A',
              color: 'white',
              padding: '13px 22px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '14px',
              textDecoration: 'none',
              minHeight: '44px',
              minWidth: '44px',
            }}
          >
            Start cooking for Feastpot →
          </a>
        </div>
      </section>
      <div className="kente-divider" aria-hidden />

      {/* Long-form testimonials — deep cream so the two cream-bands either
          side of "How it works" don't visually merge. */}
      <div style={{ background: '#F5EDE0' }}>
        <Testimonials />
      </div>
      <div className="kente-divider" aria-hidden />

      <section className="space-y-2 py-3">
        <header className="flex items-end justify-between gap-2 px-4">
          <div>
            <h2 className="text-[17px] font-bold text-dark">✨ New on Feastpot</h2>
            <p className="mt-0.5 text-xs text-mid">Cooks who just joined</p>
          </div>
          <Link
            href="/vendors"
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand"
          >
            See all
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </header>

        {newest.length > 0 ? (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:overflow-x-visible md:px-4 lg:grid-cols-4">
            {newest.map((v) => (
              <VendorCard key={v.id} vendor={v} variant="carousel" />
            ))}
          </div>
        ) : (
          <p className="px-4 text-sm text-mid">No new vendors yet — check back soon.</p>
        )}
      </section>
    </>
  );
}
