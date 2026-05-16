import { ChevronRight, MapPin } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { CommunityFavourites } from '@/components/home/community-favourites';
import { FeastPassStrip } from '@/components/home/feast-pass-strip';
import { OccasionGrid } from '@/components/home/occasion-grid';
import { PostcodeHero } from '@/components/home/postcode-hero';
import { TrustStripCard } from '@/components/home/trust-strip-card';
import { VendorCard } from '@/components/vendor/vendor-card';
import { searchVendors, type VendorListItem } from '@/lib/api/vendors';
import { COVERAGE_COOKIE } from '@/lib/postcode';

/**
 * Customer homepage — 2026-05-17 postcode-first gate.
 *
 * The product rule (from wireframe): no vendor cards, popular rails, or
 * featured kitchens render until the visitor enters a postcode AND we
 * confirm coverage. The cookie `feastpot.coverage.v1` is the server-side
 * signal that coverage was confirmed (set by PostcodeHero after a
 * successful coverage check). Absence of the cookie = pre-postcode view.
 *
 * Section order:
 *   Pre-postcode:  hero (form) · trust · occasion grid · placeholder ·
 *                  FeastPass
 *   Post-postcode: hero (resume) · trust · occasion · popular rail ·
 *                  featured kitchens · FeastPass · community favourites
 *
 * Vendor data is only fetched when the cookie is present, so anonymous
 * visitors never trigger the search API just to render a homepage they
 * won't see vendors on.
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
      <PostcodeHero />

      <div className="mx-auto max-w-5xl px-0 md:px-8">
        <TrustStripCard />
        <OccasionGrid />

        {coveredPostcode ? (
          <>
            {/* Popular right now — 4-up grid on desktop, snap-x horizontal
                scroll on mobile so the wireframe's "scroll to discover" rail
                behaviour survives at narrow widths. */}
            <section
              aria-labelledby="popular-heading"
              className="px-4 pt-8 md:px-0 md:pt-12"
            >
              <header className="mb-4 flex items-end justify-between gap-2">
                <h2
                  id="popular-heading"
                  className="text-lg font-black text-charcoal md:text-xl"
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
                  No popular kitchens to show right now — check back soon.
                </p>
              )}
            </section>

            <section
              aria-labelledby="featured-heading"
              className="px-4 pt-8 md:px-0 md:pt-12"
            >
              <header className="mb-4 flex items-end justify-between gap-2">
                <h2
                  id="featured-heading"
                  className="text-lg font-black text-charcoal md:text-xl"
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
          </>
        ) : (
          // Pre-postcode placeholder. Reinforces the gate without faking
          // vendor data, and gives the user a second nudge to scroll back
          // up to the hero form.
          <section
            aria-labelledby="gate-heading"
            className="mt-8 px-4 md:mt-12 md:px-0"
          >
            <div className="rounded-3xl border border-cream-deep bg-white p-6 text-center shadow-card md:p-10">
              <span
                aria-hidden
                className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand"
              >
                <MapPin className="h-7 w-7" />
              </span>
              <h2
                id="gate-heading"
                className="mt-4 font-display text-2xl font-black text-charcoal md:text-3xl"
              >
                Enter your postcode to see what&rsquo;s cooking
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium text-charcoal-mid md:text-base">
                Popular kitchens, featured cooks and what&rsquo;s available right now all unlock once we know where to deliver.
              </p>
              {/* Scrolls back to the hero — `#hero-headline` is always
                  rendered (resume banner OR form), so the anchor never
                  dead-ends. */}
              <a
                href="#hero-headline"
                className="mt-5 inline-flex items-center rounded-2xl bg-brand px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-brand-dark"
              >
                Check your postcode
              </a>
            </div>
          </section>
        )}

        <FeastPassStrip />
      </div>

      {coveredPostcode && favourites.length > 0 && (
        <CommunityFavourites vendors={favourites} />
      )}
    </>
  );
}
