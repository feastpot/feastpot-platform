import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { CommunityFavourites } from '@/components/home/community-favourites';
import { HowItWorks } from '@/components/home/how-it-works';
import { PostcodeHero } from '@/components/home/postcode-hero';
import { CuisineFilter } from '@/components/vendor/cuisine-filter';
import { VendorCard } from '@/components/vendor/vendor-card';
import { searchVendors, type VendorListItem } from '@/lib/api/vendors';

/**
 * Customer homepage (Server Component).
 *
 * Two vendor rails are fetched in parallel via the public search API:
 *   - `favourites`: rating-sorted, community-favourite filter on
 *   - `newest`:     rating-sorted (TODO: switch to true createdAt sort
 *                   once the backend supports it; for now this is the
 *                   closest stable proxy)
 *
 * Errors are swallowed at the rail level — an empty carousel is far less
 * jarring than a full-page crash for an unauthenticated browser, and the
 * /vendors page is one tap away. Failures still surface in server logs.
 *
 * Layout note: `app/layout.tsx` already wraps children in
 * `<main className="page-content mx-auto max-w-lg">`, so we do NOT use
 * `PageShell` here — that would double-wrap and add horizontal padding that
 * prevents the brand-gradient hero from extending edge-to-edge.
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
      <PostcodeHero />

      <section className="pt-2">
        <h2 className="sr-only">Browse by cuisine</h2>
        <CuisineFilter />
      </section>

      <CommunityFavourites vendors={favourites} />

      <HowItWorks />

      <section className="space-y-2 py-2">
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
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
