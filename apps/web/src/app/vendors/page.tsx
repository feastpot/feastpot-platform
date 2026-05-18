'use client';

import { Search, WifiOff } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { VendorCardSkeleton } from '@/components/vendor/vendor-card-skeleton';
import { CategoryChips } from '@/components/vendors/category-chips';
import { VendorFiltersSidebar } from '@/components/vendors/vendor-filters-sidebar';
import { VendorResultsHeader } from '@/components/vendors/vendor-results-header';
import { VendorResultsHero } from '@/components/vendors/vendor-results-hero';
import { VendorRowCard } from '@/components/vendors/vendor-row-card';
import { VendorSearchBar } from '@/components/vendors/vendor-search-bar';
import { useVendors } from '@/hooks/use-vendors';
import type { SearchVendorsParams, VendorSortBy } from '@/lib/api/vendors';
import { readStoredPostcode, writeCoverageCookie, writeStoredPostcode } from '@/lib/postcode';

/**
 * Vendor search page - wireframe layout:
 *   • Green/cream delivery banner with "Change postcode" CTA
 *   • Pill search bar + category chip rail
 *   • Two-column on lg+: left filter sidebar / right results
 *
 * URL is the source of truth for every filter so:
 *   /vendors?q=jollof&postcode=SE15&cuisine=Nigerian&halal=true&sort=rating
 * is a shareable, refresh-safe permalink and the back button restores state.
 *
 * Category chips write `?category=`; when the user hasn't typed a free-text
 * query, that category is passed to the API as `q` (closest existing facet
 * until the backend ships a real category filter).
 */
function VendorSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const qParam = params?.get('q')?.trim() || undefined;
  const category = params?.get('category')?.trim() || undefined;
  const q = qParam ?? category;
  const postcode = params?.get('postcode') ?? undefined;
  const cuisineParam = params?.get('cuisine');

  // Postcode persistence - two-way sync between the URL (which is the
  // source of truth for filters so links stay shareable) and localStorage
  // (so a returning user who lands on /vendors directly, e.g. via the
  // bottom-nav "Browse" tab, sees vendors for their remembered location
  // instead of an unfiltered national list).
  //
  // `postcodeSyncResolved` gates the vendor query so we don't fire an
  // initial postcode-less national fetch + then a second filtered fetch a
  // tick later when the storage rehydrate replaces the URL.
  const [postcodeSyncResolved, setPostcodeSyncResolved] = useState<boolean>(() =>
    typeof postcode === 'string' && postcode.length > 0,
  );
  useEffect(() => {
    if (postcode) {
      writeStoredPostcode(postcode);
      // Mirror into the coverage cookie so the home server component can
      // render the vendor rails on the next visit. Landing on /vendors with
      // a postcode implies the user passed the gate (either from the hero
      // coverage check, or via a shared link that already filters to a
      // real area).
      writeCoverageCookie(postcode);
      setPostcodeSyncResolved(true);
      return;
    }
    const saved = readStoredPostcode();
    if (!saved) {
      setPostcodeSyncResolved(true);
      return;
    }
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('postcode', saved);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

  const halal = params?.get('halal') === 'true';
  const dietary = (params?.get('dietary') ?? '').split(',').filter(Boolean);
  // When the user has set a postcode we now have real distances for every
  // vendor row, so default the sort to "distance" so the closest kitchens
  // bubble to the top. An explicit `?sort=` in the URL always wins, so users
  // who picked another order keep it on refresh / share.
  const sortParam = (params?.get('sort') as VendorSortBy | null) ?? undefined;
  const sortBy: VendorSortBy | undefined = sortParam ?? (postcode ? 'distance' : undefined);

  // Radius cap (miles in URL, km on the wire). Only honoured when the user
  // has a postcode set - without one we have no origin to measure from, so a
  // radius value would be meaningless. Validated against the same option set
  // the sidebar offers so a hand-rolled `?radius=999` URL doesn't sneak past.
  const RADIUS_OPTIONS_MI = [1, 3, 5, 10] as const;
  const radiusRaw = postcode ? params?.get('radius') : null;
  const radiusMiles = (() => {
    if (!radiusRaw) return null;
    const n = Number.parseFloat(radiusRaw);
    if (!Number.isFinite(n)) return null;
    return (RADIUS_OPTIONS_MI as readonly number[]).includes(n) ? n : null;
  })();
  const maxDistanceKm = radiusMiles !== null ? radiusMiles * 1.609344 : undefined;

  const search: SearchVendorsParams = {
    q,
    postcode,
    cuisine: cuisineParam ? [cuisineParam] : undefined,
    halal: halal || dietary.includes('halal') || undefined,
    maxDistanceKm,
    sortBy,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error, refetch } =
    useVendors(search, { enabled: postcodeSyncResolved });
  const vendors = data?.pages.flatMap((p) => p.data) ?? [];

  // Scroll-position restoration. Next 15's App Router doesn't restore
  // scroll on client-side back navigation, so tapping a vendor card and
  // pressing back drops the user at the top of the list - disorienting
  // when they were 20 cards deep.
  const searchKey = params?.toString() ?? '';
  const scrollKey = `feastpot.vendors-scroll:${pathname}?${searchKey}`;

  useEffect(() => {
    const save = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('a[href^="/vendors/"]')) save();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pagehide', save);
    };
  }, [scrollKey]);

  // Hoist the rAF-driven scroll-restore dependencies into refs so the
  // polling loop always reads the freshest TanStack Query state instead of
  // a snapshot from when the effect first ran. Without this, repeated
  // ticks could fire `fetchNextPage()` against a stale `isFetchingNextPage`
  // flag and spam the queue under latency.
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  const fetchNextPageRef = useRef(fetchNextPage);
  hasNextPageRef.current = hasNextPage;
  isFetchingNextPageRef.current = isFetchingNextPage;
  fetchNextPageRef.current = fetchNextPage;

  useEffect(() => {
    if (vendors.length === 0) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;
    const targetY = Number.parseInt(saved, 10);
    if (!Number.isFinite(targetY) || targetY <= 0) {
      sessionStorage.removeItem(scrollKey);
      return;
    }

    let frames = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= targetY) {
        window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior });
        sessionStorage.removeItem(scrollKey);
        return;
      }
      if (hasNextPageRef.current && !isFetchingNextPageRef.current) {
        fetchNextPageRef.current();
      }
      if (++frames < 30) {
        requestAnimationFrame(tick);
      } else {
        window.scrollTo({ top: max, behavior: 'instant' as ScrollBehavior });
        sessionStorage.removeItem(scrollKey);
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [vendors.length, scrollKey]);

  const empty = !isLoading && !error && vendors.length === 0;

  return (
    <PageShell>
      <div className="space-y-5 py-5">
        <VendorResultsHero postcode={postcode ?? null} />

        <VendorSearchBar />

        <CategoryChips />

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <VendorFiltersSidebar />
          </div>

          <div className="space-y-4">
            <VendorResultsHeader
              count={vendors.length}
              postcode={postcode ?? null}
              loading={isLoading}
            />

            {/* Mobile: collapsed filter button that opens the sidebar inline. */}
            <details className="rounded-2xl border border-cream-deep bg-white shadow-sm lg:hidden">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-charcoal">
                Filters
              </summary>
              <div className="border-t border-cream-deep p-2">
                <VendorFiltersSidebar />
              </div>
            </details>

            {isLoading && (
              <div role="status" aria-live="polite">
                <span className="sr-only">Loading vendors</span>
                <ul aria-hidden="true" className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i}>
                      <VendorCardSkeleton />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex flex-col items-center rounded-3xl border border-cream-deep bg-white px-6 py-12 text-center shadow-card"
              >
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-scotch/10 text-scotch" aria-hidden>
                  <WifiOff className="h-7 w-7" strokeWidth={2.25} />
                </span>
                <h3 className="mb-2 font-display text-xl font-black text-charcoal">
                  Couldn&rsquo;t reach our kitchens
                </h3>
                <p className="mx-auto mb-5 max-w-[280px] text-[13px] font-medium leading-relaxed text-charcoal-mid">
                  This usually fixes itself in a few seconds.
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="touch-target rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  Try again
                </button>
              </div>
            )}

            {empty && q && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-cream-deep bg-white px-6 py-16 text-center shadow-card">
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand" aria-hidden>
                  <Search className="h-7 w-7" strokeWidth={2.25} />
                </span>
                <h2 className="mb-2 font-display text-xl font-black text-charcoal">
                  No results for &ldquo;{q}&rdquo;
                </h2>
                <p className="mb-5 max-w-[300px] text-sm font-medium text-charcoal-mid">
                  {postcode
                    ? `Try a different dish name or browse all kitchens near ${postcode.toUpperCase()}.`
                    : 'Try a different search term or browse all kitchens.'}
                </p>
                <button
                  type="button"
                  onClick={() => router.replace('/vendors')}
                  className="touch-target rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  Browse all kitchens
                </button>
              </div>
            )}

            {empty && !q && (
              <div className="rounded-3xl border border-cream-deep bg-white p-8 text-center shadow-card">
                <h2 className="font-display text-lg font-black text-charcoal">
                  No kitchens{postcode ? ` near ${postcode.toUpperCase()}` : ''} yet
                </h2>
                <p className="mt-2 text-sm font-medium text-charcoal-mid">
                  Try a different cuisine or check back soon - new cooks join Feastpot every week.
                </p>
              </div>
            )}

            {vendors.length > 0 && (
              <ul className="space-y-3">
                {vendors.map((v) => (
                  <li key={v.id}>
                    <VendorRowCard vendor={v} />
                  </li>
                ))}
              </ul>
            )}

            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="touch-target w-full rounded-xl border border-cream-deep bg-white py-3 text-sm font-bold text-charcoal transition-colors hover:bg-brand-light hover:text-brand-dark disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more kitchens'}
              </button>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="space-y-5 py-5" role="status" aria-live="polite">
            <span className="sr-only">Loading vendors</span>
            <div aria-hidden="true" className="h-32 rounded-3xl bg-cream" />
            <div aria-hidden="true" className="h-14 rounded-2xl bg-cream" />
            <div aria-hidden="true" className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="hidden h-96 rounded-3xl bg-cream lg:block" />
              <ul className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i}>
                    <VendorCardSkeleton />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PageShell>
      }
    >
      <VendorSearch />
    </Suspense>
  );
}
