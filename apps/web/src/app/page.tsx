import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { CommunityFavourites } from '@/components/home/community-favourites';
import { FeastPassStrip } from '@/components/home/feast-pass-strip';
import { OccasionGrid } from '@/components/home/occasion-grid';
import { PostcodeHero } from '@/components/home/postcode-hero';
import { TrustStripCard } from '@/components/home/trust-strip-card';
import { VendorCard } from '@/components/vendor/vendor-card';
import { searchVendors, type VendorListItem } from '@/lib/api/vendors';

/**
 * Customer homepage — 2026-05-16 wireframe redesign (Wave 1).
 *
 * Section order matches wireframe panel 1:
 *   1. Hero with postcode capture (PostcodeHero)
 *   2. Trust strip card (TrustStripCard)
 *   3. Order for any occasion (OccasionGrid)
 *   4. Popular right now (vendor rail — uses searchVendors)
 *   5. Featured kitchens (3 spotlight tiles — uses searchVendors)
 *   6. FeastPass + Refer-a-friend split strip (FeastPassStrip)
 *
 * Reviews marquee, "How it works" gradient card and dark vendor-
 * recruitment block from the previous design have been removed —
 * wireframe replaces them with the lighter editorial flow above. The
 * vendor recruitment ask now lives in the footer's brand-green panel.
 *
 * Vendor rails fetched in parallel; errors swallowed at rail level so a
 * single bad query never crashes the page for unauthenticated visitors.
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

export default async function HomePage() {
  const [favourites, featured] = await Promise.all([
    safeFetch(
      searchVendors(
        { sortBy: 'rating', limit: 8 },
        { next: { revalidate: 60 } },
      ),
    ),
    safeFetch(
      searchVendors(
        { communityFavourite: true, sortBy: 'rating', limit: 3 },
        { next: { revalidate: 60 } },
      ),
    ),
  ]);

  return (
    <>
      <PostcodeHero />

      {/* Page-shell horizontal padding so the rest of the home flows in a
          consistent gutter. The hero handles its own full-bleed padding. */}
      <div className="mx-auto max-w-5xl px-0 md:px-8">
        <TrustStripCard />
        <OccasionGrid />

        {/* Popular right now — 4-up grid on desktop, snap-x horizontal
            scroll on mobile so the wireframe's "scroll to discover" rail
            behaviour survives at narrow widths. */}
        <section aria-labelledby="popular-heading" className="px-4 pt-8 md:px-0 md:pt-12">
          <header className="mb-4 flex items-end justify-between gap-2">
            <h2 id="popular-heading" className="text-lg font-black text-charcoal md:text-xl">
              Popular right now
            </h2>
            <Link
              href="/vendors"
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
              No popular kitchens to show right now — check back soon.
            </p>
          )}
        </section>

        {/* Featured kitchens — 3-up editorial spotlight on community
            favourites. Reuses VendorCard so we don't fork a third card
            style; the grid layout itself is what makes the row feel
            "featured" rather than "popular rail". */}
        <section aria-labelledby="featured-heading" className="px-4 pt-8 md:px-0 md:pt-12">
          <header className="mb-4 flex items-end justify-between gap-2">
            <h2 id="featured-heading" className="text-lg font-black text-charcoal md:text-xl">
              Featured kitchens
            </h2>
            <Link
              href="/vendors?communityFavourite=true"
              className="inline-flex items-center gap-0.5 text-sm font-bold text-brand transition-colors hover:text-brand-dark"
            >
              See all
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </header>
          {featured.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {featured.map((v) => (
                <VendorCard key={v.id} vendor={v} variant="carousel" />
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-charcoal-mid">
              We&apos;re curating our featured kitchens — popular cooks land here first.
            </p>
          )}
        </section>

        <FeastPassStrip />
      </div>

      {/* CommunityFavourites kept as a final social-proof rail so the
          reviews-heavy section the old design carried doesn't disappear
          entirely. It self-hides when there's no data. */}
      <CommunityFavourites vendors={favourites} />
    </>
  );
}
