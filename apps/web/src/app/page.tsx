import { ChevronRight } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { CommunityReviews } from '@/components/home/community-reviews';
import { FavouritesPills } from '@/components/home/favourites-pills';
import { FeastPassStrip } from '@/components/home/feast-pass-strip';
import { HowFeastpotWorks } from '@/components/home/how-feastpot-works';
import { InstagramDmsBlock } from '@/components/home/instagram-dms-block';
import { MarketingNav } from '@/components/home/marketing-nav';
import { OccasionGrid } from '@/components/home/occasion-grid';
import { PostcodeHero } from '@/components/home/postcode-hero';
import { TrustIconStrip } from '@/components/home/trust-icon-strip';
import { VendorCard } from '@/components/vendor/vendor-card';
import { searchVendors, type VendorListItem } from '@/lib/api/vendors';
import { COVERAGE_COOKIE } from '@/lib/postcode';

/**
 * Customer homepage - 2026-05-17 wireframe redesign.
 *
 * Composition (top → bottom):
 *   MarketingNav · PostcodeHero · TrustIconStrip · OccasionGrid ·
 *   HowFeastpotWorks · InstagramDmsBlock · CommunityReviews ·
 *   FavouritesPills · FeastPassStrip
 *
 * The "no vendors before postcode" gate (per the wireframe copy) is
 * preserved: vendor rails only render once the `feastpot.coverage.v1`
 * cookie is present (set by PostcodeHero after a confirmed coverage
 * check). They land between the favourites pills and the FeastPass
 * promos so returning users see relevant kitchens without disrupting
 * the marketing flow above for first-time visitors.
 *
 * The in-app TopNav self-hides on `/` (see top-nav.tsx) - MarketingNav
 * owns the chrome here.
 */
async function safeFetchWithTimeout(
  build: (signal: AbortSignal) => Promise<{ data: VendorListItem[] }>,
): Promise<VendorListItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const r = await build(controller.signal);
    return r.data;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const coveredPostcode = cookieStore.get(COVERAGE_COOKIE)?.value || null;

  const [favourites, featured] = coveredPostcode
    ? await Promise.all([
        safeFetchWithTimeout((signal) =>
          searchVendors(
            { postcode: coveredPostcode, sortBy: 'rating', limit: 8 },
            { next: { revalidate: 60 }, signal },
          ),
        ),
        safeFetchWithTimeout((signal) =>
          searchVendors(
            {
              postcode: coveredPostcode,
              communityFavourite: true,
              sortBy: 'rating',
              limit: 3,
            },
            { next: { revalidate: 60 }, signal },
          ),
        ),
      ])
    : [[], []];

  return (
    <>
      <MarketingNav />
      <PostcodeHero />
      <TrustIconStrip />
      <OccasionGrid />
      <HowFeastpotWorks />
      <InstagramDmsBlock />
      <CommunityReviews />
      <FavouritesPills />

      {coveredPostcode && (
        <>
          {/* Vendor rails - only mount once the coverage cookie is set.
              The "Popular near …" rail uses a snap-x carousel on mobile
              and a 3/4-up grid on desktop so the wireframe's discover
              behaviour survives at narrow widths. */}
          <section
            aria-labelledby="popular-heading"
            className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
          >
            <header className="mb-4 flex items-end justify-between gap-2">
              <h2
                id="popular-heading"
                className="font-display text-[24px] font-black text-charcoal sm:text-[26px]"
              >
                Popular near {coveredPostcode}
              </h2>
              <Link
                href={`/vendors?postcode=${encodeURIComponent(coveredPostcode)}`}
                className="inline-flex items-center gap-0.5 text-sm font-bold text-brand transition-colors hover:text-brand-dark"
              >
                See all
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </header>
            {favourites.length > 0 ? (
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:overflow-x-visible md:px-0 lg:grid-cols-4">
                {favourites.map((v) => (
                  <VendorCard key={v.id} vendor={v} variant="carousel" />
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium text-charcoal-mid">
                No popular kitchens to show right now - check back soon.
              </p>
            )}
          </section>

          {featured.length > 0 && (
            <section
              aria-labelledby="featured-heading"
              className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14"
            >
              <header className="mb-4 flex items-end justify-between gap-2">
                <h2
                  id="featured-heading"
                  className="font-display text-[24px] font-black text-charcoal sm:text-[26px]"
                >
                  Featured kitchens
                </h2>
                <Link
                  href={`/vendors?postcode=${encodeURIComponent(coveredPostcode)}&communityFavourite=true`}
                  className="inline-flex items-center gap-0.5 text-sm font-bold text-brand transition-colors hover:text-brand-dark"
                >
                  See all
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </header>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {featured.map((v) => (
                  <VendorCard key={v.id} vendor={v} variant="carousel" />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <FeastPassStrip />
    </>
  );
}
